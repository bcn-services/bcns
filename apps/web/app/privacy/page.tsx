import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PageHead } from "@/components/kit";
import { LegalContent } from "@/components/legal-content";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.legal.privacy.title,
  description: siteContent.legal.privacy.description,
};

export default function PrivacyPage() {
  const { privacy } = siteContent.legal;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <PageHead
          eyebrow={privacy.eyebrow}
          title={privacy.title}
          description={privacy.description}
        />
        <LegalContent content={privacy} />
      </main>
      <SiteFooter />
    </div>
  );
}
