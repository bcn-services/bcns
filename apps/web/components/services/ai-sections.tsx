import { Reveal } from "@/components/reveal";
import { siteContent } from "@/lib/content";
import { SectionHeading } from "./deluxe-shared";

/** "What you leave with": three numbered cards. */
export function AiLeave() {
  const { leaveEyebrow, leaveTitle, leaveEmphasis, leave } = siteContent.aiDay;
  return (
    <>
      <SectionHeading eyebrow={leaveEyebrow} title={leaveTitle} emphasis={leaveEmphasis} />
      <div className="grid gap-4 min-[900px]:grid-cols-3 min-[900px]:gap-6">
        {leave.map((item, i) => (
          <Reveal
            key={item.n}
            delay={i * 90}
            className="rounded-2xl border border-border bg-card px-6 pb-[1.375rem] pt-[1.625rem]"
          >
            <p className="font-display text-[2.6rem] font-light leading-none tracking-[-0.02em] text-primary">
              {item.n}
            </p>
            <h3 className="mt-3.5 text-2xl font-semibold leading-[1.2] tracking-[-0.01em]">{item.title}</h3>
            <p className="mt-2.5 text-[0.9375rem] leading-[1.65] text-muted-foreground">{item.line}</p>
          </Reveal>
        ))}
      </div>
    </>
  );
}
