import { GradientText } from '@/components/atoms/GradientText'
import { SectionLabel } from '@/components/atoms/SectionLabel'
import { ContributionCard } from '@/components/molecules/ContributionCard'
import type { IconName } from '@ai-agencee/ui/icons'

interface ContributionWay {
  icon:        IconName
  title:       string
  description: string
  href:        string
  cta:         string
}

const CONTRIBUTION_WAYS: ContributionWay[] = [
  {
    icon:        'target',
    title:       'Star the repo',
    description: 'The single easiest way to help. Every star improves discoverability and signals project health.',
    href:        'https://github.com/binaryjack/ai-agencee',
    cta:         'Star on GitHub ↗',
  },
  {
    icon:        'bug',
    title:       'File bugs & issues',
    description: 'Ran into unexpected behaviour? A clear reproduction report with steps is invaluable.',
    href:        'https://github.com/binaryjack/ai-agencee/issues',
    cta:         'Open an issue ↗',
  },
  {
    icon:        'idea',
    title:       'Suggest features',
    description: 'Ideas for new agents, providers, or capabilities? Start a GitHub Discussion.',
    href:        'https://github.com/binaryjack/ai-agencee/discussions',
    cta:         'Start a discussion ↗',
  },
  {
    icon:        'branching',
    title:       'Contribute code',
    description: 'Good-first-issue tickets are tagged and scoped. Fork, implement, and open a PR.',
    href:        'https://github.com/binaryjack/ai-agencee/issues?q=label%3A%22good+first+issue%22',
    cta:         'Browse good-first-issues ↗',
  },
]

export function ContributeSection() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <SectionLabel>Community</SectionLabel>
        <h2 className="text-3xl font-extrabold text-neutral-100">
          Building in public — <GradientText>come build with us</GradientText>
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
          ai-agencee is early-stage and actively looking for contributors, early adopters, and
          enterprise beta testers. Your feedback directly shapes the roadmap.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CONTRIBUTION_WAYS.map((way) => (
          <ContributionCard key={way.title} {...way} />
        ))}
      </div>

      {/* Beta tester callout */}
      <div className="flex flex-col gap-4 rounded-node border border-warning-700/40 bg-warning-900/10 px-6 py-5 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-warning-300">
            🧪 Enterprise beta testers wanted
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">
            Using ai-agencee in a company context? We're looking for 5 pilot organisations to run
            the Enterprise tier at no cost in exchange for structured feedback sessions.
          </p>
        </div>
        <a
          href="/contact"
          className="shrink-0 rounded-node border border-warning-700/60 bg-warning-900/20 px-4 py-2 text-sm font-semibold text-warning-300 hover:bg-warning-900/40 transition-colors whitespace-nowrap"
        >
          Apply as beta tester →
        </a>
      </div>
    </div>
  )
}
