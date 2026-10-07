import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { serviceJsonLd } from "@/lib/seo";
import { SiteHeader } from "@/components/site-header";
import { CtaBand } from "@/components/cta-band";
import { ConnectHead } from "@/components/services/connect-head";
import { ConnectStage } from "@/components/services/connect-stage";
import { ConnectTools } from "@/components/services/connect-tools";
import { ConnectFaq } from "@/components/services/connect-faq";
import { ConnectSetupTeaser } from "@/components/services/connect-setup";
import { SiteFooter } from "@/components/site-footer";
import { siteConfig } from "@/lib/site";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.pageMeta.connect.title,
  description: siteContent.pageMeta.connect.description,
};

export default function ConnectPage() {
  const { contactSection, connect, connectDemo, tools } = siteContent;
  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd data={serviceJsonLd("connect")} />
      <SiteHeader />
      <main className="flex-1">
        <ConnectHead />
        <ConnectStage connect={connect} connectDemo={connectDemo} tools={tools} />
        <ConnectTools />
        <ConnectFaq />
        <ConnectSetupTeaser />
        <CtaBand title={contactSection.title} description={contactSection.description} tone="plate" highlights={[]} secondary={siteConfig.signIn} />
      </main>
      <SiteFooter />
    </div>
  );
}
