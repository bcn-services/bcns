import { ContactForm } from "@/components/contact-form";
import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { Eyebrow, GUTTER } from "@/components/kit";

/**
 * Closing contact band: copy and a hairline highlight table on the left, the
 * form card on the right. The highlights are a two-column rule-separated table
 * rather than icon tiles — same rule system as the rest of the page.
 */
export function ContactSection() {
  const { eyebrow, title, description, highlights } = siteContent.contactSection;

  return (
    <section id="contact">
      <div className={`${GUTTER} grid gap-14 py-16 sm:py-[5.25rem] lg:grid-cols-[1.1fr_1fr] lg:gap-[4.5rem]`}>
        <div>
          <Reveal>
            <Eyebrow>{eyebrow}</Eyebrow>
          </Reveal>
          <Reveal
            as="h2"
            delay={80}
            className="mt-5 max-w-[16ch] text-balance text-[clamp(2.25rem,4.6vw,3.125rem)] font-light leading-[1.1] tracking-[-0.02em]"
          >
            {title}
          </Reveal>
          <Reveal
            as="p"
            delay={160}
            className="mt-[1.375rem] max-w-[32.5rem] text-[1rem] leading-[1.7] text-muted-foreground"
          >
            {description}
          </Reveal>

          <dl className="mt-9 border-t border-border">
            {highlights.map((h, i) => (
              <Reveal
                key={h.title}
                delay={220 + i * 70}
                className={`grid gap-2 py-[1.125rem] text-sm sm:grid-cols-[9.375rem_1fr] sm:gap-6 ${
                  i < highlights.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <dt className="font-semibold">{h.title}</dt>
                <dd className="leading-relaxed text-muted-foreground">{h.description}</dd>
              </Reveal>
            ))}
          </dl>
        </div>

        <Reveal
          delay={120}
          className="self-start rounded-[1.125rem] border border-border bg-card p-6 shadow-[0_12px_44px_hsl(220_13%_9%/0.05)] sm:p-9"
        >
          <ContactForm />
        </Reveal>
      </div>
    </section>
  );
}
