import { GradientText } from '@/components/atoms/GradientText'
import { SectionLabel } from '@/components/atoms/SectionLabel'
import { FaqList } from '@/components/molecules/FaqList'
import { PricingTierCard } from '@/components/molecules/PricingTierCard'
import { PRICING_FAQ, PRICING_TIERS } from '@/data/pricing'
import { Icon } from '@ai-agencee/ui/icons'

export function PricingSection() {
  return (
    <div className="flex flex-col gap-16">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <SectionLabel>Pricing</SectionLabel>
        <h2 className="text-3xl font-extrabold text-neutral-100 sm:text-4xl">
          Simple, <GradientText>transparent pricing</GradientText>
        </h2>
        <p className="max-w-lg text-sm leading-relaxed text-neutral-400">
          The CLI and engine are free and open-source today. Cloud tiers are fully
          designed and launching soon — join the waitlist to be notified at launch.
        </p>
      </div>

      {/* Cloud launch notice */}
      <div className="flex items-start gap-3 rounded-node border border-warning-600/50 bg-warning-900/20 px-5 py-4 text-sm">
        <Icon name="warning" theme="dark" size={18} className="mt-0.5 shrink-0 text-warning-500" />
        <p className="leading-relaxed text-warning-300">
          <strong className="text-warning-200">Cloud product not yet live.</strong>{' '}
          Starter, Professional, and Enterprise tiers are planned and will launch later this
          year. The <strong>Free tier</strong> — full CLI, DAG engine, MCP integration, and
          Mock provider — is available right now with no account required.{' '}
          <a
            href="https://github.com/binaryjack/ai-agencee"
            className="underline hover:text-warning-100"
          >
            Get started on GitHub ↗
          </a>
        </p>
      </div>

      {/* Tiers grid */}
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {PRICING_TIERS.map((tier) => (
          <PricingTierCard key={tier.id} tier={tier} />
        ))}
      </div>

      {/* Cost transparency note */}
      <div className="rounded-node border border-brand-700/40 bg-brand-900/20 px-6 py-5">
        <h3 className="mb-2 text-sm font-semibold text-brand-300">How token billing works</h3>
        <p className="text-xs leading-relaxed text-neutral-400">
          Tokens are counted across all LLM calls within a billing month and reset on your billing
          anniversary. The built-in model router automatically selects the cheapest model tier that
          satisfies each task — keeping your token spend as low as possible without sacrificing
          output quality.{' '}
          <a
            href="https://github.com/binaryjack/ai-agencee"
            className="text-brand-400 hover:underline"
          >
            Open-source CLI is always free. ↗
          </a>
        </p>
      </div>

      {/* FAQ */}
      <div className="flex flex-col gap-6">
        <h3 className="text-xl font-bold text-neutral-100">Frequently asked questions</h3>
        <FaqList items={PRICING_FAQ} />
      </div>
    </div>
  )
}
