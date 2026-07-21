import { SectionHeading } from "@nseluga/ui";
import { Reveal } from "@/components/reveal";
import { SignatureMotif } from "@/components/signature-motif";

/**
 * THROWAWAY preview route — verifies the layout-loop Phase 0 foundation in
 * isolation (serif accent word, Reveal scroll/stagger, SignatureMotif, shared
 * hover utilities, shimmer surface). Not linked in nav; not a real marketing
 * page. Deleted in Phase F before merge.
 */
export default function StyleLab() {
  return (
    <main className="mx-auto max-w-5xl space-y-24 px-6 py-24">
      {/* Serif accent word + display size */}
      <section className="space-y-8">
        <SectionHeading
          eyebrow="Foundation"
          title="Bold, executed with precision"
          accent="precision"
          size="display"
          align="left"
          description="One serif-italic accent word (Fraunces), display scale, on the charcoal-purple field."
        />
      </section>

      {/* Reveal + stagger (pop variant) */}
      <section className="space-y-6">
        <h2 className="font-display text-2xl font-bold">Reveal — pop-in, staggered</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Reveal
              key={i}
              variant="pop"
              delay={i * 140}
              className="group hover-lift rounded-lg border border-border bg-card p-6"
            >
              <div className="icon-brighten mb-4 inline-flex size-10 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                {i + 1}
              </div>
              <p className="font-display font-semibold">Card {i + 1}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pops up on scroll; lifts + glows on hover, icon tile pops.
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA glow */}
      <section className="flex flex-wrap items-center gap-6">
        <button className="hover-glow animate-glow-pulse rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground">
          Book a free consult
        </button>
        <span className="text-sm text-muted-foreground">
          Idle glow-pulse; intensifies on hover.
        </span>
      </section>

      {/* Signature motif */}
      <section className="flex flex-col items-center gap-6">
        <h2 className="font-display text-2xl font-bold">Signature motif</h2>
        <SignatureMotif />
      </section>

      {/* Shimmer placeholder surface */}
      <section className="space-y-6">
        <h2 className="font-display text-2xl font-bold">Shimmer placeholder</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="shimmer-surface h-28 animate-shimmer rounded-lg border border-border bg-card"
            />
          ))}
        </div>
      </section>
    </main>
  );
}
