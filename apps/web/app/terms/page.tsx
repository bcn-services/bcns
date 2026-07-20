import type { Metadata } from "next";
import { Container } from "@nseluga/ui";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <main className="py-24">
      <Container>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{siteConfig.name} Terms of Service</h1>
        <div className="mt-8 prose">
          <p>[TERMS OF SERVICE BODY: Replace with your actual terms of service before launch.]</p>
        </div>
      </Container>
    </main>
  );
}
