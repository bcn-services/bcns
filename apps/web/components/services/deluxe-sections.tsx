import Link from "next/link";

import { Reveal } from "@/components/reveal";
import { emphasize } from "@/components/kit";
import { siteContent } from "@/lib/content";
import { SectionHeading, Tag } from "./deluxe-shared";

const CARD = "rounded-2xl border border-border bg-card px-6 pb-[1.375rem] pt-[1.625rem]";

/** The four "how a build works" blurbs under the demo. */
export function DeluxeSteps() {
  const { steps } = siteContent.deluxeDemo;
  return (
    <ol className="mt-12 grid gap-[1.375rem] border-t border-border pt-7 min-[700px]:grid-cols-2 min-[700px]:gap-x-8 min-[700px]:gap-y-7 min-[1100px]:grid-cols-4">
      {steps.map((step, i) => (
        <Reveal as="li" key={step.label} delay={i * 80}>
          <p className="font-display text-[0.8125rem] font-medium uppercase tracking-[0.16em] text-primary-ink">
            {step.label}
          </p>
          <h3 className="mt-2 text-[1.3rem] font-normal leading-[1.2] tracking-[-0.01em]">
            {emphasize(step.title, step.emphasis)}
          </h3>
          <p className="mt-2 text-[0.9375rem] leading-[1.6] text-muted-foreground">{step.description}</p>
        </Reveal>
      ))}
    </ol>
  );
}

/** "What we build": the four use-case cards. */
export function DeluxeBuild() {
  const { buildEyebrow, buildTitle, buildEmphasis } = siteContent.deluxeDemo;
  const { items } = siteContent.useCases;
  return (
    <>
      <SectionHeading eyebrow={buildEyebrow} title={buildTitle} emphasis={buildEmphasis} />
      <div className="grid gap-4 min-[700px]:grid-cols-2 min-[700px]:gap-5 min-[1200px]:grid-cols-4 min-[1200px]:gap-6">
        {items.map((item, i) => (
          <Reveal key={item.tag} delay={i * 80} className={CARD}>
            <Tag>{item.tag}</Tag>
            <h3 className="mt-2.5 text-2xl font-semibold leading-[1.2] tracking-[-0.01em]">{item.title}</h3>
            <p className="mt-2.5 text-[0.9375rem] leading-[1.65] text-muted-foreground">{item.description}</p>
          </Reveal>
        ))}
      </div>
    </>
  );
}

/** Past work: two case cards linking to their case studies. */
export function DeluxeWork() {
  const { workEyebrow, workTitle, workEmphasis, workCta, workLabels } = siteContent.deluxeDemo;
  const { items, caseStudy } = siteContent.pastWork;
  return (
    <>
      <SectionHeading eyebrow={workEyebrow} title={workTitle} emphasis={workEmphasis} />
      <div className="grid gap-4 min-[800px]:grid-cols-2 min-[800px]:gap-6">
        {items.map((item, i) => (
          <Reveal key={item.slug} delay={i * 100}>
            <Link
              href={`/work/${item.slug}`}
              className={`lift-card flex h-full flex-col ${CARD} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
            >
              <span>
                <Tag>{item.tag}</Tag>
              </span>
              <h3 className="mt-2.5 text-[1.35rem] font-semibold leading-[1.2] tracking-[-0.01em]">
                {item.title}
              </h3>
              <dl className="mt-3.5 grid gap-3">
                {[
                  { label: caseStudy.problemLabel, text: item.problem },
                  { label: caseStudy.outcomeLabel, text: item.outcome },
                ].map(({ label, text }) => (
                  <div key={label}>
                    <dt className="font-display text-xs font-medium uppercase tracking-[0.14em] text-primary-ink">
                      {label}
                    </dt>
                    <dd className="mt-[3px] text-[0.9375rem] leading-[1.6] text-muted-foreground">{text}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5 border-t border-border pt-3.5">
                <span className="font-display text-[0.9375rem] font-medium">{workLabels[i]}</span>
                <span className="text-[0.9375rem] font-semibold text-primary-ink">{workCta} &rarr;</span>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </>
  );
}
