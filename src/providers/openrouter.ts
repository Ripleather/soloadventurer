// Adapter voor OpenRouter (OpenAI-compatibele chat completions). De API-key gaat alleen in de
// Authorization-header naar OPENROUTER_URL en komt nooit in een body of foutmelding.
import { z } from 'zod'
import {
  ProviderError,
  type ChatRequest,
  type ChatResponse,
  type ContentPart,
  type FinishReason,
  type Message,
  type Provider,
  type ProviderErrorKind,
  type RequestOptions,
  type StreamEvent,
  type ToolCall,
  type ToolDefinition,
} from './types'

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export type OpenRouterOptions = {
  apiKey: string
  fetch?: typeof globalThis.fetch
}

type WireToolCall = {
  id?: string
  index?: number
  type?: string
  function?: { name?: string; arguments?: string }
}

type WireError = { code?: number; message?: string }

type WireMessage = {
  content?: string | null
  tool_calls?: WireToolCall[]
  reasoning_details?: unknown
}

export function createOpenRouterProvider(options: OpenRouterOptions): Provider {
  const apiKey = options.apiKey.trim()
  if (apiKey === '') throw new Error('Een API-key is verplicht')
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis)

  /** Haalt de key weg vóór het inkorten, zodat er ook geen deel van de key overblijft. */
  const clean = (text: string, max = 300) => {
    const redacted = text.split(apiKey).join('[key]')
    return redacted.length > max ? `${redacted.slice(0, max)}…` : redacted
  }

  /** Zet elke fout om naar een ProviderError zonder oorzaak, zodat er niets meelift. */
  const toProviderError = (error: unknown, signal: AbortSignal | undefined, context: string) => {
    if (error instanceof ProviderError) return error
    const name = error instanceof Error || error instanceof DOMException ? error.name : ''
    if (signal?.aborted || name === 'AbortError' || name === 'TimeoutError') {
      return new ProviderError('aborted', 'Het verzoek is afgebroken')
    }
    const reason = error instanceof Error ? error.message : String(error)
    return new ProviderError('network', clean(`${context}: ${reason}`))
  }

  async function send(request: ChatRequest, stream: boolean, signal?: AbortSignal) {
    let body: string
    try {
      body = JSON.stringify({ ...toWireRequest(request), stream })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new ProviderError('bad_request', clean(`Ongeldig verzoek: ${reason}`))
    }
    let response: Response
    try {
      response = await doFetch(OPENROUTER_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body,
        signal,
      })
    } catch (error) {
      throw toProviderError(error, signal, 'Geen verbinding met OpenRouter')
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new ProviderError(
        kindForStatus(response.status),
        clean(`OpenRouter gaf HTTP ${response.status}: ${errorMessage(detail)}`),
        response.status,
      )
    }
    return response
  }

  const providerError = (error: WireError, context: string) => {
    const status = typeof error.code === 'number' ? error.code : undefined
    return new ProviderError(
      status ? kindForStatus(status) : 'server',
      clean(`${context}: ${error.message ?? 'onbekende fout'}`),
      status,
    )
  }

  return {
    async chat(request: ChatRequest, opts: RequestOptions = {}): Promise<ChatResponse> {
      const response = await send(request, false, opts.signal)
      let text: string
      try {
        text = await response.text()
      } catch (error) {
        throw toProviderError(error, opts.signal, 'Verbinding met OpenRouter verbroken')
      }
      let payload: { choices?: unknown[]; error?: WireError }
      try {
        payload = JSON.parse(text)
      } catch {
        throw new ProviderError('invalid_response', 'Het antwoord van OpenRouter is geen JSON')
      }
      const choice = payload.choices?.[0] as
        { message?: WireMessage; finish_reason?: string } | undefined
      if (payload.error && !choice) throw providerError(payload.error, 'OpenRouter gaf een fout')
      if (!choice?.message) {
        throw new ProviderError('invalid_response', 'Het antwoord van OpenRouter bevat geen keuze')
      }
      if (choice.finish_reason === 'error') {
        throw providerError(payload.error ?? {}, 'Het model brak het antwoord af met een fout')
      }
      const result: ChatResponse = {
        content: choice.message.content ?? '',
        toolCalls: (choice.message.tool_calls ?? []).map((call) =>
          toToolCall(call.id ?? '', call.function?.name ?? '', call.function?.arguments ?? ''),
        ),
        finishReason: toFinishReason(choice.finish_reason),
      }
      if (choice.message.reasoning_details !== undefined) {
        result.providerData = { reasoning_details: choice.message.reasoning_details }
      }
      return result
    },

    async *stream(request: ChatRequest, opts: RequestOptions = {}): AsyncIterable<StreamEvent> {
      const response = await send(request, true, opts.signal)
      if (!response.body) throw new ProviderError('invalid_response', 'De stream is leeg')

      const pending: { id: string; name: string; args: string; index: number }[] = []
      const slotFor = (fragment: WireToolCall) => {
        if (fragment.index !== undefined) {
          let slot = pending.find((p) => p.index === fragment.index)
          if (!slot) {
            slot = { id: '', name: '', args: '', index: fragment.index }
            pending.push(slot)
          }
          return slot
        }
        // Zonder index: een nieuw id is een nieuwe aanroep, anders hoort het bij de laatste.
        const known = fragment.id ? pending.find((p) => p.id === fragment.id) : pending.at(-1)
        if (known) return known
        const slot = { id: '', name: '', args: '', index: pending.length }
        pending.push(slot)
        return slot
      }

      try {
        for await (const payload of readSse(response.body)) {
          const event = payload as {
            error?: WireError
            choices?: {
              delta?: { content?: string | null; tool_calls?: WireToolCall[] }
              finish_reason?: string | null
            }[]
          }
          if (event.error) throw providerError(event.error, 'OpenRouter gaf een fout in de stream')
          const choice = event.choices?.[0]
          if (!choice) continue
          if (choice.delta?.content) yield { type: 'text', delta: choice.delta.content }
          for (const fragment of choice.delta?.tool_calls ?? []) {
            const slot = slotFor(fragment)
            if (fragment.id) slot.id = fragment.id
            // Naam overnemen, niet aanvullen: sommige aanbieders sturen hem in elk fragment mee.
            if (fragment.function?.name) slot.name = fragment.function.name
            if (fragment.function?.arguments) slot.args += fragment.function.arguments
          }
          if (choice.finish_reason) {
            if (choice.finish_reason === 'error') {
              throw providerError({}, 'Het model brak de stream af met een fout')
            }
            for (const slot of [...pending].sort((a, b) => a.index - b.index)) {
              yield { type: 'tool_call', call: toToolCall(slot.id, slot.name, slot.args) }
            }
            yield { type: 'done', finishReason: toFinishReason(choice.finish_reason) }
            return
          }
        }
      } catch (error) {
        throw toProviderError(error, opts.signal, 'Verbinding met OpenRouter verbroken')
      }
      throw new ProviderError('invalid_response', 'De stream van OpenRouter eindigde onverwacht')
    },
  }
}

function toWireRequest(request: ChatRequest) {
  const messages: unknown[] = []
  if (request.system) messages.push({ role: 'system', content: request.system })
  messages.push(...request.messages.map(toWireMessage))
  const wire: Record<string, unknown> = { model: request.model, messages }
  if (request.maxTokens !== undefined) wire.max_tokens = request.maxTokens
  if (request.tools && request.tools.length > 0) {
    const names = new Set<string>()
    for (const tool of request.tools) {
      if (names.has(tool.name)) throw new Error(`Tool "${tool.name}" staat er twee keer in`)
      names.add(tool.name)
    }
    wire.tools = request.tools.map(toWireTool)
  }
  return wire
}

function toWireContent(part: ContentPart) {
  return part.type === 'text'
    ? { type: 'text', text: part.text }
    : { type: 'image_url', image_url: { url: `data:${part.mediaType};base64,${part.data}` } }
}

function toWireMessage(message: Message) {
  switch (message.role) {
    case 'user':
      return {
        role: 'user',
        content:
          typeof message.content === 'string'
            ? message.content
            : message.content.map(toWireContent),
      }
    case 'assistant': {
      const wire: Record<string, unknown> = { role: 'assistant', content: message.content }
      if (message.toolCalls && message.toolCalls.length > 0) {
        wire.content = message.content === '' ? null : message.content
        wire.tool_calls = message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: {
            name: call.name,
            arguments: call.rawArguments ?? JSON.stringify(call.input ?? {}),
          },
        }))
      }
      const details = (message.providerData as { reasoning_details?: unknown } | undefined)
        ?.reasoning_details
      if (details !== undefined) wire.reasoning_details = details
      return wire
    }
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
  }
}

function toWireTool(tool: ToolDefinition) {
  // io: 'input' maakt velden met een default optioneel, zoals het model ze mag weglaten.
  const { $schema: _schema, ...parameters } = z.toJSONSchema(tool.inputSchema, { io: 'input' })
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters },
  }
}

function toToolCall(id: string, name: string, raw: string): ToolCall {
  if (raw.trim() === '') return { id, name, input: {}, rawArguments: raw }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      id,
      name,
      input: undefined,
      rawArguments: raw,
      parseError: 'Argumenten zijn geen geldige JSON',
    }
  }
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return { id, name, input: parsed, rawArguments: raw }
  }
  return {
    id,
    name,
    input: undefined,
    rawArguments: raw,
    parseError: 'Argumenten zijn geen JSON-object',
  }
}

function toFinishReason(reason: string | null | undefined): FinishReason {
  if (reason === 'stop' || reason === 'tool_calls' || reason === 'length') return reason
  return 'other'
}

function kindForStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 402) return 'payment'
  if (status === 429) return 'rate_limit'
  if (status === 408 || status >= 500) return 'server'
  return 'bad_request'
}

/** Haalt de boodschap uit een foutantwoord. Inkorten gebeurt pas na het weghalen van de key. */
function errorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    if (parsed.error?.message) return parsed.error.message
  } catch {
    // Geen JSON: val terug op de tekst zelf.
  }
  return body || 'geen details'
}

/** Leest server-sent events en levert de JSON van elke `data:`-regel tot `[DONE]`. */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncIterable<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (value) buffer += decoder.decode(value, { stream: true })
      if (done) buffer += decoder.decode()
      const lines = buffer.split(/\r?\n/)
      buffer = done ? '' : (lines.pop() ?? '')
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') return
        if (data === '') continue
        let parsed: unknown
        try {
          parsed = JSON.parse(data)
        } catch {
          throw new ProviderError('invalid_response', 'Ongeldige JSON in de stream van OpenRouter')
        }
        yield parsed
      }
      if (done) {
        finished = true
        return
      }
    }
  } finally {
    // Stopt de lezer eerder (break, fout of finish_reason), dan sluiten we de verbinding.
    if (!finished) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
