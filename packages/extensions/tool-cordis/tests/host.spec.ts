import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { Context } from '@deepseek-ai/cordis'
import { CordisInspectRegistryService } from '@deepseek-ai/dsh-cordis-host-runner'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRegistry from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { SERVICE_API } from '../src/api-catalog.ts'
import * as CordisInspectProviders from '../src/host.ts'

/**
 * The Host inspect providers are one process-global set: the host entry
 * registers them beside the registry, and the per-session tool rows only read
 * them. Mounting several presets that carry `tool-cordis` over the shared
 * registry is covered by `apps/cli/tests/web-agent-presets.e2e.ts`.
 */

async function host(): Promise<Context> {
  const ctx = new Context()
  // The tool registry injects `systemPrompt`; nothing under test registers a prompt section.
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRegistry)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(CordisInspectRegistryService, 10_000)
  return ctx
}

describe('the cordis-inspect-providers host entry', () => {
  it('documents optional pre-step timing without exposing provider input contents', () => {
    expect(SERVICE_API.find(service => service.key === 'agentPreStepTiming')).toMatchInlineSnapshot(`
      {
        "description": "Optional elapsed-time instrumentation for a pre-step provider's own work.",
        "key": "agentPreStepTiming",
        "methods": [
          {
            "description": "Measure one operation, excluding delegation to downstream pre-step listeners. Implementations preserve the task's result and rejection, including recording failures.",
            "parameters": [
              {
                "description": "owning agent and current turn/step.",
                "name": "position",
              },
              {
                "description": "public plugin and operation names; never input contents.",
                "name": "operation",
              },
              {
                "description": "provider-owned work to execute once.",
                "name": "task",
              },
            ],
            "returns": "the task's result.",
            "signature": "run<T>(position: { agent: Agent; turn: number; step: number }, operation: { plugin: string; operation: string }, task: () => Promise<T>): Promise<T>",
          },
        ],
        "summary": "Optional elapsed-time instrumentation for a pre-step provider's own work.",
      }
    `)
  })

  it('registers the first-party Host providers and withdraws them on disposal', async () => {
    const ctx = await host()
    const fiber = ctx.plugin(CordisInspectProviders)
    await fiber

    expect(ctx.cordisInspect.list().map(provider => provider.id)).toEqual(['Service', 'Event', 'Config', 'Tool'])

    await fiber.dispose()
    expect(ctx.cordisInspect.list()).toEqual([])
  })
})
