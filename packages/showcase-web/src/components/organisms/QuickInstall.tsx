import { GradientText } from '@/components/atoms/GradientText'
import { SectionLabel } from '@/components/atoms/SectionLabel'
import { CommandBlock } from '@/components/molecules/CommandBlock'

const QUICK_STARTS = [
  {
    label:   '1. Install CLI',
    code:    `npm install -g @ai-agencee/ai-kit-cli`,
    comment: 'Or: pnpm add -g @ai-agencee/ai-kit-cli',
  },
  {
    label:   '2. Run the zero-key demo',
    code:    `git clone https://github.com/binaryjack/ai-agencee
cd ai-agencee
pnpm install && pnpm demo`,
    comment: 'Mock provider — no API keys, no cost',
  },
  {
    label:   '3. Run a real DAG',
    code:    `ANTHROPIC_API_KEY=sk-... ai-kit agent:dag ./my-dag.json`,
    comment: 'Or use OpenAI: --provider openai',
  },
  {
    label:   '4. Start a planning session',
    code:    `ai-kit plan`,
    comment: '5-phase BA-led discovery → sprint plan → DAG',
  },
]

export function QuickInstall() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <SectionLabel>Get Started</SectionLabel>
        <h2 className="text-3xl font-extrabold text-neutral-100">
          Up and running <GradientText>in under 5 minutes</GradientText>
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
          The CLI, mock provider, and DAG engine are open source and free forever.
          No sign-up, no API key, no billing details needed to evaluate.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {QUICK_STARTS.map((qs) => (
          <div key={qs.label} className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-neutral-300">{qs.label}</p>
            <CommandBlock code={qs.code} />
            <p className="text-[11px] text-neutral-500">{qs.comment}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-node border border-neutral-700 bg-neutral-800/50 px-5 py-4">
        <div className="flex-1">
          <p className="text-sm font-semibold text-neutral-200">
            Use it programmatically
          </p>
          <p className="text-xs text-neutral-400 mt-0.5">
            Drop the engine directly into any Node.js / TypeScript project.
          </p>
        </div>
        <code className="rounded-node bg-neutral-900 px-3 py-1.5 text-xs font-mono text-brand-300">
          npm install @ai-agencee/ai-kit-agent-executor
        </code>
        <a
          href="/docs/builder-api"
          className="text-sm font-medium text-brand-400 hover:text-brand-300 transition-colors whitespace-nowrap"
        >
          API docs →
        </a>
      </div>
    </div>
  )
}
