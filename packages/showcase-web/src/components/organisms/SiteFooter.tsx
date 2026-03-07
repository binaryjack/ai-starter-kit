const FOOTER_COLUMNS = [
  {
    heading: 'Product',
    links: [
      { label: 'Features',    href: '/features'  },
      { label: 'Pricing',     href: '/pricing'   },
      { label: 'Services',    href: '/services'  },
      { label: 'Demo',        href: '/dag'        },
      { label: 'Changelog',   href: '#'           },
    ],
  },
  {
    heading: 'Documentation',
    links: [
      { label: 'DAG Orchestration', href: '/docs/dag-orchestration' },
      { label: 'CLI Reference',     href: '/docs/cli'               },
      { label: 'MCP Integration',   href: '/docs/mcp'               },
      { label: 'Enterprise',        href: '/docs/rbac'              },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About',   href: '/about'   },
      { label: 'Contact', href: '/contact' },
      { label: 'GitHub',  href: 'https://github.com/binaryjack/ai-agencee' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-neutral-700/60 bg-neutral-900 px-6 py-14">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-16">
          {/* Brand column */}
          <div className="flex flex-col gap-3">
            <a href="/" className="flex items-center gap-2">
              <img 
                src="/ai-agencee-logo-dark.svg" 
                alt="ai-agencee logo" 
                className="h-7 w-auto"
              />
              <span className="text-sm font-bold text-neutral-100">
                ai-<span className="text-brand-400">agencee</span>
              </span>
            </a>
            <p className="text-xs leading-relaxed text-neutral-400">
              Enterprise-grade multi-agent orchestration engine. DAG-supervised parallel agents
              with streaming LLM output, intelligent model routing, and zero-API-key demo mode.
            </p>
            <div className="mt-1 flex gap-1">
              <span className="rounded-full bg-success-700/30 px-2 py-0.5 text-[10px] font-medium text-success-500">
                Production-Ready
              </span>
              <span className="rounded-full bg-brand-700/30 px-2 py-0.5 text-[10px] font-medium text-brand-300">
                MIT
              </span>
            </div>
          </div>

          {/* Link columns */}
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading} className="flex flex-col gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
                {col.heading}
              </h4>
              <ul className="flex flex-col gap-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-neutral-500 hover:text-neutral-200 transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-neutral-700/60 pt-6 text-center text-xs text-neutral-600">
          © {new Date().getFullYear()} ai-agencee. Released under the MIT license.
        </div>
      </div>
    </footer>
  )
}
