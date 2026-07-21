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

      {/* Reveal + stagger */}
      <section className="space-y-6">
        <h2 className="font-display text-2xl font-bold">Reveal — staggered entrance</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Reveal
              key={i}
              delay={i * 120}
              className="group hover-lift rounded-lg border border-border bg-card p-6"
            >
              <div className="icon-brighten mb-4 inline-flex size-10 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                {i + 1}
              </div>
              <p className="font-display font-semibold">Card {i + 1}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Hover to lift; icon tile brightens. Reveals on scroll into view.
              </p>
            </Reveal>
          ))}
        </div>
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
