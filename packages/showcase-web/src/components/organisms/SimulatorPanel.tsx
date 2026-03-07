'use client'

import { useEffect, useRef, useState } from 'react'
import type { SimScenario, SimEventKind } from '@/data/scenarios'
import { LaneStatusCard, type LaneState, type LaneStatus } from '@/components/molecules/LaneStatusCard'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParsedEvent {
  type:          SimEventKind
  laneId?:       string
  content?:      string
  status?:       'pass' | 'escalated' | 'handed-off'
  costUsd?:      number
  totalUsd?:     number
  attempt?:      number
  reason?:       string
  targetLaneId?: string
  dagName?:      string
  laneIds?:      string[]
  barrierName?:  string
  ready?:        number
  total?:        number
  pattern?:      string
  count?:        number
  durationMs?:   number
  verdict?:      string
}

type Phase = 'idle' | 'running' | 'done'

interface LogEntry {
  ts:    string
  label: string
  color: string
}

interface PanelState {
  phase:       Phase
  dagName:     string
  totalCostUsd: number
  startedAt?:  number
  elapsed:     number          // ms
  lanes:       Record<string, LaneState>
  log:         LogEntry[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MAX_STREAM_CHARS = 150

function ts(startedAt: number | undefined) {
  if (!startedAt) return ''
  const ms = Date.now() - startedAt
  const secs = Math.floor(ms / 1000)
  const mins = Math.floor(secs / 60)
  return `${String(mins).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
}

function addLog(prev: LogEntry[], label: string, color = 'text-neutral-400'): LogEntry[] {
  return [...prev, { ts: new Date().toLocaleTimeString('en-GB', { hour12: false }), label, color }].slice(-120)
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  scenario: SimScenario
  onReset:  () => void
}

export function SimulatorPanel({ scenario, onReset }: Props) {
  const initialLanes = (): Record<string, LaneState> =>
    Object.fromEntries(
      scenario.lanes.map(l => [l.id, { id: l.id, label: l.label, icon: l.icon, status: 'pending' as LaneStatus, streamTokens: '' }])
    )

  const [state, setState] = useState<PanelState>({
    phase:        'idle',
    dagName:      '',
    totalCostUsd: 0,
    startedAt:    undefined,
    elapsed:      0,
    lanes:        initialLanes(),
    log:          [],
  })

  const esRef      = useRef<EventSource | null>(null)
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const logEndRef  = useRef<HTMLDivElement | null>(null)

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [state.log.length])

  // Cleanup on unmount / scenario change
  useEffect(() => {
    return () => {
      esRef.current?.close()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  function start() {
    // Reset
    setState({
      phase:        'running',
      dagName:      scenario.title,
      totalCostUsd: 0,
      startedAt:    Date.now(),
      elapsed:      0,
      lanes:        initialLanes(),
      log:          [{ ts: new Date().toLocaleTimeString('en-GB', { hour12: false }), label: `▶  Starting ${scenario.title}…`, color: 'text-brand-400' }],
    })

    // Elapsed timer
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setState(s => ({ ...s, elapsed: s.startedAt ? Date.now() - s.startedAt : 0 }))
    }, 250)

    // SSE
    esRef.current?.close()
    const es = new EventSource(`/api/simulate/${scenario.id}`)
    esRef.current = es

    es.onmessage = (e: MessageEvent<string>) => {
      const evt = JSON.parse(e.data) as ParsedEvent
      setState(s => applyEvent(s, evt))
    }

    es.addEventListener('done', () => {
      es.close()
      if (timerRef.current) clearInterval(timerRef.current)
      setState(s => ({ ...s, phase: 'done' }))
    })

    es.onerror = () => {
      es.close()
      if (timerRef.current) clearInterval(timerRef.current)
      setState(s => ({ ...s, phase: 'done', log: addLog(s.log, '⚠  SSE connection closed', 'text-red-400') }))
    }
  }

  function applyEvent(s: PanelState, evt: ParsedEvent): PanelState {
    let { lanes, log, totalCostUsd } = s

    const updateLane = (id: string, patch: Partial<LaneState>) => {
      lanes = { ...lanes, [id]: { ...lanes[id], ...patch } }
    }

    switch (evt.type) {
      case 'dag:start':
        log = addLog(log, `⬡  DAG started: ${evt.dagName ?? scenario.title}`, 'text-brand-400')
        break

      case 'lane:start':
        if (evt.laneId) {
          updateLane(evt.laneId, { status: 'running', streamTokens: '' })
          log = addLog(log, `→  [${lanes[evt.laneId]?.label ?? evt.laneId}] started`, 'text-blue-400')
        }
        break

      case 'token:stream':
        if (evt.laneId && evt.content) {
          const prev = lanes[evt.laneId]?.streamTokens ?? ''
          const next = (prev + ' ' + evt.content).trim().slice(-MAX_STREAM_CHARS)
          updateLane(evt.laneId, { streamTokens: next })
        }
        break

      case 'pii:scrubbed':
        if (evt.laneId) {
          log = addLog(
            log,
            `🛡  PII redacted in [${lanes[evt.laneId]?.label ?? evt.laneId}]: ${evt.count ?? 1}× ${evt.pattern ?? 'secret'} removed before LLM call`,
            'text-amber-300',
          )
        }
        break

      case 'verdict:issued':
        if (evt.laneId) {
          log = addLog(
            log,
            `◦  [${lanes[evt.laneId]?.label ?? evt.laneId}] verdict: ${evt.verdict}`,
            evt.verdict === 'PASS' ? 'text-green-400' : evt.verdict === 'ESCALATE' ? 'text-red-400' : 'text-amber-400',
          )
        }
        break

      case 'lane:retry':
        if (evt.laneId) {
          updateLane(evt.laneId, { status: 'retry', streamTokens: evt.reason ?? '' })
          log = addLog(log, `↺  [${lanes[evt.laneId]?.label ?? evt.laneId}] retry #${evt.attempt ?? 1}: ${evt.reason ?? ''}`, 'text-amber-400')
        }
        break

      case 'lane:escalate':
        if (evt.laneId) {
          updateLane(evt.laneId, { status: 'escalated', streamTokens: evt.reason ?? '' })
          log = addLog(log, `⬆  [${lanes[evt.laneId]?.label ?? evt.laneId}] ESCALATED: ${evt.reason ?? ''}`, 'text-red-400')
        }
        break

      case 'lane:handoff':
        if (evt.laneId) {
          updateLane(evt.laneId, { status: 'handed-off', streamTokens: `→ ${evt.targetLaneId ?? 'specialist'}` })
          log = addLog(log, `⇢  [${lanes[evt.laneId]?.label ?? evt.laneId}] HANDOFF → ${evt.targetLaneId ?? ''}: ${evt.reason ?? ''}`, 'text-purple-400')
        }
        break

      case 'lane:human-review':
        if (evt.laneId) {
          updateLane(evt.laneId, { status: 'human-review', streamTokens: evt.reason ?? 'Awaiting operator sign-off…' })
          log = addLog(log, `👤  [${lanes[evt.laneId]?.label ?? evt.laneId}] awaiting human review`, 'text-indigo-400')
        }
        break

      case 'lane:complete':
        if (evt.laneId) {
          const finalStatus: LaneStatus =
            evt.status === 'escalated'   ? 'escalated'   :
            evt.status === 'handed-off'  ? 'handed-off'  : 'pass'
          updateLane(evt.laneId, { status: finalStatus, costUsd: evt.costUsd })
          log = addLog(
            log,
            `✓  [${lanes[evt.laneId]?.label ?? evt.laneId}] complete${evt.costUsd ? ` — $${evt.costUsd.toFixed(4)}` : ''}`,
            'text-green-400',
          )
        }
        break

      case 'barrier:waiting':
        log = addLog(
          log,
          `⛩  Barrier [${evt.barrierName ?? '?'}]: ${evt.ready ?? 0}/${evt.total ?? '?'} lanes ready`,
          'text-neutral-400',
        )
        break

      case 'barrier:released':
        log = addLog(log, `✅  Barrier [${evt.barrierName ?? '?'}] released — continuing`, 'text-green-300')
        break

      case 'cost:update':
        totalCostUsd = evt.totalUsd ?? totalCostUsd
        break

      case 'dag:complete':
        log = addLog(
          log,
          `⬡  DAG complete — total cost $${(evt.totalUsd ?? totalCostUsd).toFixed(4)} / ${((evt.durationMs ?? 0) / 1000).toFixed(0)}s`,
          'text-brand-400',
        )
        totalCostUsd = evt.totalUsd ?? totalCostUsd
        break
    }

    return { ...s, lanes, log, totalCostUsd }
  }

  const elapsedStr = (() => {
    const secs = Math.floor(state.elapsed / 1000)
    const mins = Math.floor(secs / 60)
    return `${String(mins).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
  })()

  const laneList = scenario.lanes.map(l => state.lanes[l.id] ?? { id: l.id, label: l.label, icon: l.icon, status: 'pending' as const, streamTokens: '' })

  return (
    <section className="flex flex-col gap-6 rounded-xl border border-neutral-700 bg-neutral-900 p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-neutral-100">{scenario.title}</h2>
          <p className="text-xs text-neutral-500">{scenario.subtitle}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Status pill */}
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            state.phase === 'idle'    ? 'bg-neutral-700 text-neutral-400' :
            state.phase === 'running' ? 'bg-blue-900/60 text-blue-300 animate-pulse' :
                                        'bg-green-900/60 text-green-300'
          }`}>
            {state.phase === 'idle' ? 'Ready' : state.phase === 'running' ? 'Running' : 'Done'}
          </span>

          {/* Cost */}
          {state.totalCostUsd > 0 && (
            <span className="font-mono text-xs text-neutral-400">
              ${state.totalCostUsd.toFixed(4)}
            </span>
          )}

          {/* Elapsed */}
          {state.phase !== 'idle' && (
            <span className="font-mono text-xs text-neutral-500">{elapsedStr}</span>
          )}

          {/* Buttons */}
          {state.phase !== 'running' && (
            <button
              onClick={start}
              className="rounded-md bg-brand-500 hover:bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              {state.phase === 'done' ? '↺ Replay' : '▶ Run Simulation'}
            </button>
          )}
          <button
            onClick={onReset}
            className="rounded-md border border-neutral-700 hover:border-neutral-500 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* ── Lane Grid ── */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {laneList.map(lane => (
          <LaneStatusCard key={lane.id} lane={lane} />
        ))}
      </div>

      {/* ── Event Log ── */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Event Log</span>
          {ts(state.startedAt) && (
            <span className="font-mono text-[10px] text-neutral-600">{ts(state.startedAt)}</span>
          )}
        </div>
        <div className="h-52 overflow-y-auto px-4 py-3 space-y-1 scroll-smooth" role="log" aria-live="polite">
          {state.log.length === 0 && (
            <p className="text-[11px] text-neutral-600 font-mono">Click "Run Simulation" to start…</p>
          )}
          {state.log.map((entry, i) => (
            <p key={i} className={`font-mono text-[11px] leading-relaxed ${entry.color}`}>
              <span className="text-neutral-600 mr-2">{entry.ts}</span>
              {entry.label}
            </p>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </section>
  )
}
