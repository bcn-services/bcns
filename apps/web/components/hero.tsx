import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge, buttonVariants, Container } from "@bcns/ui";
import { siteContent } from "@/lib/content";

export function Hero() {
  const { badge, headline, subheadline, ctaPrimary, ctaSecondary, proofPoints } =
    siteContent.hero;

  return (
    <section id="top" className="relative overflow-hidden">
      {/* Brand atmosphere: faint grid + pastel-blue glow anchored at top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_50%_at_50%_0%,hsl(var(--primary)/0.20),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent_80%)] bg-[linear-gradient(to_right,hsl(var(--border)/0.6)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.6)_1px,transparent_1px)] bg-[size:44px_44px]"
      />

      <Container className="flex flex-col items-center py-20 text-center sm:py-28">
        <Badge className="animate-fade-up">
          {badge}
        </Badge>

        <h1 className="mt-6 max-w-4xl text-balance font-display text-4xl font-bold tracking-tight animate-fade-up sm:text-6xl">
          {headline}
        </h1>

        <p className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground animate-fade-up sm:text-xl">
          {subheadline}
        </p>

        <div className="mt-9 flex flex-col gap-3 animate-fade-up sm:flex-row">
          <Link href="/#contact" className={buttonVariants({ size: "lg" })}>
            {ctaPrimary}
            <ArrowRight aria-hidden />
          </Link>
          <Link
            href="/services#examples"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            {ctaSecondary}
          </Link>
        </div>

        <ul className="mt-10 flex flex-col flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground animate-fade-up sm:flex-row">
          {proofPoints.map((point) => (
            <li key={point} className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary" aria-hidden />
              {point}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
