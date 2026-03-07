import { SectionWrapper } from '@/components/layout/SectionWrapper'
import { AgentTypesShowcase } from '@/components/organisms/AgentTypesShowcase'
import { ComparisonMatrix } from '@/components/organisms/ComparisonMatrix'
import { ContributeSection } from '@/components/organisms/ContributeSection'
import { CtaBanner } from '@/components/organisms/CtaBanner'
import { FeatureHighlights } from '@/components/organisms/FeatureHighlights'
import { HeroSection } from '@/components/organisms/HeroSection'
import { ModelRoutingTable } from '@/components/organisms/ModelRoutingTable'
import { NpmPackagesSection } from '@/components/organisms/NpmPackagesSection'
import { QuickInstall } from '@/components/organisms/QuickInstall'
import { UseCasesSection } from '@/components/organisms/UseCasesSection'
import { WorkflowSteps } from '@/components/organisms/WorkflowSteps'
import { XmlAdvantageCallout } from '@/components/organisms/XmlAdvantageCallout'

export default function HomePage() {
  return (
    <>
      {/* Hero — full-width, no SectionWrapper (handles its own padding) */}
      <HeroSection />

      {/* Real-world CTO use cases */}
      <SectionWrapper id="use-cases" className="border-t border-neutral-700/40 bg-neutral-800/20">
        <UseCasesSection />
      </SectionWrapper>

      {/* Features by category */}
      <SectionWrapper id="features" className="border-t border-neutral-700/40">
        <FeatureHighlights />
      </SectionWrapper>

      {/* 5-phase workflow */}
      <SectionWrapper id="workflow" className="bg-neutral-800/20 border-y border-neutral-700/40">
        <WorkflowSteps />
      </SectionWrapper>

      {/* XML vs Markdown instruction architecture */}
      <SectionWrapper id="xml-instructions" className="border-b border-neutral-700/40">
        <XmlAdvantageCallout />
      </SectionWrapper>

      {/* Agent roster */}
      <SectionWrapper id="agents">
        <AgentTypesShowcase />
      </SectionWrapper>

      {/* Model routing table */}
      <SectionWrapper id="model-routing" className="bg-neutral-800/20 border-y border-neutral-700/40">
        <ModelRoutingTable />
      </SectionWrapper>

      {/* Us vs alternatives */}
      <SectionWrapper id="comparison">
        <ComparisonMatrix />
      </SectionWrapper>

      {/* Quick install */}
      <SectionWrapper id="install" className="bg-neutral-800/20 border-y border-neutral-700/40">
        <QuickInstall />
      </SectionWrapper>

      {/* npm packages */}
      <SectionWrapper id="packages">
        <NpmPackagesSection />
      </SectionWrapper>

      {/* Community & contributors */}
      <SectionWrapper id="contribute" className="bg-neutral-800/20 border-y border-neutral-700/40">
        <ContributeSection />
      </SectionWrapper>

      {/* CTA banner */}
      <SectionWrapper id="cta">
        <CtaBanner />
      </SectionWrapper>
    </>
  )
}
