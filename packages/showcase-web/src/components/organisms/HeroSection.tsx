import { GradientText } from '@/components/atoms/GradientText'
import { CommandBlock } from '@/components/molecules/CommandBlock'
import { STATS } from '@/data/comparisons'

const QUICK_INSTALL = `npm install -g @ai-agencee/ai-kit-cli

# zero-API-key demo — see the engine run in < 30 s
git clone https://github.com/binaryjack/ai-starter-kit
cd ai-starter-kit && pnpm install && pnpm demo`

export function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden px-6 pb-24 pt-28">
      {/* Decorative radial gradient */}
      <div
        className="pointer-events-none absolute inset-0 flex items-start justify-center"
        aria-hidden
      >
        <div className="h-[600px] w-[900px] rounded-full bg-brand-600/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl">
        {/* Top badges row */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-success-700/50 bg-success-700/20 px-3 py-0.5 text-xs font-semibold text-success-400">
            ✅ Production-Ready
          </span>
          <span className="rounded-full border border-brand-700/50 bg-brand-700/20 px-3 py-0.5 text-xs font-semibold text-brand-300">
            424 tests passing
          </span>
          <span className="rounded-full border border-neutral-700 bg-neutral-800 px-3 py-0.5 text-xs font-medium text-neutral-400">
            MIT
          </span>
        </div>

        {/* Main headline */}
        <h1 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight text-neutral-100 sm:text-5xl lg:text-6xl">
          Automate AI workflows{' '}
          <br className="hidden sm:block" />
          <GradientText>without the complexity</GradientText>
        </h1>

        <p className="mb-8 max-w-2xl text-base leading-relaxed text-neutral-400 sm:text-lg">
          Enterprise-grade multi-agent orchestration engine — DAG-supervised parallel agents with
          streaming LLM output, intelligent model routing, resilience patterns, RBAC, audit logging,
          and a{' '}
          <strong className="text-neutral-200">zero-API-key demo mode</strong>.
        </p>

        {/* CTA row */}
        <div className="mb-12 flex flex-wrap items-center gap-3">
          <a
            href="/pricing"
            className="rounded-node bg-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-brand-400 transition-colors"
          >
            Get started free
          </a>
          <a
            href="https://github.com/binaryjack/ai-agencee"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-node border border-neutral-600 px-5 py-2.5 text-sm font-semibold text-neutral-200 hover:border-brand-500 hover:text-brand-400 transition-colors"
          >
            View on GitHub ↗
          </a>
          <a
            href="/docs/dag-orchestration"
            className="text-sm font-medium text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Read docs →
          </a>
        </div>

        {/* Quick install */}
        <CommandBlock
          code={QUICK_INSTALL}
          label="Terminal"
          className="max-w-2xl"
        />

        {/* Stats row */}
        <div className="mt-14 grid grid-cols-2 gap-6 border-t border-neutral-700 pt-10 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5 text-center">
              <span className="text-2xl font-extrabold text-brand-400">{s.value}</span>
              <span className="text-xs text-neutral-400">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
