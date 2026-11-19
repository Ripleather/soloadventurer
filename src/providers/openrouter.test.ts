import { describe, expect, it } from 'vitest'
import { addCombatant, createCombat, type Combatant } from '../engine/combat'
import { houseRules } from '../engine/rules'
import { createRng } from '../engine/rng'
import { attackInputSchema, executeAttack } from '../engine/tools'
import { createOpenRouterProvider, OPENROUTER_URL } from './openrouter'
import { ProviderError, type ChatRequest, type Message, type StreamEvent } from './types'

const API_KEY = 'sk-or-v1-geheim-0123456789abcdef'

type Call = { url: string; init: RequestInit; body: Record<string, unknown> }

/** Fetch-mock die elk verzoek bewaart en de opgegeven antwoorden in volgorde teruggeeft. */
function mockFetch(...responses: (Response | Error)[]) {
  const calls: Call[] = []
  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(input), init, body: JSON.parse(String(init.body)) })
    const next = responses.shift()
    if (next === undefined) throw new Error('fetch vaker aangeroepen dan verwacht')
    if (next instanceof Error) throw next
    return next
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

function provider(fetch: typeof globalThis.fetch) {
  return createOpenRouterProvider({ apiKey: API_KEY, fetch })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function completion(message: Record<string, unknown>, finishReason = 'stop') {
  return json({ choices: [{ message, finish_reason: finishReason }] })
}

type StreamOptions = {
  /** Fout waarmee de stream na de stukken afbreekt. */
  failWith?: unknown
  /** Laat de stream open na de stukken, zoals een verbinding die nog loopt. */
  keepOpen?: boolean
  onCancel?: () => void
}

/** Response met een stream die de opgegeven stukken (tekst of bytes) levert. */
function sse(chunks: (string | Uint8Array)[], options: StreamOptions = {}) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
      }
      if (options.failWith !== undefined) controller.error(options.failWith)
      else if (!options.keepOpen) controller.close()
    },
    cancel() {
      options.onCancel?.()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const data = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`
const delta = (d: Record<string, unknown>, finishReason: string | null = null) =>
  data({ choices: [{ delta: d, finish_reason: finishReason }] })

async function collect(events: AsyncIterable<StreamEvent>) {
  const result: StreamEvent[] = []
  for await (const event of events) result.push(event)
  return result
}

/** Verzamelt events tot de fout en geeft beide terug. */
async function collectUntilError(events: AsyncIterable<StreamEvent>) {
  const received: StreamEvent[] = []
  try {
    for await (const event of events) received.push(event)
  } catch (error) {
    return { received, error }
  }
  throw new Error('verwachtte een fout')
}

const attackTool = {
  name: 'enemy_attack',
  description: 'Aanval van een vijand of NPC.',
  inputSchema: attackInputSchema,
}

const basis: ChatRequest = {
  model: 'anthropic/claude-sonnet-5.5',
  system: 'Je bent de DM.',
  messages: [{ role: 'user', content: 'Ik open de deur.' }],
}

function wireToolCall(id: string, name: string, args: string) {
  return { id, type: 'function', function: { name, arguments: args } }
}

describe('OpenRouter: verzoek', () => {
  it('stuurt naar de OpenRouter-url met de key alleen in de Authorization-header', async () => {
    const { fetch, calls } = mockFetch(completion({ role: 'assistant', content: 'Ok.' }))
    await provider(fetch).chat(basis)

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(OPENROUTER_URL)
    expect(calls[0].init.method).toBe('POST')
    expect(new Headers(calls[0].init.headers).get('Authorization')).toBe(`Bearer ${API_KEY}`)
    expect(JSON.stringify(calls[0].body)).not.toContain(API_KEY)
    expect(calls[0].body.stream).toBe(false)
  })

  it('weigert een lege API-key', () => {
    expect(() => createOpenRouterProvider({ apiKey: '  ' })).toThrow(/API-key/)
  })

  it('zet systeemprompt, model, maximum aantal tokens en berichten om naar het OpenAI-formaat', async () => {
    const { fetch, calls } = mockFetch(completion({ role: 'assistant', content: 'Raak.' }))
    const messages: Message[] = [
      ...basis.messages,
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_1', name: 'enemy_attack', input: { attackerId: 'goblin' } }],
      },
      {
        role: 'tool',
        toolCallId: 'call_1',
        toolName: 'enemy_attack',
        content: '{"outcome":"hit"}',
      },
    ]
    await provider(fetch).chat({ ...basis, messages, maxTokens: 800 })

    expect(calls[0].body.model).toBe('anthropic/claude-sonnet-5.5')
    expect(calls[0].body.max_tokens).toBe(800)
    expect(calls[0].body.messages).toEqual([
      { role: 'system', content: 'Je bent de DM.' },
      { role: 'user', content: 'Ik open de deur.' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [wireToolCall('call_1', 'enemy_attack', '{"attackerId":"goblin"}')],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"outcome":"hit"}' },
    ])
  })

  it('laat systeemprompt en max_tokens weg als ze ontbreken', async () => {
    const { fetch, calls } = mockFetch(completion({ role: 'assistant', content: 'Ok.' }))
    await provider(fetch).chat({ model: 'm', messages: basis.messages })
    expect(calls[0].body.messages).toEqual([{ role: 'user', content: 'Ik open de deur.' }])
    expect(calls[0].body).not.toHaveProperty('max_tokens')
  })

  it('stuurt een afbeelding mee als data-url, zoals de DM-kaart', async () => {
    const { fetch, calls } = mockFetch(completion({ role: 'assistant', content: 'Ok.' }))
    await provider(fetch).chat({
      ...basis,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'De kaart van deze beat.' },
            { type: 'image', mediaType: 'image/png', data: 'iVBORw0KGgo=' },
          ],
        },
      ],
    })
    expect((calls[0].body.messages as unknown[])[1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'De kaart van deze beat.' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
      ],
    })
  })

  it('zet tool-definities om naar JSON Schema, met optionele velden die een default hebben', async () => {
    const { fetch, calls } = mockFetch(completion({ role: 'assistant', content: 'Ok.' }))
    await provider(fetch).chat({ ...basis, tools: [attackTool] })

    const tools = calls[0].body.tools as {
      type: string
      function: { name: string; description: string; parameters: Record<string, unknown> }
    }[]
    expect(tools).toHaveLength(1)
    expect(tools[0].type).toBe('function')
    expect(tools[0].function.name).toBe('enemy_attack')
    expect(tools[0].function.description).toBe('Aanval van een vijand of NPC.')
    const parameters = tools[0].function.parameters
    expect(parameters.type).toBe('object')
    expect(parameters.required).not.toContain('advantage')
    expect(parameters.required).toContain('attackerId')
    expect(parameters.additionalProperties).toBe(false)
    expect(parameters).not.toHaveProperty('$schema')
  })

  it('laat tools weg als er geen zijn', async () => {
    const { fetch, calls } = mockFetch(completion({ role: 'assistant', content: 'Ok.' }))
    await provider(fetch).chat(basis)
    expect(calls[0].body).not.toHaveProperty('tools')
  })

  it('weigert twee tools met dezelfde naam met een ProviderError, zonder iets te versturen', async () => {
    const { fetch, calls } = mockFetch()
    await expect(
      provider(fetch).chat({ ...basis, tools: [attackTool, attackTool] }),
    ).rejects.toMatchObject({
      kind: 'bad_request',
      message: expect.stringContaining('enemy_attack'),
    })
    expect(calls).toHaveLength(0)
  })

  it('geeft het abort-signaal door aan fetch', async () => {
    const { fetch, calls } = mockFetch(completion({ role: 'assistant', content: 'Ok.' }))
    const controller = new AbortController()
    await provider(fetch).chat(basis, { signal: controller.signal })
    expect(calls[0].init.signal).toBe(controller.signal)
  })
})

describe('OpenRouter: antwoord', () => {
  it('leest een tekstantwoord', async () => {
    const { fetch } = mockFetch(completion({ role: 'assistant', content: 'De deur kraakt.' }))
    expect(await provider(fetch).chat(basis)).toEqual({
      content: 'De deur kraakt.',
      toolCalls: [],
      finishReason: 'stop',
    })
  })

  it('leest een tool-aanroep met geparste argumenten', async () => {
    const { fetch } = mockFetch(
      completion(
        {
          role: 'assistant',
          content: null,
          tool_calls: [wireToolCall('call_9', 'enemy_attack', '{"attackerId":"goblin"}')],
        },
        'tool_calls',
      ),
    )
    expect(await provider(fetch).chat(basis)).toEqual({
      content: '',
      toolCalls: [
        {
          id: 'call_9',
          name: 'enemy_attack',
          input: { attackerId: 'goblin' },
          rawArguments: '{"attackerId":"goblin"}',
        },
      ],
      finishReason: 'tool_calls',
    })
  })

  it('markeert ongeldige of niet-object-argumenten, het schema wijst ze af en de ruwe tekst gaat ongewijzigd terug', async () => {
    for (const raw of ['{kapot', '"abc"', '[1,2]', '42']) {
      const { fetch, calls } = mockFetch(
        completion(
          {
            role: 'assistant',
            content: null,
            tool_calls: [wireToolCall('c', 'enemy_attack', raw)],
          },
          'tool_calls',
        ),
        completion({ role: 'assistant', content: 'Ok.' }),
      )
      const p = provider(fetch)
      const { toolCalls } = await p.chat(basis)
      const call = toolCalls[0]
      expect(call.input, raw).toBeUndefined()
      expect(call.parseError, raw).toMatch(/JSON/)
      expect(call.rawArguments).toBe(raw)
      expect(attackInputSchema.safeParse(call.input).success).toBe(false)

      await p.chat({
        ...basis,
        messages: [...basis.messages, { role: 'assistant', content: '', toolCalls }],
      })
      const assistant = (calls[1].body.messages as Record<string, unknown>[]).at(-1)
      expect(assistant).toMatchObject({ tool_calls: [{ function: { arguments: raw } }] })
    }
  })

  it('zet onbekende finish_reasons om naar other en length naar length', async () => {
    const een = mockFetch(completion({ role: 'assistant', content: 'a' }, 'length'))
    expect((await provider(een.fetch).chat(basis)).finishReason).toBe('length')
    const twee = mockFetch(completion({ role: 'assistant', content: 'a' }, 'content_filter'))
    expect((await provider(twee.fetch).chat(basis)).finishReason).toBe('other')
  })

  it('bewaart reasoning_details van het model en stuurt ze terug bij het volgende verzoek', async () => {
    const details = [{ type: 'reasoning.encrypted', data: 'abc', id: 'r1' }]
    const { fetch, calls } = mockFetch(
      completion(
        {
          role: 'assistant',
          content: null,
          reasoning_details: details,
          tool_calls: [wireToolCall('c', 'enemy_attack', '{}')],
        },
        'tool_calls',
      ),
      completion({ role: 'assistant', content: 'Ok.' }),
    )
    const p = provider(fetch)
    const eerste = await p.chat(basis)
    expect(eerste.providerData).toEqual({ reasoning_details: details })

    await p.chat({
      ...basis,
      messages: [
        ...basis.messages,
        {
          role: 'assistant',
          content: '',
          toolCalls: eerste.toolCalls,
          providerData: eerste.providerData,
        },
      ],
    })
    expect((calls[1].body.messages as Record<string, unknown>[]).at(-1)).toMatchObject({
      reasoning_details: details,
    })
  })
})

describe('OpenRouter: tool-aanroep heen en terug', () => {
  it('voert een tool-aanroep uit in de engine en stuurt het resultaat terug', async () => {
    const args = JSON.stringify({
      attackerId: 'goblin',
      attackBonus: 4,
      targetAc: 15,
      damage: '1d6+2',
      damageType: 'slashing',
    })
    const { fetch, calls } = mockFetch(
      completion(
        {
          role: 'assistant',
          content: null,
          tool_calls: [wireToolCall('call_a', 'enemy_attack', args)],
        },
        'tool_calls',
      ),
      completion({ role: 'assistant', content: 'De kromzwaard van de goblin mist je.' }),
    )
    const p = provider(fetch)
    const goblin: Combatant = {
      kind: 'enemy',
      id: 'goblin',
      name: 'Goblin',
      initiative: 12,
      dexMod: 2,
      ac: 15,
      hp: { current: 7, max: 7 },
      conditions: [],
    }
    const state = addCombatant(createCombat(), goblin)

    const eerste = await p.chat({ ...basis, tools: [attackTool] })
    const call = eerste.toolCalls[0]
    const result = executeAttack(state, call.input, createRng(1), houseRules)

    const vervolg: Message[] = [
      ...basis.messages,
      { role: 'assistant', content: eerste.content, toolCalls: eerste.toolCalls },
      {
        role: 'tool',
        toolCallId: call.id,
        toolName: call.name,
        content: JSON.stringify(result),
      },
    ]
    const tweede = await p.chat({ ...basis, messages: vervolg, tools: [attackTool] })

    expect(tweede.content).toBe('De kromzwaard van de goblin mist je.')
    const verzonden = calls[1].body.messages as Record<string, unknown>[]
    expect(verzonden.at(-2)).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [wireToolCall('call_a', 'enemy_attack', args)],
    })
    expect(verzonden.at(-1)).toEqual({
      role: 'tool',
      tool_call_id: 'call_a',
      content: JSON.stringify(result),
    })
  })
})

describe('OpenRouter: streaming', () => {
  it("vraagt om een stream en levert tekst-delta's in volgorde, met done aan het eind", async () => {
    const { fetch, calls } = mockFetch(
      sse([
        delta({ role: 'assistant', content: 'De ' }),
        delta({ content: 'deur ' }),
        delta({ content: 'kraakt.' }),
        delta({}, 'stop'),
        'data: [DONE]\n\n',
      ]),
    )
    const events = await collect(provider(fetch).stream(basis))
    expect(calls[0].body.stream).toBe(true)
    expect(events).toEqual([
      { type: 'text', delta: 'De ' },
      { type: 'text', delta: 'deur ' },
      { type: 'text', delta: 'kraakt.' },
      { type: 'done', finishReason: 'stop' },
    ])
  })

  it('verwerkt regels die over meerdere netwerkstukken zijn verdeeld en negeert commentaar', async () => {
    const volledig = ': OPENROUTER PROCESSING\n\n' + delta({ content: 'Hallo' }) + delta({}, 'stop')
    const stukken = [volledig.slice(0, 7), volledig.slice(7, 40), volledig.slice(40)]
    const { fetch } = mockFetch(sse([...stukken, 'data: [DONE]\n\n']))
    expect(await collect(provider(fetch).stream(basis))).toEqual([
      { type: 'text', delta: 'Hallo' },
      { type: 'done', finishReason: 'stop' },
    ])
  })

  it('verwerkt CRLF-regeleinden', async () => {
    const regel = `data: ${JSON.stringify({ choices: [{ delta: { content: 'Ja' }, finish_reason: 'stop' }] })}\r\n\r\n`
    const { fetch } = mockFetch(sse([regel]))
    expect(await collect(provider(fetch).stream(basis))).toEqual([
      { type: 'text', delta: 'Ja' },
      { type: 'done', finishReason: 'stop' },
    ])
  })

  it('verwerkt een teken van meerdere bytes dat over twee netwerkstukken is verdeeld', async () => {
    const bytes = new TextEncoder().encode(delta({ content: 'Één €' }, 'stop'))
    const midden = bytes.indexOf(0xe2) + 1 // midden in de drie bytes van €
    const { fetch } = mockFetch(sse([bytes.slice(0, midden), bytes.slice(midden)]))
    const events = await collect(provider(fetch).stream(basis))
    expect(events[0]).toEqual({ type: 'text', delta: 'Één €' })
  })

  it('bouwt een tool-aanroep op uit fragmenten en levert hem compleet', async () => {
    const { fetch } = mockFetch(
      sse([
        delta({
          tool_calls: [
            {
              index: 0,
              id: 'call_s',
              type: 'function',
              function: { name: 'enemy_attack', arguments: '' },
            },
          ],
        }),
        delta({ tool_calls: [{ index: 0, function: { arguments: '{"attacker' } }] }),
        delta({ tool_calls: [{ index: 0, function: { arguments: 'Id":"goblin"}' } }] }),
        delta({}, 'tool_calls'),
        'data: [DONE]\n\n',
      ]),
    )
    expect(await collect(provider(fetch).stream(basis))).toEqual([
      {
        type: 'tool_call',
        call: {
          id: 'call_s',
          name: 'enemy_attack',
          input: { attackerId: 'goblin' },
          rawArguments: '{"attackerId":"goblin"}',
        },
      },
      { type: 'done', finishReason: 'tool_calls' },
    ])
  })

  it('plakt een naam die in elk fragment opnieuw meekomt niet aan elkaar', async () => {
    const { fetch } = mockFetch(
      sse([
        delta({
          tool_calls: [{ index: 0, id: 'x', function: { name: 'enemy_attack', arguments: '{' } }],
        }),
        delta({
          tool_calls: [{ index: 0, id: 'x', function: { name: 'enemy_attack', arguments: '}' } }],
        }),
        delta({}, 'tool_calls'),
      ]),
    )
    const events = await collect(provider(fetch).stream(basis))
    expect(events[0]).toMatchObject({
      type: 'tool_call',
      call: { name: 'enemy_attack', input: {} },
    })
  })

  it('levert meerdere tool-aanroepen in de volgorde van hun index', async () => {
    const { fetch } = mockFetch(
      sse([
        delta({
          tool_calls: [
            { index: 1, id: 'b', function: { name: 'tweede', arguments: '{}' } },
            { index: 0, id: 'a', function: { name: 'eerste', arguments: '{}' } },
          ],
        }),
        delta({}, 'tool_calls'),
      ]),
    )
    const events = await collect(provider(fetch).stream(basis))
    expect(events.flatMap((e) => (e.type === 'tool_call' ? [e.call.id] : []))).toEqual(['a', 'b'])
  })

  it('houdt aanroepen zonder index uit elkaar aan de hand van hun id', async () => {
    const { fetch } = mockFetch(
      sse([
        delta({ tool_calls: [{ id: 'a', function: { name: 'eerste', arguments: '{"n":' } }] }),
        delta({ tool_calls: [{ function: { arguments: '1}' } }] }),
        delta({ tool_calls: [{ id: 'b', function: { name: 'tweede', arguments: '{}' } }] }),
        delta({}, 'tool_calls'),
      ]),
    )
    const calls = (await collect(provider(fetch).stream(basis))).flatMap((e) =>
      e.type === 'tool_call' ? [e.call] : [],
    )
    expect(calls.map((c) => [c.id, c.name, c.input])).toEqual([
      ['a', 'eerste', { n: 1 }],
      ['b', 'tweede', {}],
    ])
  })

  it('geeft een ProviderError bij een fout midden in de stream, na de tekst die al binnen was', async () => {
    const { fetch } = mockFetch(
      sse([
        delta({ content: 'Begin' }),
        data({ error: { code: 502, message: `upstream weg, key ${API_KEY}` } }),
      ]),
    )
    const { received, error } = await collectUntilError(provider(fetch).stream(basis))
    expect(received).toEqual([{ type: 'text', delta: 'Begin' }])
    expect(error).toMatchObject({ kind: 'server', status: 502 })
    expect((error as Error).message).not.toContain('sk-or')
  })

  it('geeft een ProviderError als de stream eindigt zonder finish_reason', async () => {
    const { fetch } = mockFetch(sse([delta({ content: 'Afgebr' })]))
    await expect(collect(provider(fetch).stream(basis))).rejects.toMatchObject({
      kind: 'invalid_response',
    })
  })

  it('geeft soort aborted als de speler de stream onderweg afbreekt', async () => {
    const controller = new AbortController()
    controller.abort()
    const { fetch } = mockFetch(
      sse([delta({ content: 'Begin' })], {
        failWith: new DOMException('Afgebroken', 'AbortError'),
      }),
    )
    const { error } = await collectUntilError(
      provider(fetch).stream(basis, { signal: controller.signal }),
    )
    expect(error).toMatchObject({ kind: 'aborted' })
  })

  it('geeft soort network als de verbinding onderweg wegvalt', async () => {
    const { fetch } = mockFetch(
      sse([delta({ content: 'Begin' })], { failWith: new TypeError('network error') }),
    )
    const { error } = await collectUntilError(provider(fetch).stream(basis))
    expect(error).toBeInstanceOf(ProviderError)
    expect(error).toMatchObject({ kind: 'network' })
  })

  it('sluit de verbinding als de aanroeper stopt met lezen', async () => {
    let cancelled = false
    const { fetch } = mockFetch(
      sse([delta({ content: 'Een' }), delta({ content: 'Twee' })], {
        keepOpen: true,
        onCancel: () => (cancelled = true),
      }),
    )
    for await (const event of provider(fetch).stream(basis)) {
      expect(event).toEqual({ type: 'text', delta: 'Een' })
      break
    }
    expect(cancelled).toBe(true)
  })

  it('sluit de verbinding na de finish_reason, ook als de aanbieder nog doorstuurt', async () => {
    let cancelled = false
    const { fetch } = mockFetch(
      sse([delta({ content: 'Klaar' }, 'stop')], {
        keepOpen: true,
        onCancel: () => (cancelled = true),
      }),
    )
    await collect(provider(fetch).stream(basis))
    expect(cancelled).toBe(true)
  })
})

describe('OpenRouter: fouten', () => {
  const gevallen: [number, string][] = [
    [400, 'bad_request'],
    [401, 'auth'],
    [402, 'payment'],
    [403, 'auth'],
    [408, 'server'],
    [429, 'rate_limit'],
    [500, 'server'],
    [503, 'server'],
  ]

  for (const [status, kind] of gevallen) {
    it(`zet HTTP ${status} om naar soort ${kind}, met de boodschap van de aanbieder`, async () => {
      const { fetch } = mockFetch(
        json({ error: { code: status, message: 'iets ging mis' } }, status),
      )
      const fout = await provider(fetch)
        .chat(basis)
        .catch((e: unknown) => e)
      expect(fout).toBeInstanceOf(ProviderError)
      expect(fout).toMatchObject({
        kind,
        status,
        message: expect.stringContaining('iets ging mis'),
      })
    })
  }

  it('geeft soort network als fetch zelf faalt', async () => {
    const { fetch } = mockFetch(new TypeError('Failed to fetch'))
    await expect(provider(fetch).chat(basis)).rejects.toMatchObject({ kind: 'network' })
  })

  it('geeft soort aborted bij afbreken, ook bij een time-out of een eigen reden', async () => {
    const een = mockFetch(new DOMException('Afgebroken', 'AbortError'))
    await expect(provider(een.fetch).chat(basis)).rejects.toMatchObject({ kind: 'aborted' })
    const twee = mockFetch(new DOMException('Te laat', 'TimeoutError'))
    await expect(provider(twee.fetch).chat(basis)).rejects.toMatchObject({ kind: 'aborted' })
    const controller = new AbortController()
    controller.abort('speler stopt')
    const drie = mockFetch(new Error('speler stopt'))
    await expect(
      provider(drie.fetch).chat(basis, { signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'aborted' })
  })

  it('geeft soort aborted als het afbreken gebeurt tijdens het lezen van een gewoon antwoord', async () => {
    const controller = new AbortController()
    controller.abort()
    const { fetch } = mockFetch(
      sse(['{"choices":'], { failWith: new DOMException('Afgebroken', 'AbortError') }),
    )
    await expect(provider(fetch).chat(basis, { signal: controller.signal })).rejects.toMatchObject({
      kind: 'aborted',
    })
  })

  it('geeft soort invalid_response bij een antwoord zonder keuzes of zonder JSON', async () => {
    const zonderKeuzes = mockFetch(json({ choices: [] }))
    await expect(provider(zonderKeuzes.fetch).chat(basis)).rejects.toMatchObject({
      kind: 'invalid_response',
    })
    const geenJson = mockFetch(new Response('<html>oeps</html>', { status: 200 }))
    await expect(provider(geenJson.fetch).chat(basis)).rejects.toMatchObject({
      kind: 'invalid_response',
    })
  })

  it('geeft de foutboodschap van de aanbieder door bij een fout in een 200-antwoord', async () => {
    const zonderKeuze = mockFetch(json({ error: { code: 502, message: 'model onbereikbaar' } }))
    await expect(provider(zonderKeuze.fetch).chat(basis)).rejects.toMatchObject({
      kind: 'server',
      message: expect.stringContaining('model onbereikbaar'),
    })
    const foutKeuze = mockFetch(completion({ role: 'assistant', content: 'half' }, 'error'))
    await expect(provider(foutKeuze.fetch).chat(basis)).rejects.toMatchObject({ kind: 'server' })
  })

  describe('de API-key lekt nooit', () => {
    async function melding(response: Response | Error) {
      const fout = await provider(mockFetch(response).fetch)
        .chat(basis)
        .catch((e: unknown) => e)
      expect(fout).toBeInstanceOf(ProviderError)
      return (fout as ProviderError).message
    }

    it('niet als de aanbieder hem in JSON terugstuurt', async () => {
      expect(
        await melding(json({ error: { message: `Key ${API_KEY} is ongeldig` } }, 401)),
      ).not.toContain('sk-or')
    })

    it('ook niet gedeeltelijk als een lange tekst wordt ingekort', async () => {
      const tekst = `${'x'.repeat(180)} Invalid key ${API_KEY} end`
      expect(await melding(new Response(tekst, { status: 401 }))).not.toContain('sk-or')
    })

    it('niet in een netwerkfout', async () => {
      expect(await melding(new TypeError(`connect failed for ${API_KEY}`))).not.toContain('sk-or')
    })

    it('niet als oorzaak of in de stack', async () => {
      const fout = await provider(mockFetch(new TypeError(`fail ${API_KEY}`)).fetch)
        .chat(basis)
        .then(
          () => new Error('verwachtte een fout'),
          (e: unknown) => e as Error,
        )
      expect(fout.cause).toBeUndefined()
      expect(String(fout.stack)).not.toContain('sk-or')
    })
  })

  it('geeft bij een HTTP-fout in stream-modus dezelfde ProviderError', async () => {
    const { fetch } = mockFetch(json({ error: { message: 'te snel' } }, 429))
    await expect(collect(provider(fetch).stream(basis))).rejects.toMatchObject({
      kind: 'rate_limit',
    })
  })
})
