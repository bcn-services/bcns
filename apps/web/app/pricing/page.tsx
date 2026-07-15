import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Pricing } from "@/components/pricing";
import { Faq } from "@/components/faq";
import { SiteFooter } from "@/components/site-footer";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.pageMeta.pricing.title,
  description: siteContent.pageMeta.pricing.description,
};

export default function PricingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Pricing />
        <Faq />
      </main>
      <SiteFooter />
    </div>
  );
}
