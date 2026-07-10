import { SiteHeader } from "@/components/site-header";
import { Hero } from "@/components/hero";
import { ProblemSolution } from "@/components/problem-solution";
import { HowItWorks } from "@/components/how-it-works";
import { DeliveryModels } from "@/components/delivery-models";
import { UseCases } from "@/components/use-cases";
import { ContactSection } from "@/components/contact-section";
import { SiteFooter } from "@/components/site-footer";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <ProblemSolution />
        <HowItWorks />
        <DeliveryModels />
        <UseCases />
        <ContactSection />
      </main>
      <SiteFooter />
    </div>
  );
}
