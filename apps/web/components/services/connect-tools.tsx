import { Eyebrow, GUTTER, emphasize } from "@/components/kit";
import { Reveal } from "@/components/reveal";
import { siteContent, type ToolId } from "@/lib/content";

const DOT: Record<ToolId, string> = {
  shopify: "bg-tool-shopify", square: "bg-tool-square", quickbooks: "bg-tool-quickbooks",
  calendar: "bg-tool-calendar", gmail: "bg-tool-gmail",
};

/** "What it connects": the five tools with their role, then the extra chips in blue. */
export function ConnectTools() {
  const { tools, connectDemo } = siteContent;
  const chip = "inline-flex items-center gap-3 rounded-full border border-border bg-card py-3 pl-4 pr-5";
  return (
    <section className="border-t border-border py-[4.5rem] lg:py-[6.5rem]" aria-labelledby="connect-tools-heading">
      <div className={GUTTER}>
        <Reveal>
          <Eyebrow>{connectDemo.toolsEyebrow}</Eyebrow>
        </Reveal>
        <Reveal
          as="h2"
          id="connect-tools-heading"
          delay={80}
          className="mt-4 text-balance text-[clamp(1.9rem,3.8vw,2.75rem)] font-light leading-[1.12] tracking-[-0.02em]"
        >
          {emphasize(connectDemo.toolsTitle, connectDemo.toolsEmphasis)}
        </Reveal>
        <Reveal as="p" delay={160} className="mt-4 max-w-xl text-[1.1875rem] leading-relaxed text-muted-foreground">
          {connectDemo.toolsLede}
        </Reveal>
        <Reveal as="ul" delay={240} className="mt-9 flex flex-wrap gap-3">
          {tools.map((t) => (
            <li key={t.id} className={chip}>
              <i aria-hidden className={`size-3 flex-none rounded-full ${DOT[t.id]}`} />
              <b className="font-display text-base font-medium">{t.name}</b>
              <span className="text-sm text-muted-foreground">{t.role}</span>
            </li>
          ))}
          {connectDemo.extraChips.map((label) => (
            <li key={label} className={chip}>
              <i aria-hidden className="size-3 flex-none rounded-full bg-primary" />
              <b className="font-display text-base font-medium">{label}</b>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
