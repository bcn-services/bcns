import Image from "next/image";
import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { Eyebrow, GUTTER, emphasize } from "@/components/kit";
import { LogoMark } from "@/components/cube";

/**
 * The two founders as open columns divided by a hairline, then the "why bcns"
 * statement on the tint band with the mark drifting in the corner.
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

/** Role-line dot per founder: Nate the brand blue, Brandon the flood blue. */
const ROLE_DOT = ["bg-primary", "bg-accent"] as const;

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
  const { whyHeading, whyEmphasis } = siteContent.aboutPage;
  const { lead, middle, close } = beats(whyBcns);

  return (
    <>
      <section id="founders" aria-label={siteContent.about.eyebrow} className={GUTTER}>
        <div className="grid border-t border-border min-[900px]:grid-cols-2">
          {founders.map((founder, i) => (
            <Reveal
              key={founder.name}
              as="article"
              delay={i * 110}
              className={`border-b border-border pb-14 pt-[3.25rem] min-[900px]:border-b-0 min-[900px]:py-16 ${
                i === 0 ? "min-[900px]:pr-14" : "min-[900px]:border-l min-[900px]:pl-14"
              }`}
            >
              <div className="flex items-center gap-[1.375rem]">
                {founder.photo ? (
                  <Image
                    src={founder.photo}
                    alt={founder.name}
                    width={76}
                    height={76}
                    className="size-[4.75rem] shrink-0 rounded-full border border-accent object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="grid size-[4.75rem] shrink-0 place-items-center rounded-full border border-accent bg-secondary font-display text-2xl font-medium tracking-[0.02em] text-primary-ink"
                  >
                    {initials(founder.name)}
                  </span>
                )}
                <div>
                  <h2 className="font-display text-[clamp(1.625rem,3vw,2.125rem)] font-light leading-[1.12] tracking-[-0.02em]">
                    {founder.name}
                  </h2>
                  <Eyebrow className="mt-2 flex items-center gap-2.5">
                    <span aria-hidden className={`size-2 rounded-full ${ROLE_DOT[i] ?? "bg-primary"}`} />
                    {founder.roleLine}
                  </Eyebrow>
                </div>
              </div>

              <p className="mt-8 max-w-[34rem] leading-[1.8] text-muted-foreground">{founder.bio}</p>

              <ul className="mt-8 border-t border-border pt-5 font-display text-sm tracking-[0.02em] text-muted-foreground">
                {founder.credentials.map((credential) => (
                  <li key={credential}>{credential}</li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </section>

      <section aria-label={whyHeading} className="relative overflow-hidden border-t border-border bg-secondary">
        {/* The mark at poster scale, swaying in the corner. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-[1.875rem] hidden w-[21.25rem] animate-sway opacity-[0.13] motion-reduce:animate-none lg:block"
        >
          <LogoMark className="block h-auto w-full" />
        </div>

        <div
          className={`relative ${GUTTER} grid gap-10 pb-24 pt-20 lg:grid-cols-[6fr_5fr] lg:gap-x-[5.5rem] lg:gap-y-6 lg:pb-28 lg:pt-[6.5rem]`}
        >
          <Reveal className="lg:col-span-full">
            <Eyebrow>{whyHeading}</Eyebrow>
          </Reveal>
          <Reveal
            as="p"
            delay={80}
            className="text-balance font-display text-[clamp(1.625rem,3.2vw,2.5rem)] font-light leading-[1.22] tracking-[-0.02em]"
          >
            {lead}
          </Reveal>

          <div>
            {middle && (
              <Reveal as="p" delay={160} className="max-w-[38rem] text-[1.0625rem] leading-[1.8] text-muted-foreground">
                {middle}
              </Reveal>
            )}
            {close && (
              <Reveal
                as="p"
                delay={240}
                className={`border-l-2 border-primary pl-5 font-display text-[1.375rem] font-medium leading-[1.35] ${
                  middle ? "mt-7" : ""
                }`}
              >
                {emphasize(close, whyEmphasis)}
              </Reveal>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
