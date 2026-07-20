import type { Metadata } from "next";
import { Container } from "@nseluga/ui";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <main className="py-24">
      <Container>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{siteConfig.name} Privacy Policy</h1>
        <div className="mt-8 prose">
          <p>[PRIVACY POLICY BODY: Replace with your actual privacy policy before launch.]</p>
        </div>
      </Container>
    </main>
  );
}
