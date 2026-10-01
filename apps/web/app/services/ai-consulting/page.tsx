import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CtaBand, GUTTER } from "@/components/kit";
import { AiDay } from "@/components/services/ai-day";
import { AiFaq } from "@/components/services/ai-faq";
import { AiLeave } from "@/components/services/ai-sections";
import {
  BTN_OUTLINE,
  BTN_PRIMARY,
  HeadWithActions,
  PriceBlock,
  Section,
} from "@/components/services/deluxe-shared";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.pageMeta.aiConsulting.title,
  description: siteContent.pageMeta.aiConsulting.description,
};

export default function AiConsultingPage() {
  const { aiConsult, aiDay, hero, pricing, contactSection } = siteContent;
  const tier = pricing.tiers.find((t) => t.id === "consulting");
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <HeadWithActions
          eyebrow={aiConsult.eyebrow}
          title={aiConsult.title}
          emphasis={aiDay.titleEmphasis}
          description={aiConsult.description}
          maxWidth="max-w-[20ch]"
        >
          <span className="font-display text-xl font-medium text-primary-ink">{aiConsult.rate}</span>
          <Link href="/#contact" className={BTN_PRIMARY}>
            {hero.ctaPrimary}
          </Link>
          <Link href="#how" className={BTN_OUTLINE}>
            {aiDay.ctaSecondary}
          </Link>
        </HeadWithActions>

        <section
          id="how"
          aria-label={aiConsult.description}
          className={`${GUTTER} scroll-mt-20 pb-[4.5rem] pt-10 lg:pb-[6.5rem] lg:pt-14`}
        >
          <AiDay />
        </section>

        <Section>
          <AiLeave />
        </Section>
        <Section id="price">
          {tier && <PriceBlock eyebrow={aiDay.pricingEyebrow} tier={tier} />}
        </Section>
        <Section id="faq">
          <AiFaq />
        </Section>

        <CtaBand title={contactSection.title} description={contactSection.description} tone="plate" />
      </main>
      <SiteFooter />
    </div>
  );
}
