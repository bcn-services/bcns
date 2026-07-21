import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge, buttonVariants, Container } from "@nseluga/ui";
import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { SignatureMotif } from "@/components/signature-motif";

// Presentation-only: wrap a single word of the headline as the serif-italic
// blue accent (the one landing-hero accent move). Text is unchanged — only the
// matched word is restyled. Falls back to the plain string if not found.
const ACCENT_WORD = "already";
function renderHeadline(headline: string) {
  const index = headline.indexOf(ACCENT_WORD);
  if (index === -1) return headline;
  return (
    <>
      {headline.slice(0, index)}
      <span className="font-serif-accent font-normal italic text-primary">{ACCENT_WORD}</span>
      {headline.slice(index + ACCENT_WORD.length)}
    </>
  );
}

export function Hero() {
  const { badge, headline, subheadline, ctaPrimary, ctaSecondary, proofPoints } =
    siteContent.hero;

  return (
    <section id="top" className="relative overflow-hidden">
      {/* Brand atmosphere: grid + layered pastel-blue glow anchored at top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(65%_55%_at_50%_0%,hsl(var(--primary)/0.28),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40%_35%_at_75%_20%,hsl(var(--primary)/0.10),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent_80%)] bg-[linear-gradient(to_right,hsl(var(--border)/0.6)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.6)_1px,transparent_1px)] bg-[size:44px_44px]"
      />
      {/* Signature motif — low-opacity, drifting, tucked behind the headline in the
          top-right corner; does not compete with content. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 top-4 -z-10 hidden opacity-[0.18] animate-drift sm:block md:right-12 md:top-8"
      >
        <div className="scale-[1.6]">
          <SignatureMotif />
        </div>
      </div>

      <Container className="flex flex-col items-center pt-20 pb-12 text-center sm:pt-28 sm:pb-16">
        <Reveal variant="pop">
          <Badge>{badge}</Badge>
        </Reveal>

        <Reveal
          as="h1"
          delay={90}
          className="mt-6 max-w-4xl text-balance font-display text-4xl font-bold tracking-tight sm:text-6xl"
        >
          {renderHeadline(headline)}
        </Reveal>

        <Reveal
          as="p"
          delay={180}
          className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl"
        >
          {subheadline}
        </Reveal>

        <Reveal delay={270} className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link href="/#contact" className={`${buttonVariants({ size: "lg" })} hover-glow`}>
            {ctaPrimary}
            <ArrowRight aria-hidden />
          </Link>
          <Link
            href="/services#examples"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            {ctaSecondary}
          </Link>
        </Reveal>

        <ul className="mt-10 flex flex-col flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground sm:flex-row">
          {proofPoints.map((point, i) => (
            <Reveal as="li" key={point} delay={360 + i * 90} className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary" aria-hidden />
              {point}
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}
