import { Mail, MessageSquare, Clock } from "lucide-react";
import { Container, SectionHeading } from "@nseluga/ui";
import { ContactForm } from "@/components/contact-form";
import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";

const highlightIcons = [MessageSquare, Clock, Mail] as const;

export function ContactSection() {
  const { eyebrow, title, description, highlights } = siteContent.contactSection;

  return (
    <section id="contact" className="relative border-t border-border/60 py-24 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(65%_80%_at_50%_50%,hsl(var(--primary)/0.14),transparent_75%)]"
      />
      <Container>
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal variant="fade-right" className="flex flex-col gap-8">
            <SectionHeading
              align="left"
              eyebrow={eyebrow}
              title={title}
              description={description}
            />
            <ul className="flex flex-col gap-6">
              {highlights.map(({ title: highlightTitle, description: highlightDescription }, index) => {
                const Icon = highlightIcons[index];
                if (!Icon) return null;
                return (
                  <Reveal as="li" key={index} delay={120 + index * 100} className="group flex gap-4">
                    <span className="icon-brighten flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div>
                      <p className="font-medium">{highlightTitle}</p>
                      <p className="text-sm text-muted-foreground">{highlightDescription}</p>
                    </div>
                  </Reveal>
                );
              })}
            </ul>
          </Reveal>

          <Reveal
            variant="fade-left"
            delay={120}
            className="hover-glow rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8"
          >
            <ContactForm />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
