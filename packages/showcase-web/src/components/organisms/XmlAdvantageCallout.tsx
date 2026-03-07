import { CheckItem } from '@/components/atoms/CheckItem'
import { CrossItem } from '@/components/atoms/CrossItem'
import { GradientText } from '@/components/atoms/GradientText'
import { SectionLabel } from '@/components/atoms/SectionLabel'

const XML_STRENGTHS = [
  'Hierarchical schema — `<persona>`, `<constraints>`, `<output-contract>` are first-class, not free prose',
  'Machine-readable: Supervisor validates tags before dispatching; malformed manifests are rejected at the gate',
  'Composable: include, extend, and override via XML entities — no copy-paste drift across agent files',
  'Diffable: every rule change is a structured line diff — reviewable in any PR without reading prose',
  'Deterministic boundaries: the LLM sees explicit open/close delimiters, not implicit heading conventions',
]

const MD_WEAKNESSES = [
  'agent.md / SKILLS: free-form Markdown is parsed by the LLM as natural language — boundaries are inferred, not enforced',
  'No validation layer: a forgotten or mistyped section silently degrades output quality with zero error feedback',
  'Flat structure: nested rules require prose conventions ("see section 3.2") that LLMs frequently ignore',
  'Prompt injection surface: adversarial content in headings or code blocks can override instructions without a schema guard',
  'No composability: extending a base persona means copy-pasting, which diverges silently over time',
]

const CODE_BEFORE = `## Persona
You are a backend engineer.
Follow REST conventions.
Never write frontend code.

## Constraints
- Use TypeScript
- Write tests`

const CODE_AFTER = `<agent id="backend" extends="base-engineer">
  <persona role="backend" />
  <constraints>
    <rule id="lang">TypeScript only — no JavaScript</rule>
    <rule id="scope">Backend scope: no DOM, no JSX</rule>
    <rule id="test">Every public function must have a unit test</rule>
  </constraints>
  <output-contract format="ndjson" schema="task-result.schema.json" />
</agent>`

export function XmlAdvantageCallout() {
  return (
    <div className="flex flex-col gap-10">
      {/* Section header */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Instruction architecture</SectionLabel>
        <h2 className="text-3xl font-extrabold text-neutral-100">
          Why XML instructions <GradientText>outperform Markdown</GradientText>
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
          Every VS Code{' '}
          <code className="rounded bg-neutral-700/60 px-1 text-xs text-neutral-200">
            agent.md
          </code>{' '}
          and{' '}
          <code className="rounded bg-neutral-700/60 px-1 text-xs text-neutral-200">
            .github/copilot-instructions.md
          </code>{' '}
          file is natural language — the LLM infers the intent. Our XML manifests make every rule,
          constraint, and persona boundary <em>explicit, validatable, and composable.</em>
        </p>
      </div>

      {/* Comparison columns */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* XML strengths */}
        <div className="flex flex-col gap-4 rounded-node border border-success-700/40 bg-success-900/10 p-6">
          <h3 className="text-sm font-bold text-success-300">
            XML instruction manifests
          </h3>
          <ul className="flex flex-col gap-2">
            {XML_STRENGTHS.map((s) => (
              <CheckItem key={s} label={s} />
            ))}
          </ul>
        </div>

        {/* MD weaknesses */}
        <div className="flex flex-col gap-4 rounded-node border border-error-700/40 bg-error-900/10 p-6">
          <h3 className="text-sm font-bold text-error-300">
            Markdown / agent.md / SKILLS
          </h3>
          <ul className="flex flex-col gap-2">
            {MD_WEAKNESSES.map((w) => (
              <CrossItem key={w} label={w} />
            ))}
          </ul>
        </div>
      </div>

      {/* Code comparison */}
      <div className="flex flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Same intent — fundamentally different precision
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Before */}
          <div className="flex flex-col gap-2">
            <span className="rounded-t-node border border-b-0 border-error-700/50 bg-error-900/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-error-400">
              ❌ agent.md — inferred, fragile
            </span>
            <pre className="overflow-x-auto rounded-b-node rounded-tr-node border border-neutral-700/60 bg-neutral-900 p-4 text-[11px] leading-relaxed text-neutral-300">
              <code>{CODE_BEFORE}</code>
            </pre>
          </div>

          {/* After */}
          <div className="flex flex-col gap-2">
            <span className="rounded-t-node border border-b-0 border-success-700/50 bg-success-900/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-success-400">
              ✅ XML manifest — explicit, validated
            </span>
            <pre className="overflow-x-auto rounded-b-node rounded-tr-node border border-neutral-700/60 bg-neutral-900 p-4 text-[11px] leading-relaxed text-neutral-300">
              <code>{CODE_AFTER}</code>
            </pre>
          </div>
        </div>
      </div>

      {/* CTA footnote */}
      <p className="text-xs leading-relaxed text-neutral-500">
        The full instruction schema lives in{' '}
        <code className="rounded bg-neutral-800 px-1 text-neutral-300">
          template/.github/
        </code>
        . Drop your team's rules into{' '}
        <code className="rounded bg-neutral-800 px-1 text-neutral-300">
          architecture-rules.xml
        </code>{' '}
        and{' '}
        <code className="rounded bg-neutral-800 px-1 text-neutral-300">
          quality-gates.xml
        </code>{' '}
        — the Supervisor picks them up on next run with zero additional config.
      </p>
    </div>
  )
}
