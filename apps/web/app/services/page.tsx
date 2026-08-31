import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { PageHead, CtaBand } from "@/components/kit";
import { UseCases } from "@/components/use-cases";
import { AiConsult } from "@/components/ai-consult";
import { HowItWorks } from "@/components/how-it-works";
import { SiteFooter } from "@/components/site-footer";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.pageMeta.services.title,
  description: siteContent.pageMeta.services.description,
};

export default function ServicesPage() {
  const { useCases, contactSection } = siteContent;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <PageHead
          eyebrow={useCases.eyebrow}
          title={useCases.title}
          emphasis="serve you"
          description={useCases.description}
        />
        <UseCases />
        <AiConsult />
        <HowItWorks variant="rows" />
        {/* This page's bold moment: the full-bleed blue plate. */}
        <CtaBand title={contactSection.title} description={contactSection.description} tone="plate" />
      </main>
      <SiteFooter />
    </div>
  );
}
