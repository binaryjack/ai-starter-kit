import { GradientText } from '@/components/atoms/GradientText'
import { SectionLabel } from '@/components/atoms/SectionLabel'

const CTA_SECONDARY_LINKS = [
  { label: 'Read the docs',      href: '/docs'     },
  { label: 'Browse features →',  href: '/features' },
  { label: 'GitHub ↗',           href: 'https://github.com/binaryjack/ai-agencee' },
]

export function CtaBanner() {
  return (
    <div className="relative overflow-hidden rounded-node border border-brand-700/40 bg-gradient-to-br from-brand-900/40 to-neutral-900 px-8 py-14 text-center">
      {/* Background glow */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden
      >
        <div className="h-72 w-72 rounded-full bg-brand-600/15 blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center gap-5">
        <SectionLabel>Ready to start?</SectionLabel>
        <h2 className="text-3xl font-extrabold text-neutral-100 sm:text-4xl">
          Build your first <GradientText>multi-agent workflow</GradientText>
          <br className="hidden sm:block" /> in under 5 minutes
        </h2>
        <p className="max-w-lg text-sm leading-relaxed text-neutral-400">
          No API key, no credit card. Clone the repo and run{' '}
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-brand-300">pnpm demo</code>{' '}
          to see DAG-supervised agents in action.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="/pricing"
            className="rounded-node bg-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-brand-400 transition-colors"
          >
            Get started free
          </a>
          {CTA_SECONDARY_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-sm font-medium text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
