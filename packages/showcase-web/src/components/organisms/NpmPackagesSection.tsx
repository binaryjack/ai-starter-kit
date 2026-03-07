import { GradientText } from '@/components/atoms/GradientText'
import { SectionLabel } from '@/components/atoms/SectionLabel'
import { NpmPackageCard } from '@/components/molecules/NpmPackageCard'

const NPM_PACKAGES = [
  {
    name:        '@ai-agencee/cli',
    version:     '1.4.1',
    label:       'CLI',
    description: 'Global command-line interface — run DAGs, start planning sessions, and the zero-key mock demo from any terminal.',
    npmUrl:      'https://www.npmjs.com/package/@ai-agencee/cli',
    docs:        '/docs/cli',
  },
  {
    name:        '@ai-agencee/engine',
    version:     '1.1.0',
    label:       'Engine',
    description: 'Node.js / TypeScript orchestration engine — embed the full DAG runner and supervisor system directly in your application.',
    npmUrl:      'https://www.npmjs.com/package/@ai-agencee/engine',
    docs:        '/docs/builder-api',
  },
  {
    name:        '@ai-agencee/mcp',
    version:     '1.3.5',
    label:       'MCP Server',
    description: 'Model Context Protocol bridge — expose ai-agencee tools to Claude Desktop, VS Code Copilot, and any MCP-compatible client.',
    npmUrl:      'https://www.npmjs.com/package/@ai-agencee/mcp',
    docs:        '/docs/mcp',
  },
  {
    name:        '@ai-agencee/core',
    version:     '1.1.0',
    label:       'Core',
    description: 'Shared primitives — provider abstraction, schema validation, template engine, and low-level utilities consumed by the other packages.',
    npmUrl:      'https://www.npmjs.com/package/@ai-agencee/core',
    docs:        null,
  },
]

export function NpmPackagesSection() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <SectionLabel>npm packages</SectionLabel>
        <h2 className="text-3xl font-extrabold text-neutral-100">
          Four focused packages, <GradientText>one coherent system</GradientText>
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
          All packages are published to the public npm registry under the{' '}
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-brand-300">
            @ai-agencee
          </code>{' '}
          scope and are MIT-licensed. Install only what you need.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {NPM_PACKAGES.map((pkg) => (
          <NpmPackageCard key={pkg.name} pkg={pkg} />
        ))}
      </div>

      <p className="text-xs text-neutral-500">
        All packages require Node.js ≥ 20. The CLI and engine work with no API key using the built-in
        mock provider.{' '}
        <a
          href="https://www.npmjs.com/org/ai-agencee"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-500 hover:text-brand-400 transition-colors"
        >
          Browse all on npmjs.com ↗
        </a>
      </p>
    </div>
  )
}
