'use client'

import { LexiconEntryCard } from '@/components/molecules/LexiconEntryCard'
import { LEXICON_ENTRIES } from '@/data/lexicon'
import type { LexiconCategory } from '@/data/lexicon.types'
import { useState } from 'react'

type FilterCategory = LexiconCategory | 'all'

const CATEGORY_CHIPS: { value: FilterCategory; label: string }[] = [
  { value: 'all',        label: 'All'        },
  { value: 'engine',     label: 'Engine'     },
  { value: 'provider',   label: 'Provider'   },
  { value: 'resilience', label: 'Resilience' },
  { value: 'security',   label: 'Security'   },
  { value: 'ai',         label: 'AI / ML'    },
  { value: 'pattern',    label: 'Pattern'    },
  { value: 'api',        label: 'API / Class' },
  { value: 'project',    label: 'Project'    },
]

function normalize(s: string): string {
  return s.toLowerCase()
}

export function LexiconSearch() {
  const [query,    setQuery]    = useState('')
  const [category, setCategory] = useState<FilterCategory>('all')

  const q = normalize(query.trim())

  const filtered = LEXICON_ENTRIES.filter((e) => {
    const matchesCat = category === 'all' || e.category === category
    if (!matchesCat) return false
    if (!q) return true
    return (
      normalize(e.term).includes(q)       ||
      (e.acronym ? normalize(e.acronym).includes(q) : false) ||
      normalize(e.definition).includes(q)
    )
  })

  // Group by letter
  const byLetter = filtered.reduce<Record<string, typeof LEXICON_ENTRIES>>((acc, e) => {
    const key = e.letter
    if (!acc[key]) acc[key] = []
    acc[key].push(e)
    return acc
  }, {})

  const letters = Object.keys(byLetter).sort()
  const isSearching = q.length > 0

  return (
    <div className="flex flex-col gap-8">

      {/* ── Search bar ─────────────────────────────────────────── */}
      <div className="sticky top-14 z-30 bg-neutral-900/90 pb-4 pt-2 backdrop-blur-md">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
            fill="none" stroke="currentColor" strokeWidth={2}
            viewBox="0 0 24 24" aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="search"
            placeholder="Search terms, acronyms, definitions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-node border border-neutral-700 bg-neutral-800 py-2.5 pl-10 pr-10 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORY_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setCategory(chip.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                category === chip.value
                  ? 'bg-brand-500 text-neutral-950'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 border border-neutral-700'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Results count + letter jump nav ────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-neutral-500">
          {isSearching
            ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${query}"`
            : `${filtered.length} term${filtered.length !== 1 ? 's' : ''}`}
        </p>

        {!isSearching && letters.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {letters.map((l) => (
              <a
                key={l}
                href={`#letter-${l}`}
                className="flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-brand-400"
              >
                {l}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ── Empty state ────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <span className="text-3xl">🔍</span>
          <p className="text-sm text-neutral-400">No terms match <strong className="text-neutral-200">"{query}"</strong></p>
          <p className="text-xs text-neutral-600">
            Try a different word, acronym, or{' '}
            <button
              type="button"
              className="text-brand-400 underline underline-offset-2 hover:text-brand-300"
              onClick={() => { setQuery(''); setCategory('all') }}
            >
              clear filters
            </button>
          </p>
        </div>
      )}

      {/* ── Grouped by letter ──────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="flex flex-col gap-10">
          {letters.map((letter) => (
            <div key={letter} id={isSearching ? undefined : `letter-${letter}`} className="scroll-mt-40">
              {/* Letter divider — only when not searching (grouped view) */}
              {!isSearching && (
                <div className="mb-4 flex items-center gap-3">
                  <span className="font-mono text-2xl font-extrabold text-neutral-700">{letter}</span>
                  <div className="flex-1 border-t border-neutral-700/60" />
                  <span className="text-xs text-neutral-600">
                    {byLetter[letter].length} term{byLetter[letter].length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {byLetter[letter].map((entry) => (
                  <LexiconEntryCard key={entry.id} entry={entry} highlight={q} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
