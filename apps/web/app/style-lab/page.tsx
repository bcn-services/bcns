import { Fraunces } from "next/font/google";
import { ArrowRight } from "lucide-react";
import { Container } from "@nseluga/ui";
import { SiteHeader } from "@/components/site-header";
import { SignatureMotif } from "@/components/signature-motif";

// Serif accent candidate, scoped to this preview page only (nothing global changes).
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif-accent",
  display: "swap",
  style: ["italic", "normal"],
  weight: ["400", "500"],
});

// Small labeled rule-line eyebrow, editorial style.
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-8 bg-primary/70" />
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{children}</span>
    </div>
  );
}

function VariantFrame({
  label,
  blurb,
  children,
}: {
  label: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-8 sm:p-10">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <span className="rounded-md bg-primary/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{blurb}</span>
      </div>
      {children}
    </div>
  );
}

export default function StyleLabPage() {
  return (
    <div className={`${fraunces.variable} flex min-h-dvh flex-col`}>
      <SiteHeader />
      <main className="flex-1 py-16">
        <Container className="flex flex-col gap-10">
          <div className="flex flex-col gap-3">
            <Eyebrow>Style lab · preview only</Eyebrow>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Three stylization intensities
            </h1>
            <p className="max-w-2xl text-muted-foreground">
              Same content, three treatments. Pick one and I&apos;ll roll it across the
              real pages. Hover the buttons; the signature motif below animates live.
            </p>
          </div>

          {/* 1. Restrained */}
          <VariantFrame label="Restrained" blurb="all sans · brand-safe">
            <Eyebrow>What we build</Eyebrow>
            <h2 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
              Tools shaped to your <span className="text-primary">business</span>,
              <br className="hidden sm:block" /> not the other way around
            </h2>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Precise, confident, understated. Motion and pattern carry the personality.
            </p>
            <a
              href="#"
              className="group mt-7 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform duration-200 hover:-translate-y-0.5"
            >
              Book a free consult
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
            </a>
          </VariantFrame>

          {/* 2. Editorial accent */}
          <VariantFrame label="Editorial accent" blurb="sans + serif-italic accent word">
            <Eyebrow>What we build</Eyebrow>
            <h2 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
              Tools shaped to your{" "}
              <span className="font-[var(--font-serif-accent)] font-normal italic text-primary">
                business
              </span>
              ,<br className="hidden sm:block" /> not the other way around
            </h2>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              One serif-italic accent word per headline — L2&apos;s two-tone trick, in blue not
              gold. A touch of magazine personality; bends the all-sans rule slightly.
            </p>
            <a
              href="#"
              className="group mt-7 inline-flex items-center gap-2 rounded-lg border border-primary/40 px-6 py-3 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary/10"
            >
              Book a free consult
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
            </a>
          </VariantFrame>

          {/* 3. Bold */}
          <VariantFrame label="Bold" blurb="big type · serif accent · signature motif · strong motion">
            <div className="grid items-center gap-8 lg:grid-cols-[1.6fr_1fr]">
              <div>
                <Eyebrow>What we build</Eyebrow>
                <h2 className="mt-5 font-display text-5xl font-extrabold leading-[1.0] tracking-tight sm:text-6xl">
                  Tools shaped to your{" "}
                  <span className="font-[var(--font-serif-accent)] text-[1.08em] font-medium italic text-primary">
                    business
                  </span>
                  ,<br /> not the other way around
                </h2>
                <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                  Bigger scale, heavier weight, the signature motif in play. Most
                  marketable, furthest from the current understated feel.
                </p>
                <a
                  href="#"
                  className="group mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-7 py-3.5 text-base font-bold text-primary-foreground shadow-[0_0_30px_hsl(var(--primary)/0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_44px_hsl(var(--primary)/0.5)]"
                >
                  Book a free consult
                  <ArrowRight className="size-5 transition-transform duration-200 group-hover:translate-x-1.5" aria-hidden />
                </a>
              </div>
              <div className="flex justify-center">
                <SignatureMotif />
              </div>
            </div>
          </VariantFrame>

          {/* Signature motif, shown on its own too */}
          <VariantFrame label="Signature motif" blurb="branded 'orbiting nodes' — the software-studio spirit of L2's seal">
            <div className="flex flex-col items-center gap-6 py-6 sm:flex-row sm:justify-around">
              <SignatureMotif />
              <p className="max-w-sm text-sm text-muted-foreground">
                A slow-orbiting node cluster echoing the bcns mark — connections and
                systems, not a car-detailing seal. Sits quietly in a hero corner or
                behind a section heading. Speed and size are tunable.
              </p>
            </div>
          </VariantFrame>
        </Container>
      </main>
    </div>
  );
}
