const NAV_LINKS = [
  { href: '/',          label: 'Home'     },
  { href: '/features',  label: 'Features' },
  { href: '/pricing',   label: 'Pricing'  },
  { href: '/services',  label: 'Services' },
  { href: '/docs',      label: 'Docs'     },
  { href: '/about',     label: 'About'    },
  { href: '/contact',   label: 'Contact'  },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-neutral-700/60 bg-neutral-900/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
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

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary navigation">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-neutral-400 transition-colors hover:text-neutral-100"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/binaryjack/ai-agencee"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden text-sm text-neutral-400 hover:text-neutral-100 transition-colors sm:block"
          >
            GitHub ↗
          </a>
          <a
            href="/pricing"
            className="rounded-node bg-brand-500 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-400 transition-colors"
          >
            Get started
          </a>
        </div>
      </div>
    </header>
  )
}
