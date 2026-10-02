import { Eyebrow, GUTTER, emphasize } from "@/components/kit";
import { Reveal } from "@/components/reveal";
import { siteContent } from "@/lib/content";

/** /services/connect page head: the standard head plus the rate pill ($200 / month, no setup fee). */
export function ConnectHead() {
  const { connect, connectDemo } = siteContent;
  return (
    <div className={`${GUTTER} flex flex-col items-start pb-6 pt-16 lg:pt-[4.5rem]`}>
      <Reveal>
        <Eyebrow>{connectDemo.eyebrow}</Eyebrow>
      </Reveal>
      <Reveal
        as="h1"
        delay={80}
        className="mt-[1.125rem] max-w-[22ch] text-balance text-[clamp(2.25rem,5vw,3.625rem)] font-light leading-[1.06] tracking-[-0.025em] lg:max-w-[18ch]"
      >
        {emphasize(connectDemo.title, connectDemo.emphasis)}
      </Reveal>
      <Reveal as="p" delay={160} className="mt-5 max-w-[34rem] text-[1.1875rem] leading-relaxed text-muted-foreground">
        {connect.description}
      </Reveal>
      <Reveal as="p" delay={200} className="mt-3 max-w-[34rem] text-[0.9375rem] font-medium leading-relaxed">
        {connectDemo.audience}
      </Reveal>
      <Reveal
        delay={240}
        className="mt-7 inline-flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-border bg-secondary px-5 py-3"
      >
        <b className="font-display text-2xl font-semibold tracking-[-0.01em]">{connect.rate}</b>
        <span className="text-[0.9375rem] text-muted-foreground">{connectDemo.noSetupFee}</span>
      </Reveal>
    </div>
  );
}
