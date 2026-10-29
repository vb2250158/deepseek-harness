/**
 * Fail the real-API e2e job before the build when the key is missing or cannot spend.
 *
 * `GET /models` succeeds for an authenticated key with no balance. Completions then
 * return HTTP 402, and the suite reports that as unrelated assertion failures.
 * One Messages request distinguishes those cases. Output names the HTTP status and
 * model id, and never includes the key, its length, request headers, or the response body.
 * @module
 */

import { pathToFileURL } from 'node:url'
import { PUBLIC_BASE_URL } from '../packages/llm/llm-deepseek/src/config.ts'
import { messagesApiRoot } from '../packages/llm/llm-deepseek/src/messages-api.ts'
import { DEFAULT_MODELS } from '../packages/llm/llm-deepseek/src/models.ts'

/** How long the spend probe waits for the first response bytes. */
const PROBE_TIMEOUT_MS = 20_000

/** Catalog id the product and the e2e profile default both request. */
const PROBE_MODEL = DEFAULT_MODELS[0]?.id

export interface DeepSeekE2ePreflightIo {
  /** Transport. Tests substitute this; the CLI uses global `fetch`. */
  fetch: typeof fetch
  /** One stdout line, without a trailing newline. */
  writeOut: (line: string) => void
  /** One stderr line, without a trailing newline. */
  writeErr: (line: string) => void
}

export interface DeepSeekE2ePreflightRequest {
  /** Trimmed `DEEPSEEK_API_KEY`. Empty means the secret is missing. */
  apiKey: string
  /** Endpoint root, without a trailing slash. */
  baseURL: string
  /** Messages `model` field. */
  model: string
}

interface ProviderErrorFields {
  type: string | undefined
  code: string | undefined
  message: string | undefined
}

/**
 * Resolve the probe from the process environment.
 * @param env - environment the CLI or a test supplies.
 * @returns the key, pinned base URL, and catalog model. An empty key is returned, not thrown.
 */
export function preflightRequestFromEnv(env: NodeJS.ProcessEnv): DeepSeekE2ePreflightRequest {
  if (PROBE_MODEL === undefined) throw new Error('DeepSeek catalog has no model for the e2e spend probe')
  const configured = env.DEEPSEEK_BASE_URL?.trim()
  const baseURL = configured !== undefined && configured.length > 0 ? configured : PUBLIC_BASE_URL
  return {
    apiKey: env.DEEPSEEK_API_KEY?.trim() ?? '',
    baseURL: baseURL.replace(/\/+$/u, ''),
    model: PROBE_MODEL,
  }
}

/**
 * Send one `max_tokens: 1` Messages request and return a process exit code.
 * @param request - key, base URL, and model. An empty key does not call `fetch`.
 * @param io - transport and line writers.
 * @returns `0` when the endpoint accepts the request; `1` when the key is missing,
 * the account cannot spend, or the endpoint rejects the probe.
 */
export async function runDeepSeekE2ePreflight(
  request: DeepSeekE2ePreflightRequest,
  io: DeepSeekE2ePreflightIo,
): Promise<number> {
  if (request.apiKey.length === 0) {
    return fail(io, 'DEEPSEEK_API_KEY is empty. The e2e suite would self-skip and report a false green. Configure the repo secret DEEPSEEK_API_KEY_EXTERNAL.')
  }
  let url: string
  try {
    url = `${messagesApiRoot(request.baseURL)}/messages`
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid base URL'
    return fail(io, `DEEPSEEK_BASE_URL is not a valid endpoint (${redactSecret(detail, request.apiKey)}).`)
  }
  io.writeOut('DEEPSEEK_API_KEY present.')
  let response: Response
  try {
    response = await io.fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: {
        'content-type': 'application/json',
        'accept': 'text/event-stream',
        'anthropic-version': '2023-06-01',
        'x-api-key': request.apiKey,
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: 1,
        stream: true,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error'
    const detail = error instanceof Error ? error.message : 'request failed'
    return fail(io, `DeepSeek spend probe failed before a response (${name}: ${redactSecret(detail, request.apiKey)}).`)
  }
  if (response.ok) {
    try {
      await response.body?.cancel()
    } catch (cancelError) {
      // The status already accepted the probe; a closed stream may reject cancellation.
      void cancelError
    }
    io.writeOut(`DeepSeek spend probe accepted model ${request.model} (HTTP ${response.status}).`)
    return 0
  }
  const fields = providerErrorFields(await response.text(), request.apiKey)
  if (isInsufficientBalance(response.status, fields)) {
    return fail(io, `DeepSeek account behind DEEPSEEK_API_KEY_EXTERNAL has no spendable balance (HTTP ${response.status}). GET /models can still succeed. Top up that account and rerun E2E; skipping the suite would report a false green.`)
  }
  if (response.status === 401 || response.status === 403) {
    return fail(io, `DeepSeek spend probe was rejected (HTTP ${response.status}). DEEPSEEK_API_KEY is present but the endpoint did not accept it.`)
  }
  const detail = [
    fields.type === undefined ? '' : ` type=${fields.type}`,
    fields.code === undefined ? '' : ` code=${fields.code}`,
    fields.message === undefined ? '' : ` message=${fields.message}`,
  ].join('')
  return fail(io, `DeepSeek spend probe failed (HTTP ${response.status}${detail}).`)
}

function fail(io: DeepSeekE2ePreflightIo, message: string): number {
  io.writeErr(`::error::${message}`)
  return 1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function providerErrorFields(text: string, secret: string): ProviderErrorFields {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    // Status remains the classifier when the gateway does not return JSON.
    void error
    return { type: undefined, code: undefined, message: undefined }
  }
  if (!isRecord(parsed)) return { type: undefined, code: undefined, message: undefined }
  const nested = isRecord(parsed.error) ? parsed.error : parsed
  return {
    type: stringField(nested, 'type') ?? stringField(parsed, 'type'),
    code: stringField(nested, 'code') ?? stringField(parsed, 'code'),
    message: redactSecret(stringField(nested, 'message') ?? stringField(parsed, 'message') ?? '', secret) || undefined,
  }
}

function isInsufficientBalance(status: number, fields: ProviderErrorFields): boolean {
  return status === 402
    || fields.type === 'insufficient_balance'
    || fields.type === 'insufficient_balance_error'
    || fields.code === 'insufficient_balance'
    || (fields.message !== undefined && /insufficient balance/iu.test(fields.message))
}

/** Strip a credential and annotation-breaking newlines from text that may be printed. */
function redactSecret(text: string, secret: string): string {
  let redacted = text.replaceAll('\r', ' ').replaceAll('\n', ' ').replaceAll('::', ' ')
  if (secret.length > 0) redacted = redacted.replaceAll(secret, '[redacted]')
  return redacted.replace(/sk-[A-Za-z0-9_-]{8,}/gu, '[redacted]').slice(0, 180)
}

function isDirectExecution(): boolean {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isDirectExecution()) {
  runDeepSeekE2ePreflight(preflightRequestFromEnv(process.env), {
    fetch: globalThis.fetch,
    writeOut: (line) => { process.stdout.write(`${line}\n`) },
    writeErr: (line) => { process.stderr.write(`${line}\n`) },
  }).then((code) => {
    process.exitCode = code
  }, (error: unknown) => {
    const detail = error instanceof Error ? error.message : 'preflight failed'
    process.stderr.write(`::error::${redactSecret(detail, process.env.DEEPSEEK_API_KEY ?? '')}\n`)
    process.exitCode = 1
  })
}
