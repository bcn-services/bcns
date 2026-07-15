import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { HowItWorks } from "@/components/how-it-works";
import { UseCases } from "@/components/use-cases";
import { SiteFooter } from "@/components/site-footer";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.pageMeta.services.title,
  description: siteContent.pageMeta.services.description,
};

export default function ServicesPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <HowItWorks />
        <UseCases />
      </main>
      <SiteFooter />
    </div>
  );
}
