import { Mail, MessageSquare, Clock } from "lucide-react";
import { Container, SectionHeading } from "@bcns/ui";
import { ContactForm } from "@/components/contact-form";
import { siteContent } from "@/lib/content";

const highlightIcons = [MessageSquare, Clock, Mail] as const;

export function ContactSection() {
  const { eyebrow, title, description, highlights } = siteContent.contactSection;

  return (
    <section id="contact" className="border-t border-border/60 py-24 sm:py-28">
      <Container>
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-8">
            <SectionHeading
              align="left"
              eyebrow={eyebrow}
              title={title}
              description={description}
            />
            <ul className="flex flex-col gap-6">
              {highlights.map(({ title: highlightTitle, description: highlightDescription }, index) => {
                const Icon = highlightIcons[index]!;
                return (
                  <li key={highlightTitle} className="flex gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div>
                      <p className="font-medium">{highlightTitle}</p>
                      <p className="text-sm text-muted-foreground">{highlightDescription}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <ContactForm />
          </div>
        </div>
      </Container>
    </section>
  );
}
