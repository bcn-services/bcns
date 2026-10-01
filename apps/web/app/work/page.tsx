import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { CtaBand } from "@/components/kit";
import { PastWork } from "@/components/past-work";
import { Reviews } from "@/components/reviews";
import { SiteFooter } from "@/components/site-footer";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.pageMeta.work.title,
  description: siteContent.pageMeta.work.description,
};

export default function WorkPage() {
  const { contactSection } = siteContent;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <PastWork />
        <Reviews />
        <CtaBand title={contactSection.title} description={contactSection.description} tone="plate" />
      </main>
      <SiteFooter />
    </div>
  );
}
