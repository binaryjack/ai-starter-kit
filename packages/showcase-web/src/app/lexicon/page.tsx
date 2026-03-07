import { GradientText } from '@/components/atoms/GradientText'
import { SectionLabel } from '@/components/atoms/SectionLabel'
import { SectionWrapper } from '@/components/layout/SectionWrapper'
import { LexiconSearch } from '@/components/organisms/LexiconSearch'
import { LEXICON_ENTRIES } from '@/data/lexicon'

export const metadata = {
  title:       'Lexicon — ai-agencee',
  description: 'Alphabetical reference of every acronym, AI term, concept, pattern, and project-specific name used across the ai-agencee codebase and documentation.',
}

export default function LexiconPage() {
  const total = LEXICON_ENTRIES.length

  return (
    <>
      {/* Page header */}
      <SectionWrapper width="narrow" className="pb-8 pt-20">
        <SectionLabel>Reference</SectionLabel>
        <h1 className="mt-2 text-4xl font-extrabold text-neutral-100 sm:text-5xl">
          <GradientText>Lexicon</GradientText>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-400">
          Alphabetical reference of all {total} acronyms, AI concepts, engine primitives,
          patterns, and project-specific names used across the codebase and documentation.
          Search or browse — every term links to its context in the docs.
        </p>
      </SectionWrapper>

      {/* Search + grid */}
      <SectionWrapper width="wide" className="pt-0">
        <LexiconSearch />
      </SectionWrapper>
    </>
  )
}
