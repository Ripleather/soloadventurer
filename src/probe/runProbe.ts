// Korte proef met een echt model: een goblin valt Milly aan. Het model moet de aanval via de
// engine-tool laten rollen en daarna de uitkomst beschrijven. Draait volledig in de browser.
import { addCombatant, createCombat, type CombatState } from '../engine/combat'
import { houseRules } from '../engine/rules'
import type { Rng } from '../engine/rng'
import { attackInputSchema, executeAttack } from '../engine/tools'
import {
  ProviderError,
  type Message,
  type Provider,
  type ToolCall,
  type ToolDefinition,
} from '../providers/types'

export const PROBE_SYSTEM = [
  'Je bent de Dungeon Master in een solo-spel D&D 5e (2014). Schrijf in het Nederlands.',
  'De speler speelt Milly (AC 15) en rolt altijd zelf. Rol nooit voor Milly.',
  'Voor vijanden rol je nooit zelf en verzin je geen uitkomsten: gebruik de tool enemy_attack.',
  'Gebruik in de tool precies de waarden uit het statblock. Beschrijf pas na het resultaat wat er',
  'gebeurt, kort en filmisch, en eindig met een vraag aan de speler.',
].join(' ')

const PROBE_SCENE = [
  'Scène: Milly loopt door een smalle gang in een verlaten tempel.',
  'Statblock: Goblin (id "goblin"), AC 15, 7 HP, Scimitar: +4 to hit, 1d6+2 slashing.',
  'De goblin springt uit een nis en valt Milly aan met zijn scimitar. Handel zijn aanval af.',
].join('\n')

const attackTool: ToolDefinition = {
  name: 'enemy_attack',
  description:
    'Laat de engine een aanval van een vijand of NPC rollen. Geeft het aanvalstotaal, of het raakt en de schade terug.',
  inputSchema: attackInputSchema,
}

export type ProbeEvent =
  | { type: 'request'; turn: number }
  | { type: 'narration'; content: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'tool_result'; toolCallId: string; content: string; isError: boolean }
  | { type: 'done'; reason: 'narration' | 'max_turns' }
  | { type: 'error'; kind: string; message: string }

export type ProbeOptions = {
  provider: Provider
  model: string
  rng: Rng
  onEvent: (event: ProbeEvent) => void
  maxTurns?: number
  signal?: AbortSignal
}

function startState(): CombatState {
  return [
    {
      kind: 'player' as const,
      id: 'milly',
      name: 'Milly',
      initiative: 14,
      dexMod: 2,
    },
    {
      kind: 'enemy' as const,
      id: 'goblin',
      name: 'Goblin',
      initiative: 16,
      dexMod: 2,
      ac: 15,
      hp: { current: 7, max: 7 },
      conditions: [],
    },
  ].reduce(addCombatant, createCombat())
}

function executeTool(state: CombatState, call: ToolCall, rng: Rng) {
  try {
    if (call.parseError) throw new Error(call.parseError)
    if (call.name !== 'enemy_attack') throw new Error(`Onbekende tool "${call.name}"`)
    return {
      content: JSON.stringify(executeAttack(state, call.input, rng, houseRules)),
      isError: false,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { content: `FOUT: ${message}`, isError: true }
  }
}

export async function runProbe(options: ProbeOptions): Promise<void> {
  const { provider, model, rng, onEvent, signal } = options
  const maxTurns = options.maxTurns ?? 4
  const state = startState()
  const messages: Message[] = [{ role: 'user', content: PROBE_SCENE }]

  try {
    for (let turn = 1; turn <= maxTurns; turn++) {
      onEvent({ type: 'request', turn })
      const response = await provider.chat(
        { model, system: PROBE_SYSTEM, messages, tools: [attackTool], maxTokens: 800 },
        { signal },
      )
      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
        providerData: response.providerData,
      })
      if (response.content.trim() !== '') onEvent({ type: 'narration', content: response.content })
      if (response.toolCalls.length === 0) {
        onEvent({ type: 'done', reason: 'narration' })
        return
      }
      for (const call of response.toolCalls) {
        onEvent({ type: 'tool_call', call })
        const result = executeTool(state, call, rng)
        onEvent({ type: 'tool_result', toolCallId: call.id, ...result })
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          toolName: call.name,
          content: result.content,
          isError: result.isError,
        })
      }
    }
    onEvent({ type: 'done', reason: 'max_turns' })
  } catch (error) {
    if (error instanceof ProviderError) {
      onEvent({ type: 'error', kind: error.kind, message: error.message })
    } else {
      onEvent({
        type: 'error',
        kind: 'unknown',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
