import { useRef, useState } from 'react'
import { createRng } from '../engine/rng'
import type { AttackResult } from '../engine/tools'
import { createOpenRouterProvider } from '../providers/openrouter'
import { runProbe, type ProbeEvent } from './runProbe'

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5'

function describeResult(content: string, isError: boolean): string {
  if (isError) return content
  const r = JSON.parse(content) as AttackResult
  const worp = r.rolls.length > 1 ? `${r.rolls.join(' en ')}, gekozen ${r.d20}` : `${r.d20}`
  const uitkomst = { hit: 'raak', crit: 'kritieke treffer', miss: 'mis' }[r.outcome]
  const schade = r.damage
    ? `, ${r.damage.total} ${r.damage.type} (${r.damage.rolls.join('+')})`
    : ''
  return `d20: ${worp} + ${r.bonus} = ${r.total} tegen AC ${r.targetAc}: ${uitkomst}${schade}`
}

function Event({ event }: { event: ProbeEvent }) {
  switch (event.type) {
    case 'request':
      return <li>Verzoek {event.turn} naar het model…</li>
    case 'narration':
      return (
        <li className="narration">
          <small>DM</small>
          {event.content}
        </li>
      )
    case 'tool_call':
      return (
        <li className="tool_call">
          <small>Model roept {event.call.name} aan</small>
          <code>{event.call.rawArguments ?? JSON.stringify(event.call.input)}</code>
        </li>
      )
    case 'tool_result':
      return (
        <li className={event.isError ? 'fout' : 'tool_result'}>
          <small>{event.isError ? 'Engine weigert' : 'Engine rolt'}</small>
          {describeResult(event.content, event.isError)}
        </li>
      )
    case 'done':
      return (
        <li>
          {event.reason === 'narration'
            ? 'Klaar.'
            : 'Gestopt: het model bleef tools aanroepen zonder te vertellen.'}
        </li>
      )
    case 'error':
      return (
        <li className="error">
          <small>Fout ({event.kind})</small>
          {event.message}
        </li>
      )
  }
}

export function Probe() {
  // De key staat alleen in het geheugen van deze pagina en wordt nergens opgeslagen.
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [events, setEvents] = useState<ProbeEvent[]>([])
  const [running, setRunning] = useState(false)
  const [seed, setSeed] = useState<number | null>(null)
  const abort = useRef<AbortController | null>(null)

  async function start() {
    const nieuweSeed = crypto.getRandomValues(new Uint32Array(1))[0]
    const controller = new AbortController()
    abort.current = controller
    setSeed(nieuweSeed)
    setEvents([])
    setRunning(true)
    try {
      await runProbe({
        provider: createOpenRouterProvider({ apiKey }),
        model: model.trim(),
        rng: createRng(nieuweSeed),
        signal: controller.signal,
        onEvent: (event) => setEvents((current) => [...current, event]),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setEvents((current) => [...current, { type: 'error', kind: 'unknown', message }])
    } finally {
      setRunning(false)
      abort.current = null
    }
  }

  return (
    <main>
      <h1>Modeltest: een goblin valt aan</h1>
      <p>
        Het model krijgt de DM-rol en één tool. Het moet de aanval door de engine laten rollen en
        daarna beschrijven wat er gebeurt.
      </p>

      <label htmlFor="key">OpenRouter API-key</label>
      <input
        id="key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
      />
      <p className="hint">Blijft alleen in deze pagina en gaat alleen naar openrouter.ai.</p>

      <label htmlFor="model">Model</label>
      <input
        id="model"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={model}
        onChange={(e) => setModel(e.target.value)}
      />
      <p className="hint">Elk model-id van openrouter.ai/models dat tools ondersteunt.</p>

      <div className="buttons">
        <button onClick={start} disabled={running || apiKey.trim() === '' || model.trim() === ''}>
          {running ? 'Bezig…' : 'Start'}
        </button>
        {running && <button onClick={() => abort.current?.abort()}>Stop</button>}
      </div>

      {seed !== null && <p className="hint">Seed van de engine: {seed}</p>}

      <ol>
        {events.map((event, index) => (
          <Event key={index} event={event} />
        ))}
      </ol>
    </main>
  )
}
