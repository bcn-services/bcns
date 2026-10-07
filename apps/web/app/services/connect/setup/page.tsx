import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PageHead } from "@/components/kit";
import { ConnectSetup } from "@/components/services/connect-setup";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.pageMeta.connectSetup.title,
  description: siteContent.pageMeta.connectSetup.description,
};

export default function ConnectSetupPage() {
  const { connectSetup } = siteContent;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <PageHead
          eyebrow={connectSetup.eyebrow}
          title={connectSetup.title}
          emphasis={connectSetup.emphasis}
          description={connectSetup.description}
          rule={false}
        />
        <ConnectSetup />
      </main>
      <SiteFooter />
    </div>
  );
}
