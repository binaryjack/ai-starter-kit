import { GradientText } from '@/components/atoms/GradientText'
import { SectionLabel } from '@/components/atoms/SectionLabel'
import type { UseCase, UseCasePersona } from '@/data/use-cases'
import { USE_CASES } from '@/data/use-cases'
import { Icon } from '@ai-agencee/ui/icons'

const PERSONA_STYLE: Record<UseCasePersona, string> = {
  CTO:                  'border-warning-600/50 bg-warning-700/15 text-warning-300',
  'Engineering Lead':   'border-brand-600/50   bg-brand-700/15   text-brand-300',
  'Solo Dev':           'border-success-600/50 bg-success-700/15 text-success-300',
  'Compliance Officer': 'border-error-600/50   bg-error-700/15   text-error-300',
  Architect:            'border-brand-500/50   bg-brand-800/20   text-brand-200',
  'Security Lead':      'border-error-500/50   bg-error-800/20   text-error-200',
  'QA Lead':            'border-success-500/50 bg-success-800/20 text-success-200',
  'Cloud Admin':        'border-warning-500/50 bg-warning-800/20 text-warning-200',
  Sysadmin:             'border-neutral-500/50 bg-neutral-700/20 text-neutral-200',
}

function UseCaseCard({ uc }: { uc: UseCase }) {
  return (
    <article className="flex flex-col gap-4 rounded-node border border-neutral-700/60 bg-neutral-800/40 p-6 hover:border-brand-600/50 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <Icon name={uc.icon} theme="dark" size={28} aria-hidden />
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PERSONA_STYLE[uc.persona]}`}
        >
          {uc.persona}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-sm font-bold leading-snug text-neutral-100">{uc.title}</h3>

      {/* Problem */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
          The problem
        </span>
        <p className="text-xs leading-relaxed text-neutral-400">{uc.problem}</p>
      </div>

      {/* Solution */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-success-500">
          How it works
        </span>
        <p className="text-xs leading-relaxed text-neutral-300">{uc.solution}</p>
      </div>

      {/* Proof strip */}
      <div className="mt-auto border-t border-neutral-700/40 pt-3 text-[10px] text-neutral-500">
        {uc.proof}
      </div>
    </article>
  )
}

export function UseCasesSection() {
  return (
    <div className="flex flex-col gap-10">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Real-world scenarios</SectionLabel>
        <h2 className="text-3xl font-extrabold text-neutral-100">
          Built for the problems <GradientText>CTOs actually face</GradientText>
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
          Not toy demos. These are the bottlenecks that CTOs, architects, security leads, testers,
          and ops teams bring to every quarterly planning — ownership gaps, compliance blockers,
          test debt, and runbooks nobody maintains.
        </p>
      </div>

      {/* Cards grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {USE_CASES.map((uc) => (
          <UseCaseCard key={uc.id} uc={uc} />
        ))}
      </div>
    </div>
  )
}
