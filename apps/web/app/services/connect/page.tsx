import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { CtaBand } from "@/components/kit";
import { ConnectHead } from "@/components/services/connect-head";
import { ConnectStage } from "@/components/services/connect-stage";
import { ConnectTools } from "@/components/services/connect-tools";
import { ConnectFaq } from "@/components/services/connect-faq";
import { SiteFooter } from "@/components/site-footer";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.pageMeta.connect.title,
  description: siteContent.pageMeta.connect.description,
};

export default function ConnectPage() {
  const { contactSection } = siteContent;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <ConnectHead />
        <ConnectStage />
        <ConnectTools />
        <ConnectFaq />
        <CtaBand title={contactSection.title} description={contactSection.description} tone="plate" />
      </main>
      <SiteFooter />
    </div>
  );
}
