import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AboutFounder } from "@/components/about-founder";
import { SiteFooter } from "@/components/site-footer";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.pageMeta.about.title,
  description: siteContent.pageMeta.about.description,
};

export default function AboutPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <AboutFounder />
      </main>
      <SiteFooter />
    </div>
  );
}
