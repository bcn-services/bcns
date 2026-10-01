import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Hero } from "@/components/hero";
import { ConnectStory } from "@/components/home/connect-story";
import { ProofRow } from "@/components/home/proof-row";
import { ContactSection } from "@/components/contact-section";
import { SiteFooter } from "@/components/site-footer";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.pageMeta.home.title,
  description: siteContent.pageMeta.home.description,
};

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <ConnectStory story={siteContent.story} tools={siteContent.tools} pillars={siteContent.pillars} />
        <ProofRow />
        <ContactSection />
      </main>
      <SiteFooter />
    </div>
  );
}
