import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CtaBand, Eyebrow, GUTTER, emphasize } from "@/components/kit";
import { Reveal } from "@/components/reveal";
import { DeluxeAsk } from "@/components/services/deluxe-ask";
import { DeluxeBuild, DeluxeSteps, DeluxeWork } from "@/components/services/deluxe-sections";
import {
  BTN_OUTLINE,
  BTN_PRIMARY,
  HeadWithActions,
  PriceBlock,
  Section,
} from "@/components/services/deluxe-shared";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.pageMeta.deluxe.title,
  description: siteContent.pageMeta.deluxe.description,
};

export default function DeluxePage() {
  const { useCases, deluxeDemo, hero, pricing, contactSection } = siteContent;
  const tier = pricing.tiers.find((t) => t.id === "deluxe");
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <HeadWithActions
          eyebrow={useCases.blockEyebrow}
          title={useCases.blockTitle}
          emphasis={deluxeDemo.titleEmphasis}
          description={useCases.blockDescription}
        >
          <Link href="/#contact" className={BTN_PRIMARY}>
            {hero.ctaPrimary}
          </Link>
          <Link href="#how" className={BTN_OUTLINE}>
            {deluxeDemo.ctaSecondary}
          </Link>
        </HeadWithActions>

        <section id="how" aria-labelledby="ask-heading" className={`${GUTTER} scroll-mt-20 pb-[4.5rem] pt-10 lg:pb-[6.5rem] lg:pt-14`}>
          <Reveal>
            <Eyebrow>{deluxeDemo.howEyebrow}</Eyebrow>
          </Reveal>
          <Reveal
            as="h2"
            id="ask-heading"
            delay={80}
            className="mt-4 text-balance text-[clamp(1.9rem,3.8vw,2.75rem)] font-light leading-[1.12] tracking-[-0.02em]"
          >
            {emphasize(deluxeDemo.askTitle, deluxeDemo.askEmphasis)}
          </Reveal>
          <Reveal as="p" delay={160} className="mt-4 max-w-[38rem] text-[1.1875rem] leading-[1.6] text-muted-foreground">
            {deluxeDemo.askLede}
          </Reveal>
          <DeluxeAsk />
          <DeluxeSteps />
        </section>

        <Section>
          <DeluxeBuild />
        </Section>
        <Section>
          <DeluxeWork />
        </Section>
        <Section id="price">
          {tier && <PriceBlock eyebrow={deluxeDemo.pricingEyebrow} tier={tier} />}
        </Section>

        <CtaBand title={contactSection.title} description={contactSection.description} tone="plate" />
      </main>
      <SiteFooter />
    </div>
  );
}
