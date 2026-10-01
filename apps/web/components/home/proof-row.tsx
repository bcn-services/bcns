import { GUTTER } from "@/components/kit";
import { siteContent } from "@/lib/content";

/** Three ticked proof points under the home stage (copy: `hero.proofPoints`). */
export function ProofRow() {
  return (
    <section aria-label={siteContent.story.proofAriaLabel} className={`${GUTTER} border-t border-border`}>
      <ul className="grid md:grid-cols-3 md:gap-8">
        {siteContent.hero.proofPoints.map((point) => (
          <li
            key={point}
            className="flex items-center gap-3.5 border-b border-border py-[22px] font-display text-[1.1875rem] font-medium leading-[1.35] last:border-b-0 md:border-b-0 md:py-9"
          >
            <span className="grid size-7 flex-none place-items-center rounded-full border border-accent bg-secondary text-primary-ink">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-3.5">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            {point}
          </li>
        ))}
      </ul>
    </section>
  );
}
