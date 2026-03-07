import type { LexiconCategory, LexiconEntry } from '@/data/lexicon.types'

interface Props {
  readonly entry:        LexiconEntry
  readonly highlight?:  string
}

const CATEGORY_LABEL: Record<LexiconCategory, string> = {
  engine:     'Engine',
  provider:   'Provider',
  resilience: 'Resilience',
  security:   'Security',
  ai:         'AI / ML',
  pattern:    'Pattern',
  api:        'API / Class',
  project:    'Project',
} satisfies Record<LexiconCategory, string>

const CATEGORY_STYLE: Record<LexiconCategory, string> = {
  engine:     'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  provider:   'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  resilience: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  security:   'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  ai:         'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  pattern:    'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
  api:        'bg-neutral-500/10 text-neutral-400 border border-neutral-500/20',
  project:    'bg-brand-500/10 text-brand-400 border border-brand-500/20',
} satisfies Record<LexiconCategory, string>

function highlightMatch(text: string, query: string): string {
  if (!query.trim()) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(
    new RegExp(`(${escaped})`, 'gi'),
    '<mark class="bg-brand-500/25 text-brand-300 rounded-sm px-0.5">$1</mark>',
  )
}

export function LexiconEntryCard({ entry, highlight = '' }: Props) {
  const termHtml    = highlightMatch(entry.term, highlight)
  const acronymHtml = entry.acronym ? highlightMatch(entry.acronym, highlight) : undefined
  const defHtml     = highlightMatch(entry.definition, highlight)

  return (
    <article
      id={entry.id}
      className="flex flex-col gap-3 rounded-node border border-neutral-700 bg-neutral-800 p-5 scroll-mt-24"
    >
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3
            className="font-mono text-sm font-bold text-neutral-100"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: termHtml }}
          />
          {acronymHtml && (
            <p
              className="text-xs text-neutral-500"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: acronymHtml }}
            />
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CATEGORY_STYLE[entry.category]}`}>
          {CATEGORY_LABEL[entry.category]}
        </span>
      </div>

      {/* Definition */}
      <p
        className="text-xs leading-relaxed text-neutral-400"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: defHtml }}
      />

      {/* See also */}
      {entry.seeAlso && entry.seeAlso.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-neutral-700/50 pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">See also</span>
          {entry.seeAlso.map((id) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-brand-400 transition-colors hover:bg-neutral-700 hover:text-brand-300"
            >
              {id}
            </a>
          ))}
        </div>
      )}
    </article>
  )
}
