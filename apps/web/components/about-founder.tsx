import Image from "next/image";
import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { GUTTER } from "@/components/kit";
import { Cube } from "@/components/cube";

/**
 * The two founders as hairline cards, then the "why bcns" statement on the
 * full-bleed blue plate — this page's one bold moment.
 *
 * The section heading lives in the page's `PageHead`.
 */

/**
 * Splits the statement into the beats it is already written in: the opening
 * observation, the middle it complicates, and the closing line. Rendering the
 * three at one size makes a slab of text; giving each its own weight lets the
 * statement land the way it is written, without touching the string.
 *
 * Same render-time split `emphasize` uses on the headlines — `content.ts` stays
 * the single frozen source. A statement of any other shape falls back to the
 * plain paragraph rather than losing a sentence.
 */
function beats(statement: string) {
  const parts = statement.match(/[^.]+\./g)?.map((part) => part.trim());
  if (!parts || parts.length < 2) return { lead: statement, middle: "", close: "" };
  return {
    lead: parts[0] ?? statement,
    middle: parts.slice(1, -1).join(" "),
    close: parts[parts.length - 1] ?? "",
  };
}

/** Initials fallback for a founder with no photo yet. */
function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function AboutFounder() {
  const { founders, whyBcns } = siteContent.about;
  const { lead, middle, close } = beats(whyBcns);

  return (
    <>
      <section id="founders" className={`${GUTTER} grid gap-7 py-16 lg:grid-cols-2`}>
        {founders.map((founder, i) => (
          <Reveal
            key={founder.name}
            delay={i * 110}
            className="lift-card flex h-full flex-col rounded-[1.25rem] border border-border bg-card p-8 sm:p-10 sm:px-10 sm:py-11"
          >
            <div className="flex items-center gap-5">
              {founder.photo ? (
                <Image
                  src={founder.photo}
                  alt=""
                  width={72}
                  height={72}
                  className="size-[4.5rem] shrink-0 rounded-full border border-accent object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex size-[4.5rem] shrink-0 items-center justify-center rounded-full border border-accent bg-secondary font-display text-[1.375rem] font-bold text-primary"
                >
                  {initials(founder.name)}
                </span>
              )}
              <div>
                <h2 className="text-[1.375rem] font-semibold sm:text-[1.625rem]">{founder.name}</h2>
                <p className="mt-1 font-display text-[0.8125rem] font-medium uppercase tracking-[0.1em] text-primary">
                  {founder.roleLine}
                </p>
              </div>
            </div>

            <p className="mt-[1.625rem] text-[0.90625rem] leading-[1.75] text-muted-foreground">
              {founder.bio}
            </p>

            <div aria-hidden className="mb-[1.125rem] mt-6 h-px bg-border" />
            <ul className="mt-auto font-display text-[0.8125rem] text-muted-foreground">
              {founder.credentials.map((credential) => (
                <li key={credential}>{credential}</li>
              ))}
            </ul>
          </Reveal>
        ))}
      </section>

      {/* The bold moment: the statement on a full-bleed plate. */}
      <section className="relative overflow-hidden bg-accent text-accent-foreground">
        {/* The mark at poster scale, bleeding off the corner. Outline only and
            barely there: it anchors the plate without competing with the type. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-16 hidden w-[30rem] text-accent-foreground/20 lg:block"
        >
          <Cube filled={false} strokeWidth={0.5} className="w-full" />
        </div>

        <div className={`relative ${GUTTER} py-16 sm:py-[5.5rem]`}>
          <Reveal
            variant="draw-rule"
            aria-hidden
            className="h-px w-16 origin-left bg-current opacity-40"
          />

          <div className="mt-9 grid gap-x-16 gap-y-9 lg:grid-cols-[1.1fr_1fr]">
            <Reveal
              as="p"
              className="text-balance text-[clamp(1.625rem,3vw,2.375rem)] font-light leading-[1.26] tracking-[-0.015em]"
            >
              {lead}
            </Reveal>

            <div className="lg:pt-2.5">
              {middle && (
                <Reveal
                  as="p"
                  delay={110}
                  className="max-w-[46ch] text-[1.0625rem] leading-[1.75] text-accent-foreground/80"
                >
                  {middle}
                </Reveal>
              )}
              {close && (
                <Reveal
                  as="p"
                  delay={200}
                  className={`border-l-2 border-accent-foreground/40 pl-5 text-[1.1875rem] font-semibold leading-snug ${
                    middle ? "mt-7" : ""
                  }`}
                >
                  {close}
                </Reveal>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
