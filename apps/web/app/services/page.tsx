import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { PageHead, CtaBand, Eyebrow, GUTTER, emphasize } from "@/components/kit";
import { PillarCubes } from "@/components/pillar-cubes";
import { Reveal } from "@/components/reveal";
import { SiteFooter } from "@/components/site-footer";
import { siteContent } from "@/lib/content";

export const metadata: Metadata = {
  title: siteContent.pageMeta.services.title,
  description: siteContent.pageMeta.services.description,
};

export default function ServicesPage() {
  const { servicesOverview, useCases, howItWorks, contactSection } = siteContent;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <PageHead
          eyebrow={servicesOverview.eyebrow}
          title={servicesOverview.title}
          emphasis={servicesOverview.emphasis}
          description={useCases.description}
          rule={false}
        />

        <section className={`${GUTTER} pt-2`} aria-label={servicesOverview.cubeLabel}>
          <PillarCubes />
        </section>

        <section className="border-t border-border py-[4.5rem] lg:py-[6.5rem]" aria-labelledby="process-heading">
          <div className={GUTTER}>
            <Reveal>
              <Eyebrow>{howItWorks.eyebrow}</Eyebrow>
            </Reveal>
            <Reveal
              as="h2"
              id="process-heading"
              delay={80}
              className="mt-4 text-balance text-[clamp(1.9rem,3.8vw,2.75rem)] font-light leading-[1.12] tracking-[-0.02em]"
            >
              {emphasize(servicesOverview.processTitle, servicesOverview.processEmphasis)}
            </Reveal>
            <Reveal as="p" delay={160} className="mt-4 max-w-xl text-[1.1875rem] leading-relaxed text-muted-foreground">
              {howItWorks.description}
            </Reveal>
            <ol className="mt-10 grid lg:grid-cols-3 lg:gap-10">
              {howItWorks.items.map((item, i) => (
                <Reveal as="li" key={item.step} delay={i * 90} className="border-t border-border pb-7 pt-6 lg:pt-7">
                  <span className="font-display text-[0.8125rem] font-medium tracking-[0.16em] text-primary-ink">
                    {item.step}
                  </span>
                  <h3 className="mt-2.5 font-display text-2xl font-medium tracking-[-0.01em]">{item.title}</h3>
                  <p className="mt-2.5 max-w-[30rem] text-[0.9375rem] leading-[1.65] text-muted-foreground">
                    {item.description}
                  </p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <CtaBand title={contactSection.title} description={contactSection.description} tone="plate" />
      </main>
      <SiteFooter />
    </div>
  );
}
