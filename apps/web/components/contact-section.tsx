import { Mail, MessageSquare, Clock } from "lucide-react";
import { Container, SectionHeading } from "@acme-labs/ui";
import { ContactForm } from "@/components/contact-form";
import { siteConfig } from "@/lib/site";

const highlights = [
  {
    icon: MessageSquare,
    title: "A real conversation",
    description: "You talk to the person who'll build it — not a sales rep reading a script.",
  },
  {
    icon: Clock,
    title: "Fast, honest answer",
    description:
      "If we're not the right fit, we'll say so and point you somewhere better. No hard sell.",
  },
  {
    icon: Mail,
    title: "Prefer email?",
    description: `Reach us directly at ${siteConfig.email}.`,
  },
];

export function ContactSection() {
  return (
    <section id="contact" className="border-t border-border/60 py-24 sm:py-28">
      <Container>
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-8">
            <SectionHeading
              align="left"
              eyebrow="Contact"
              title="Tell us what's slowing you down"
              description="Book a free consult. We'll figure out whether custom software is worth it for your business — and if it is, what it'd take to build."
            />
            <ul className="flex flex-col gap-6">
              {highlights.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                </li>
              ))}
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
