/** The e2e spend probe fails before the suite when the key is missing or cannot spend, and never prints the key. */
import { describe, expect, it, vi } from 'vitest'
import { PUBLIC_BASE_URL } from '../packages/llm/llm-deepseek/src/config.ts'
import { messagesApiRoot } from '../packages/llm/llm-deepseek/src/messages-api.ts'
import { DEFAULT_MODELS } from '../packages/llm/llm-deepseek/src/models.ts'
import {
  preflightRequestFromEnv,
  runDeepSeekE2ePreflight,
  type DeepSeekE2ePreflightIo,
  type DeepSeekE2ePreflightRequest,
} from './e2e-api-preflight.ts'

const KEY = 'sk-preflight-sentinel-do-not-print'
const MODEL = DEFAULT_MODELS[0]?.id ?? 'deepseek-flash'

function capture(): { io: DeepSeekE2ePreflightIo; out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  return {
    out,
    err,
    io: {
      fetch: vi.fn<typeof fetch>(),
      writeOut: (line) => { out.push(line) },
      writeErr: (line) => { err.push(line) },
    },
  }
}

function request(overrides: Partial<DeepSeekE2ePreflightRequest> = {}): DeepSeekE2ePreflightRequest {
  return {
    apiKey: KEY,
    baseURL: 'https://api.deepseek.com/anthropic',
    model: MODEL,
    ...overrides,
  }
}

describe('DeepSeek e2e API preflight', () => {
  it('uses the public Messages endpoint and the catalog model when the environment is unset', () => {
    expect(preflightRequestFromEnv({})).toEqual({
      apiKey: '',
      baseURL: PUBLIC_BASE_URL.replace(/\/+$/u, ''),
      model: MODEL,
    })
    expect(preflightRequestFromEnv({
      DEEPSEEK_API_KEY: `  ${KEY}  `,
      DEEPSEEK_BASE_URL: ' https://probe.example/anthropic/ ',
    })).toEqual({
      apiKey: KEY,
      baseURL: 'https://probe.example/anthropic',
      model: MODEL,
    })
    expect(messagesApiRoot(`${PUBLIC_BASE_URL}/`)).toBe(`${PUBLIC_BASE_URL.replace(/\/+$/u, '')}/v1`)
  })

  it('fails a missing key before any request', async () => {
    const { io, out, err } = capture()
    await expect(runDeepSeekE2ePreflight(request({ apiKey: '   '.trim() }), io)).resolves.toBe(1)
    expect(io.fetch).not.toHaveBeenCalled()
    expect(out).toEqual([])
    expect(err.join('\n')).toContain('DEEPSEEK_API_KEY_EXTERNAL')
    expect(err.join('\n')).not.toContain(KEY)
  })

  it('accepts one streamed Messages request and does not print the body or the key', async () => {
    const { io, out, err } = capture()
    const body = new Response(`data: ${KEY}\n\n`, { status: 200 })
    const text = vi.spyOn(body, 'text').mockRejectedValue(new Error('body was read'))
    vi.mocked(io.fetch).mockResolvedValue(body)
    await expect(runDeepSeekE2ePreflight(request({ baseURL: 'https://probe.example/anthropic/' }), io)).resolves.toBe(0)
    expect(text).not.toHaveBeenCalled()
    expect(err).toEqual([])
    expect(out.join('\n')).toContain('DEEPSEEK_API_KEY present.')
    expect(out.join('\n')).toContain(`accepted model ${MODEL} (HTTP 200)`)
    expect(out.join('\n')).not.toContain(KEY)
    const call = vi.mocked(io.fetch).mock.calls[0]
    if (call === undefined) throw new Error('probe was not sent')
    const [url, init] = call
    expect(url).toBe('https://probe.example/anthropic/v1/messages')
    if (init === undefined || init.method !== 'POST' || init.redirect !== 'error' || typeof init.body !== 'string') {
      throw new Error('probe request is missing its Messages init')
    }
    const headers = new Headers(init.headers)
    expect(headers.get('x-api-key')).toBe(KEY)
    expect(headers.get('anthropic-version')).toBe('2023-06-01')
    expect(headers.get('accept')).toBe('text/event-stream')
    expect(JSON.parse(init.body)).toEqual({
      model: MODEL,
      max_tokens: 1,
      stream: true,
      messages: [{ role: 'user', content: 'ping' }],
    })
  })

  it('keeps an explicit /v1 root', async () => {
    const { io } = capture()
    vi.mocked(io.fetch).mockResolvedValue(new Response(null, { status: 200 }))
    await runDeepSeekE2ePreflight(request({ baseURL: 'https://probe.example/v1/' }), io)
    expect(io.fetch).toHaveBeenCalledWith('https://probe.example/v1/messages', expect.anything())
  })

  it('names a zero balance and redacts the key from the provider message', async () => {
    const { io, out, err } = capture()
    vi.mocked(io.fetch).mockResolvedValue(new Response(JSON.stringify({
      message: `Insufficient Balance (${KEY})`,
      type: 'insufficient_balance_error',
      code: 'invalid_request_error',
    }), { status: 402 }))
    await expect(runDeepSeekE2ePreflight(request(), io)).resolves.toBe(1)
    expect(out).toEqual(['DEEPSEEK_API_KEY present.'])
    expect(err.join('\n')).toContain('no spendable balance')
    expect(err.join('\n')).toContain('HTTP 402')
    expect(err.join('\n')).not.toContain(KEY)
  })

  it('treats an insufficient-balance payload on a non-402 status as the same account failure', async () => {
    const { io, err } = capture()
    vi.mocked(io.fetch).mockResolvedValue(new Response(JSON.stringify({
      type: 'error',
      error: { type: 'insufficient_balance', message: 'Insufficient Balance' },
    }), { status: 400 }))
    await expect(runDeepSeekE2ePreflight(request(), io)).resolves.toBe(1)
    expect(err.join('\n')).toContain('no spendable balance')
    expect(err.join('\n')).toContain('HTTP 400')
  })

  it('distinguishes an unaccepted key from a zero balance', async () => {
    const { io, err } = capture()
    vi.mocked(io.fetch).mockResolvedValue(new Response(JSON.stringify({
      type: 'authentication_error',
      message: KEY,
    }), { status: 401 }))
    await expect(runDeepSeekE2ePreflight(request(), io)).resolves.toBe(1)
    const text = err.join('\n')
    expect(text).toContain('did not accept it')
    expect(text).not.toContain('no spendable balance')
    expect(text).not.toContain(KEY)
  })

  it('reports other rejections with a redacted provider message', async () => {
    const { io, err } = capture()
    vi.mocked(io.fetch).mockResolvedValue(new Response(JSON.stringify({
      type: 'invalid_request_error',
      code: 'model_not_found',
      message: `unknown model ${KEY}`,
    }), { status: 400 }))
    await expect(runDeepSeekE2ePreflight(request(), io)).resolves.toBe(1)
    const text = err.join('\n')
    expect(text).toContain('HTTP 400')
    expect(text).toContain('type=invalid_request_error')
    expect(text).toContain('code=model_not_found')
    expect(text).toContain('[redacted]')
    expect(text).not.toContain(KEY)
  })

  it('redacts a transport error that echoes the key', async () => {
    const { io, err } = capture()
    vi.mocked(io.fetch).mockRejectedValue(new Error(`connect ${KEY}`))
    await expect(runDeepSeekE2ePreflight(request(), io)).resolves.toBe(1)
    expect(err.join('\n')).toContain('failed before a response')
    expect(err.join('\n')).toContain('[redacted]')
    expect(err.join('\n')).not.toContain(KEY)
  })

  it('rejects a base URL that is not an absolute endpoint', async () => {
    const { io, err } = capture()
    await expect(runDeepSeekE2ePreflight(request({ baseURL: 'not a url' }), io)).resolves.toBe(1)
    expect(io.fetch).not.toHaveBeenCalled()
    expect(err.join('\n')).toContain('DEEPSEEK_BASE_URL')
    expect(err.join('\n')).not.toContain(KEY)
  })
})
