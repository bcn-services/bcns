import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { PageHead, CtaBand } from "@/components/kit";
import { AboutFounder } from "@/components/about-founder";
import { SiteFooter } from "@/components/site-footer";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.pageMeta.about.title,
  description: siteContent.pageMeta.about.description,
};

export default function AboutPage() {
  const { about, contactSection } = siteContent;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <PageHead
          eyebrow={about.eyebrow}
          title={about.title}
          emphasis="behind bcns"
          description={about.description}
        />
        <AboutFounder />
        <CtaBand title={contactSection.title} description={contactSection.description} />
      </main>
      <SiteFooter />
    </div>
  );
}
