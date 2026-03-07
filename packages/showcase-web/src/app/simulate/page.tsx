'use client'

import { SimulatorPanel } from '@/components/organisms/SimulatorPanel'
import { SCENARIOS, type SimScenario } from '@/data/scenarios'
import { useState } from 'react'

const ACCENT_CLASSES: Record<string, { bg: string; border: string; text: string }> = {
  blue:   { bg: 'from-blue-950/60 to-neutral-900',   border: 'border-blue-700/40',   text: 'text-blue-400'   },
  green:  { bg: 'from-green-950/60 to-neutral-900',  border: 'border-green-700/40',  text: 'text-green-400'  },
  red:    { bg: 'from-red-950/60 to-neutral-900',    border: 'border-red-700/40',    text: 'text-red-400'    },
  orange: { bg: 'from-orange-950/60 to-neutral-900', border: 'border-orange-700/40', text: 'text-orange-400' },
}

function ScenarioCard({
  scenario,
  isSelected,
  onSelect,
}: {
  scenario:   SimScenario
  isSelected: boolean
  onSelect:   (s: SimScenario) => void
}) {
  const acc = ACCENT_CLASSES[scenario.accentColor] ?? ACCENT_CLASSES.blue

  return (
    <article
      className={`flex flex-col gap-4 rounded-xl border bg-gradient-to-br ${acc.bg} ${acc.border} p-6 transition-all hover:scale-[1.01] cursor-pointer ${isSelected ? 'ring-2 ring-brand-500' : ''}`}
      onClick={() => onSelect(scenario)}
    >
      {/* Number badge */}
      <div className="flex items-center justify-between">
        <span className={`font-mono text-xs font-bold ${acc.text}`}># {scenario.number}</span>
        <span className={`rounded-full border ${acc.border} px-2 py-0.5 text-[10px] font-semibold ${acc.text}`}>
          {scenario.lanes.length} lanes
        </span>
      </div>

      {/* Title */}
      <div>
        <h3 className="text-sm font-bold text-neutral-100">{scenario.title}</h3>
        <p className="mt-0.5 text-xs text-neutral-400">{scenario.subtitle}</p>
      </div>

      {/* Description */}
      <p className="text-xs leading-relaxed text-neutral-500 line-clamp-3">{scenario.description}</p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mt-auto">
        {scenario.tags.map(tag => (
          <span
            key={tag}
            className="rounded-md bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-400"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* CTA */}
      <button
        className={`mt-1 w-full rounded-md py-2 text-xs font-semibold transition-colors ${
          isSelected
            ? 'bg-brand-500 text-white'
            : 'border border-neutral-700 text-neutral-300 hover:border-brand-500 hover:text-brand-300'
        }`}
        onClick={e => { e.stopPropagation(); onSelect(scenario) }}
      >
        {isSelected ? 'Viewing simulation ↓' : '▶ Run Simulation'}
      </button>
    </article>
  )
}

export default function SimulatePage() {
  const [selected, setSelected] = useState<SimScenario | null>(null)

  function handleSelect(s: SimScenario) {
    setSelected(prev => (prev?.id === s.id ? null : s))
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* ── Hero ── */}
      <section className="border-b border-neutral-800 px-6 py-14 text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand-400">Live Browser Simulator</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-neutral-50 sm:text-4xl">
          Watch the engine work
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-neutral-400 leading-relaxed">
          Scripted event replays — no API keys, no infra. Every scenario runs deterministically, showing
          real agent names, supervisor decisions, PII scrubbing, retries, handoffs, and cost accumulation
          exactly as the live engine would produce them.
        </p>
      </section>

      {/* ── Scenario cards ── */}
      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {SCENARIOS.map(s => (
            <ScenarioCard
              key={s.id}
              scenario={s}
              isSelected={selected?.id === s.id}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </section>

      {/* ── Simulator panel (inline below cards) ── */}
      {selected && (
        <section className="mx-auto max-w-7xl px-6 pb-16">
          <SimulatorPanel
            key={selected.id}
            scenario={selected}
            onReset={() => setSelected(null)}
          />
        </section>
      )}
    </main>
  )
}
