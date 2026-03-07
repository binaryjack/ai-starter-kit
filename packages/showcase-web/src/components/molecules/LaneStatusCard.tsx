// Displays a single DAG lane's real-time status inside the simulator panel.

export type LaneStatus =
  | 'pending'
  | 'running'
  | 'retry'
  | 'escalated'
  | 'handed-off'
  | 'human-review'
  | 'aborted'
  | 'pass'

export interface LaneState {
  id:           string
  label:        string
  icon:         string
  status:       LaneStatus
  streamTokens: string    // last ~150 chars of received token:stream content concatenated
  costUsd?:     number
}

const STATUS_META: Record<LaneStatus, { label: string; border: string; badge: string; text: string }> = {
  pending:       { label: 'Pending',      border: 'border-l-neutral-700',   badge: 'bg-neutral-700 text-neutral-300',  text: 'text-neutral-500' },
  running:       { label: 'Running',      border: 'border-l-blue-500',      badge: 'bg-blue-900/60 text-blue-300',     text: 'text-blue-300'   },
  retry:         { label: 'Retrying…',    border: 'border-l-amber-500',     badge: 'bg-amber-900/60 text-amber-300',   text: 'text-amber-300'  },
  escalated:     { label: 'Escalated',    border: 'border-l-red-500',       badge: 'bg-red-900/60 text-red-300',       text: 'text-red-300'    },
  'handed-off':  { label: 'Handed Off',   border: 'border-l-purple-500',    badge: 'bg-purple-900/60 text-purple-300', text: 'text-purple-300' },
  'human-review': { label: 'Awaiting ✋', border: 'border-l-indigo-500',    badge: 'bg-indigo-900/60 text-indigo-300', text: 'text-indigo-300' },
  aborted:       { label: 'Aborted ✕',    border: 'border-l-rose-600',      badge: 'bg-rose-900/60 text-rose-300',     text: 'text-rose-300'   },
  pass:          { label: 'Pass ✓',       border: 'border-l-green-500',     badge: 'bg-green-900/60 text-green-300',   text: 'text-green-300'  },
}

interface Props {
  lane: LaneState
}

export function LaneStatusCard({ lane }: Props) {
  const meta = STATUS_META[lane.status]

  return (
    <div
      className={`flex flex-col gap-2 rounded-node border border-neutral-700 border-l-4 ${meta.border} bg-neutral-800 p-4 min-h-[110px] transition-colors duration-300`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none" aria-hidden>{lane.icon}</span>
          <span className="text-xs font-semibold text-neutral-200 truncate">{lane.label}</span>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
          {meta.label}
        </span>
      </div>

      {/* Stream tokens — shown while running / retrying */}
      {lane.streamTokens && (
        <p className={`text-[11px] leading-relaxed ${meta.text} line-clamp-3 font-mono`}>
          {lane.streamTokens}
        </p>
      )}

      {/* Cost — shown once complete */}
      {lane.costUsd !== undefined && (
        <p className="mt-auto text-[10px] text-neutral-500 font-mono">
          cost: ${lane.costUsd.toFixed(4)}
        </p>
      )}

      {/* Running pulse indicator */}
      {lane.status === 'running' && (
        <span className="sr-only">Lane is running</span>
      )}
    </div>
  )
}
