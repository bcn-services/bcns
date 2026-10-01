import { Eyebrow, GUTTER, emphasize } from "@/components/kit";
import { Reveal } from "@/components/reveal";
import { siteContent } from "@/lib/content";

/**
 * The six Connect questions, picked from `faq.items` by `connectDemo.faqQuestions`.
 * Native <details>, like the prototype: no client JS, keyboard and screen readers for free.
 */
export function ConnectFaq() {
  const { faq, connectDemo } = siteContent;
  const items = connectDemo.faqQuestions.flatMap((q) => faq.items.filter((it) => it.question === q));
  return (
    <section className="border-t border-border py-[4.5rem] lg:py-[6.5rem]" aria-labelledby="connect-faq-heading">
      <div className={`${GUTTER} grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-[4.5rem]`}>
        <div>
          <Reveal>
            <Eyebrow>{faq.eyebrow}</Eyebrow>
          </Reveal>
          <Reveal
            as="h2"
            id="connect-faq-heading"
            delay={80}
            className="mt-4 text-balance text-[clamp(1.9rem,3.8vw,2.75rem)] font-light leading-[1.12] tracking-[-0.02em]"
          >
            {emphasize(faq.title, connectDemo.faqEmphasis)}
          </Reveal>
        </div>
        <div>
          {items.map(({ question, answer }) => (
            <details key={question} className="group border-b border-border first:border-t">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 rounded-md py-[1.375rem] font-display text-[1.1875rem] font-medium leading-[1.35] hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                {question}
                <span aria-hidden className="flex-none text-[1.75rem] font-light leading-none text-primary-ink transition-transform duration-[250ms] group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="max-w-[42rem] pb-6 leading-[1.75] text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
