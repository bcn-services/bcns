import { GUTTER } from "@/components/kit";
import type { LegalPageContent } from "@/lib/content";

/**
 * Shared renderer for the /privacy and /terms pages: same divide-y section
 * pattern as the work case-study page (h2 eyebrow-label + paragraphs), plus
 * an optional bullet list per section. Both legal pages are plain reference
 * text, not a scroll-triggered moment, so this skips the `Reveal` animation
 * the rest of the site uses.
 */
export function LegalContent({ content }: { content: LegalPageContent }) {
  return (
    <div className={`${GUTTER} py-16 sm:py-20`}>
      <p className="text-sm text-muted-foreground">{content.effectiveDate}</p>
      <div className="mt-8 max-w-[68ch] divide-y divide-border">
        {content.sections.map((section, index) => (
          <div key={section.heading} className={index === 0 ? "pb-8" : "py-8"}>
            <h2 className="font-display text-[0.8125rem] font-medium uppercase tracking-[0.16em] text-primary">
              {section.heading}
            </h2>
            {section.body.map((paragraph, i) => (
              <p key={i} className="mt-3 text-base leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
            {section.list && (
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-base leading-relaxed text-muted-foreground">
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
