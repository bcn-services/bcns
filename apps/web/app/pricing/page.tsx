import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { PageHead } from "@/components/kit";
import { CtaBand } from "@/components/cta-band";
import { Pricing } from "@/components/pricing";
import { Faq } from "@/components/faq";
import { SiteFooter } from "@/components/site-footer";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.pageMeta.pricing.title,
  description: siteContent.pageMeta.pricing.description,
};

export default function PricingPage() {
  const { pricing, contactSection } = siteContent;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* This page's bold moment: the oversized type. */}
        <PageHead
          eyebrow={pricing.eyebrow}
          title={pricing.title}
          emphasis="actually need"
          description={pricing.description}
          size="oversized"
          rule={false}
        />
        <Pricing />
        <Faq faq={siteContent.faq} emphasis={siteContent.connectDemo.faqEmphasis} />
        <CtaBand title={contactSection.title} description={contactSection.description} tone="plate" highlights={[]} />
      </main>
      <SiteFooter />
    </div>
  );
}
