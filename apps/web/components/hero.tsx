import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge, buttonVariants, Container } from "@acme-labs/ui";
import { siteConfig } from "@/lib/site";

const proofPoints = [
  "You own the software and the data",
  "Fixed-scope quotes, no enterprise pricing",
  "Built around your workflow, not the other way around",
];

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* Gradient / grid background — no image assets. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--primary)/0.14),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent_75%)] bg-[linear-gradient(to_right,hsl(var(--border)/0.5)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.5)_1px,transparent_1px)] bg-[size:44px_44px]"
      />

      <Container className="flex flex-col items-center py-24 text-center sm:py-32">
        <Badge className="animate-fade-up">
          Software studio for local small businesses
        </Badge>

        <h1 className="mt-6 max-w-4xl text-balance text-4xl font-bold tracking-tight animate-fade-up sm:text-6xl">
          Custom software that fits how your business already works.
        </h1>

        <p className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground animate-fade-up sm:text-xl">
          {siteConfig.name} builds the tools local businesses can&apos;t buy off the shelf —
          without the enterprise price tag or the year-long rollout. You keep full ownership of
          everything we ship.
        </p>

        <div className="mt-9 flex flex-col gap-3 animate-fade-up sm:flex-row">
          <a href="#contact" className={buttonVariants({ size: "lg" })}>
            Book a free consult
            <ArrowRight aria-hidden />
          </a>
          <a
            href="#examples"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            See what we build
          </a>
        </div>

        <ul className="mt-10 flex flex-col flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground animate-fade-up sm:flex-row">
          {proofPoints.map((point) => (
            <li key={point} className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary" aria-hidden />
              {point}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
