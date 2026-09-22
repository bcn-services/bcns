import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PageHead } from "@/components/kit";
import { LegalContent } from "@/components/legal-content";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.legal.terms.title,
  description: siteContent.legal.terms.description,
};

export default function TermsPage() {
  const { terms } = siteContent.legal;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <PageHead
          eyebrow={terms.eyebrow}
          title={terms.title}
          description={terms.description}
        />
        <LegalContent content={terms} />
      </main>
      <SiteFooter />
    </div>
  );
}
