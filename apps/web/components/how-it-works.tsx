import { Search, Hammer, Rocket } from "lucide-react";
import { Container, SectionHeading } from "@acme-labs/ui";

const steps = [
  {
    icon: Search,
    step: "01",
    title: "Discover",
    description:
      "We sit down with you (in person or over a call), watch how the work actually gets done today, and agree on a tight scope with a fixed quote. No jargon, no 60-page spec.",
  },
  {
    icon: Hammer,
    step: "02",
    title: "Build",
    description:
      "We build in short cycles and show you working software early, so you can course-correct while it's cheap to change. You see progress every week — not a black box.",
  },
  {
    icon: Rocket,
    step: "03",
    title: "Deploy to your tools",
    description:
      "We ship it where your team already works and hand over full ownership — accounts, source, and a plain-English guide. Want changes later? You're not locked in.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border/60 bg-muted/40 py-24 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="How it works"
          title="Three steps from problem to working software"
          description="A process built for owners who don't have time to manage a software project."
        />

        <ol className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map(({ icon: Icon, step, title, description }) => (
            <li key={step} className="relative flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-background text-primary shadow-sm">
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                  {step}
                </span>
              </div>
              <h3 className="text-xl font-semibold">{title}</h3>
              <p className="text-pretty leading-relaxed text-muted-foreground">{description}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
