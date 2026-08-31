import { siteContent } from "@/lib/content";
import { Reveal } from "@/components/reveal";
import { Cube } from "@/components/cube";

/**
 * The four services as a 2×2 grid of hairline cells — no cards, no gaps: the
 * page's rule system doing the dividing. Each cell carries a pill tag and the
 * cube motif in its top corner.
 *
 * The section heading lives in the page's `PageHead`, not here — on the
 * artboard the services heading *is* the page head.
 */
export function UseCases() {
  const { items } = siteContent.useCases;

  return (
    <section id="examples" className="grid sm:grid-cols-2">
      {items.map((item, i) => (
        <Reveal
          key={item.tag}
          delay={i * 90}
          className={`group border-b border-border px-8 py-10 transition-colors duration-300 hover:bg-secondary sm:px-14 sm:py-[3.25rem] ${
            i % 2 === 0 ? "sm:border-r" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-6">
            <span className="rounded-full border border-accent px-3.5 py-1.5 font-display text-xs font-medium uppercase tracking-[0.1em] text-primary">
              {item.tag}
            </span>
            <Cube
              strokeWidth={1.2}
              className="h-[2.875rem] w-10 shrink-0 text-foreground/70 transition-transform duration-[350ms] ease-out group-hover:-translate-y-1"
            />
          </div>
          <h2 className="mt-[1.625rem] text-[1.5rem] font-semibold sm:text-[1.75rem]">
            {item.title}
          </h2>
          <p className="mt-3 max-w-[30rem] text-[0.9375rem] leading-[1.7] text-muted-foreground">
            {item.description}
          </p>
        </Reveal>
      ))}
    </section>
  );
}
