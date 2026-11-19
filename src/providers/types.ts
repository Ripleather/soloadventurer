// Intern formaat van de provider-laag. Elke adapter vertaalt van en naar dit formaat, zodat de rest
// van de app niet weet met welke aanbieder hij praat.
import type { z } from 'zod'

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

export type ContentPart =
  | { type: 'text'; text: string }
  /** Afbeelding als base64 zonder data-url-voorvoegsel, bijvoorbeeld de DM-kaart van een beat. */
  | { type: 'image'; mediaType: ImageMediaType; data: string }

export type ToolCall = {
  id: string
  name: string
  /** Geparste argumenten als object, of undefined als ze geen geldig JSON-object waren. */
  input: unknown
  /** De argumenten zoals het model ze stuurde; gaan ongewijzigd terug in de geschiedenis. */
  rawArguments?: string
  /** Gezet als de argumenten geen geldig JSON-object waren. */
  parseError?: string
}

export type Message =
  | { role: 'user'; content: string | ContentPart[] }
  | {
      role: 'assistant'
      content: string
      toolCalls?: ToolCall[]
      /** Ondoorzichtige gegevens van de aanbieder (bijv. redenering) die terug moeten. */
      providerData?: unknown
    }
  | { role: 'tool'; toolCallId: string; toolName: string; content: string; isError?: boolean }

export type ToolDefinition = {
  name: string
  description: string
  inputSchema: z.ZodType
}

export type ChatRequest = {
  model: string
  /** De systeemprompt staat apart, omdat Anthropic en Google er één bovenaan kennen. */
  system?: string
  messages: Message[]
  tools?: ToolDefinition[]
  maxTokens?: number
}

export type FinishReason = 'stop' | 'tool_calls' | 'length' | 'other'

export type ChatResponse = {
  content: string
  toolCalls: ToolCall[]
  finishReason: FinishReason
  providerData?: unknown
}

export type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done'; finishReason: FinishReason }

export type RequestOptions = { signal?: AbortSignal }

export interface Provider {
  chat(request: ChatRequest, options?: RequestOptions): Promise<ChatResponse>
  stream(request: ChatRequest, options?: RequestOptions): AsyncIterable<StreamEvent>
}

export type ProviderErrorKind =
  | 'auth'
  | 'payment'
  | 'rate_limit'
  | 'bad_request'
  | 'server'
  | 'network'
  | 'aborted'
  | 'invalid_response'

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind
  readonly status?: number

  constructor(kind: ProviderErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ProviderError'
    this.kind = kind
    this.status = status
  }
}
