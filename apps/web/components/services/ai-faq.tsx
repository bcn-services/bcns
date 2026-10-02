import { Reveal } from "@/components/reveal";
import { siteContent } from "@/lib/content";
import { SectionHeading } from "./deluxe-shared";

/** The four FAQ entries picked by question text, as native <details> rows (no JS). */
export function AiFaq() {
  const { eyebrow, title, items } = siteContent.faq;
  const { faqEmphasis, faqQuestions } = siteContent.aiDay;
  const picked = faqQuestions.flatMap((q) => items.filter((item) => item.question === q));
  return (
    <>
      <SectionHeading eyebrow={eyebrow} title={title} emphasis={faqEmphasis} />
      <Reveal className="max-w-[52rem] border-b border-border">
        {picked.map(({ question, answer }) => (
          <details key={question} className="group border-t border-border">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-5 rounded-md py-[1.375rem] font-display text-[1.1875rem] font-medium leading-[1.35] transition-colors hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              {question}
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-full border border-input text-lg text-primary-ink transition-transform duration-[250ms] group-open:rotate-45 motion-reduce:transition-none"
              >
                +
              </span>
            </summary>
            <p className="max-w-[44rem] pb-6 pr-12 text-muted-foreground">{answer}</p>
          </details>
        ))}
      </Reveal>
    </>
  );
}
