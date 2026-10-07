import Link from "next/link";
import { Eyebrow, GUTTER } from "@/components/kit";
import { Reveal } from "@/components/reveal";
import { siteContent, type ConnectSetupStepList } from "@/lib/content";
import { siteConfig } from "@/lib/site";

const LINK =
  "rounded-sm font-medium text-primary-ink underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SECTION = "border-t border-border py-[4.5rem] lg:py-[6.5rem]";
const H2 =
  "mt-4 text-balance text-[clamp(1.9rem,3.8vw,2.75rem)] font-light leading-[1.12] tracking-[-0.02em]";

function StepList({ list, id }: { list: ConnectSetupStepList; id: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 lg:p-8" aria-labelledby={id} role="group">
      <h3 id={id} className="font-display text-[1.375rem] font-medium">
        {list.title}
      </h3>
      <p className="mt-2 text-muted-foreground">{list.intro}</p>
      <ol className="mt-6 space-y-4">
        {list.steps.map((step, i) => (
          <li key={step} className="flex gap-4 leading-relaxed">
            <span
              aria-hidden
              className="flex size-7 flex-none items-center justify-center rounded-full bg-secondary font-display text-sm font-medium text-primary-ink"
            >
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-[0.9375rem] leading-relaxed text-muted-foreground">{list.note}</p>
    </div>
  );
}

/** Body of /services/connect/setup, below the PageHead. Every string comes from `connectSetup`. */
export function ConnectSetup() {
  const c = siteContent.connectSetup;
  return (
    <>
      <section className={SECTION} aria-labelledby="setup-what">
        <div className={GUTTER}>
          <Reveal>
            <Eyebrow>{c.whatTitle}</Eyebrow>
          </Reveal>
          <h2 id="setup-what" className="sr-only">
            {c.whatTitle}
          </h2>
          <ul className="mt-2 grid gap-8 md:grid-cols-3">
            {c.whatPoints.map((p, i) => (
              <Reveal as="li" key={p.title} delay={i * 80}>
                <b className="font-display text-[1.25rem] font-medium">{p.title}</b>
                <p className="mt-2 leading-relaxed text-muted-foreground">{p.description}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section className={SECTION} aria-labelledby="setup-address">
        <div className={GUTTER}>
          <Reveal>
            <Eyebrow>{c.needTitle}</Eyebrow>
          </Reveal>
          <Reveal as="p" delay={80} className="mt-4 max-w-[40rem] text-[1.1875rem] leading-relaxed">
            {c.needBody}
          </Reveal>
          <Reveal as="h2" id="setup-address" delay={120} className={H2}>
            {c.addressTitle}
          </Reveal>
          <Reveal as="p" delay={160} className="mt-3 max-w-[40rem] text-muted-foreground">
            {c.addressHelp}
          </Reveal>
          <Reveal delay={200} className="mt-5">
            <code className="inline-block max-w-full select-all break-all rounded-xl border border-border bg-secondary px-5 py-3 font-mono text-[1.0625rem]">
              {c.connectorUrl}
            </code>
          </Reveal>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <Reveal>
              <StepList list={c.claude} id="setup-claude" />
            </Reveal>
            <Reveal delay={80}>
              <StepList list={c.chatgpt} id="setup-chatgpt" />
            </Reveal>
          </div>
        </div>
      </section>

      <section className={SECTION} aria-labelledby="setup-help">
        <div className={`${GUTTER} grid gap-10 md:grid-cols-2`}>
          <Reveal>
            <h2 id="setup-help" className="font-display text-[1.5rem] font-medium">
              {c.supportTitle}
            </h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              {c.supportBody.split(siteConfig.email)[0]}
              <a href={`mailto:${siteConfig.email}`} className={LINK}>
                {siteConfig.email}
              </a>
              {c.supportBody.split(siteConfig.email)[1]}
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="font-display text-[1.5rem] font-medium">{c.privacyTitle}</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{c.privacyBody}</p>
            <p className="mt-3">
              <Link href={c.privacyHref} className={LINK}>
                {c.privacyLinkLabel}
              </Link>
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}

/** One-line pointer on /services/connect to the setup page. */
export function ConnectSetupTeaser() {
  const c = siteContent.connectSetup;
  return (
    <section className={SECTION}>
      <div className={`${GUTTER} flex flex-col items-start justify-between gap-5 md:flex-row md:items-center`}>
        <p className="max-w-[36rem] font-display text-[1.375rem] font-light leading-snug">{c.teaserTitle}</p>
        <Link href="/services/connect/setup" className={`${LINK} text-[1.0625rem]`}>
          {c.teaserLabel}
        </Link>
      </div>
    </section>
  );
}
