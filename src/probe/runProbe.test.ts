import { describe, expect, it } from 'vitest'
import { createRng } from '../engine/rng'
import {
  ProviderError,
  type ChatRequest,
  type ChatResponse,
  type Provider,
  type StreamEvent,
} from '../providers/types'
import { PROBE_SYSTEM, runProbe, type ProbeEvent } from './runProbe'

/** Provider die vaste antwoorden geeft en elk verzoek bewaart. */
function fakeProvider(...answers: (ChatResponse | Error)[]) {
  const requests: ChatRequest[] = []
  const provider: Provider = {
    async chat(request) {
      requests.push({ ...request, messages: structuredClone(request.messages) })
      const next = answers.shift()
      if (next === undefined) throw new Error('chat vaker aangeroepen dan verwacht')
      if (next instanceof Error) throw next
      return next
    },
    // eslint-disable-next-line require-yield
    async *stream(): AsyncIterable<StreamEvent> {
      throw new Error('niet gebruikt')
    },
  }
  return { provider, requests }
}

const tekst = (content: string): ChatResponse => ({ content, toolCalls: [], finishReason: 'stop' })

function aanval(input: unknown, id = 'call_1'): ChatResponse {
  return {
    content: '',
    toolCalls: [{ id, name: 'enemy_attack', input, rawArguments: JSON.stringify(input) }],
    finishReason: 'tool_calls',
  }
}

const geldigeAanval = {
  attackerId: 'goblin',
  attackBonus: 4,
  targetAc: 15,
  damage: '1d6+2',
  damageType: 'slashing',
}

async function run(provider: Provider, maxTurns?: number) {
  const events: ProbeEvent[] = []
  await runProbe({
    provider,
    model: 'test/model',
    rng: createRng(7),
    onEvent: (e) => events.push(e),
    maxTurns,
  })
  return events
}

describe('runProbe', () => {
  it('stuurt de DM-instructie, de scène en de aanvalstool naar het model', async () => {
    const { provider, requests } = fakeProvider(tekst('De goblin aarzelt.'))
    await run(provider)
    expect(requests[0].model).toBe('test/model')
    expect(requests[0].system).toBe(PROBE_SYSTEM)
    expect(requests[0].messages[0].role).toBe('user')
    expect(requests[0].tools?.map((t) => t.name)).toEqual(['enemy_attack'])
  })

  it('voert een aanval uit in de engine, stuurt het resultaat terug en toont de narratie', async () => {
    const { provider, requests } = fakeProvider(
      aanval(geldigeAanval),
      tekst('De kromzwaard raakt.'),
    )
    const events = await run(provider)

    expect(events.map((e) => e.type)).toEqual([
      'request',
      'tool_call',
      'tool_result',
      'request',
      'narration',
      'done',
    ])
    const result = events.find((e) => e.type === 'tool_result')
    expect(result).toMatchObject({ isError: false })
    expect(JSON.parse((result as { content: string }).content)).toMatchObject({
      attackerId: 'goblin',
      targetAc: 15,
    })

    const tweede = requests[1].messages
    expect(tweede.at(-2)).toMatchObject({ role: 'assistant', toolCalls: [{ id: 'call_1' }] })
    expect(tweede.at(-1)).toMatchObject({
      role: 'tool',
      toolCallId: 'call_1',
      toolName: 'enemy_attack',
      isError: false,
    })
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'narration' })
  })

  it('geeft ongeldige invoer als fout terug zodat het model het opnieuw kan proberen', async () => {
    const { provider, requests } = fakeProvider(
      aanval({ attackerId: 'goblin' }),
      aanval(geldigeAanval, 'call_2'),
      tekst('Raak.'),
    )
    const events = await run(provider)
    const resultaten = events.filter((e) => e.type === 'tool_result')
    expect(resultaten.map((r) => r.isError)).toEqual([true, false])
    expect(requests[1].messages.at(-1)).toMatchObject({ role: 'tool', isError: true })
    expect((requests[1].messages.at(-1) as { content: string }).content).toMatch(/^FOUT:/)
  })

  it('weigert een aanval namens de speler: de speler rolt zelf', async () => {
    const { provider } = fakeProvider(
      aanval({ ...geldigeAanval, attackerId: 'milly' }),
      tekst('Ok.'),
    )
    const events = await run(provider)
    const resultaat = events.find((e) => e.type === 'tool_result')
    expect(resultaat).toMatchObject({ isError: true, content: expect.stringMatching(/speler/) })
  })

  it('geeft een onbekende tool als fout terug', async () => {
    const { provider } = fakeProvider(
      {
        content: '',
        toolCalls: [{ id: 'x', name: 'roll_for_player', input: {} }],
        finishReason: 'tool_calls',
      },
      tekst('Ok.'),
    )
    const events = await run(provider)
    expect(events.find((e) => e.type === 'tool_result')).toMatchObject({
      isError: true,
      content: expect.stringMatching(/roll_for_player/),
    })
  })

  it('stopt na het maximum aantal beurten', async () => {
    const { provider, requests } = fakeProvider(
      aanval(geldigeAanval, 'a'),
      aanval(geldigeAanval, 'b'),
      aanval(geldigeAanval, 'c'),
    )
    const events = await run(provider, 2)
    expect(requests).toHaveLength(2)
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'max_turns' })
  })

  it('meldt een fout van de aanbieder als event en gooit niet', async () => {
    const { provider } = fakeProvider(
      new ProviderError('auth', 'OpenRouter gaf HTTP 401: ongeldige key', 401),
    )
    const events = await run(provider)
    expect(events.at(-1)).toEqual({
      type: 'error',
      kind: 'auth',
      message: 'OpenRouter gaf HTTP 401: ongeldige key',
    })
  })
})
