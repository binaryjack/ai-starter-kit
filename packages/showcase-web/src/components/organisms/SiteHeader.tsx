'use client'

import { useEffect, useState } from 'react'

const NAV_LINKS = [
  { href: '/',          label: 'Home'     },
  { href: '/features',  label: 'Features' },
  { href: '/pricing',   label: 'Pricing'  },
  { href: '/services',  label: 'Services' },
  { href: '/docs',      label: 'Docs'     },
  { href: '/simulate',  label: 'Simulate' },
  { href: '/lexicon',   label: 'Lexicon'  },
  { href: '/about',     label: 'About'    },
  { href: '/contact',   label: 'Contact'  },
]

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  // Close on ESC + lock body scroll while drawer is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
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

          {/* Desktop nav — hidden below md */}
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

          {/* Right-side actions */}
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/binaryjack/ai-agencee"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-sm text-neutral-400 transition-colors hover:text-neutral-100 sm:block"
            >
              GitHub ↗
            </a>
            <a
              href="/pricing"
              className="hidden rounded-node bg-brand-500 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-400 md:inline-flex"
            >
              Get started
            </a>

            {/* Burger — visible below md only */}
            <button
              type="button"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-controls="mobile-drawer"
              onClick={() => setOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-node text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 md:hidden"
            >
              {open ? (
                /* X icon */
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="2" y1="2" x2="16" y2="16" />
                  <line x1="16" y1="2" x2="2" y2="16" />
                </svg>
              ) : (
                /* Hamburger icon */
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="2" y1="4"  x2="16" y2="4"  />
                  <line x1="2" y1="9"  x2="16" y2="9"  />
                  <line x1="2" y1="14" x2="16" y2="14" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile drawer ──────────────────────────────────────── */}

      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-neutral-950/70 backdrop-blur-sm transition-opacity md:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Slide-in panel */}
      <div
        id="mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`fixed inset-y-0 right-0 z-50 flex w-72 flex-col bg-neutral-900 shadow-2xl ring-1 ring-neutral-700/60 transition-transform duration-300 ease-in-out md:hidden ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="flex h-14 items-center justify-between border-b border-neutral-700/60 px-5">
          <a href="/" onClick={() => setOpen(false)} className="flex items-center gap-2">
            <span className="text-sm font-bold text-neutral-100">
              ai-<span className="text-brand-400">agencee</span>
            </span>
          </a>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-node text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="2" y1="2" x2="14" y2="14" />
              <line x1="14" y1="2" x2="2" y2="14" />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col gap-1 overflow-y-auto p-4" aria-label="Mobile navigation">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-node px-4 py-3 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Drawer footer CTAs */}
        <div className="mt-auto flex flex-col gap-3 border-t border-neutral-700/60 p-5">
          <a
            href="https://github.com/binaryjack/ai-agencee"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-node border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:text-neutral-100"
          >
            GitHub ↗
          </a>
          <a
            href="/pricing"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center rounded-node bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-400"
          >
            Get started
          </a>
        </div>
      </div>
    </>
  )
}
