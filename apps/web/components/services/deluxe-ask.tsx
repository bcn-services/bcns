"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Cube } from "@/components/cube";
import { useInView, useReducedMotion } from "@/components/motion";
import { siteContent, type DeluxeChip, type ToolId } from "@/lib/content";

/**
 * "Ask your business a question": three question chips over a dashboard + AI
 * agent mock. Picking a chip re-renders the mock (tiles, a bar chart or list
 * rows, the agent's question / answer / source) with a short stagger, and the
 * tile numbers count up. Reduced motion switches instantly with no count-up.
 */

const TOOL_DOT: Record<ToolId, string> = {
  shopify: "bg-tool-shopify",
  square: "bg-tool-square",
  quickbooks: "bg-tool-quickbooks",
  calendar: "bg-tool-calendar",
  gmail: "bg-tool-gmail",
};

const COUNT_MS = 800;
const COUNT_DELAY_MS = 150;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const money = (n: number) => Math.round(n).toLocaleString("en-US");

/** `**bold**` markup to elements, never HTML. */
function renderBold(text: string) {
  return text.split("**").map((part, i) =>
    i % 2 === 1 ? (
      <b key={i} className="font-display font-semibold">
        {part}
      </b>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function Mock({ chip, progress }: { chip: DeluxeChip; progress: number }) {
  const { dashboardTitle, agentLabel, agentPlaceholder, dayLetters } = siteContent.deluxeDemo;
  const { tools } = siteContent;
  const toolName = (id: ToolId) => tools.find((t) => t.id === id)?.name ?? id;
  const ease = 1 - Math.pow(1 - progress, 3);

  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-input bg-card shadow-[0_16px_40px_hsl(var(--primary)/0.16)]">
      <div className="flex h-11 items-center gap-1.5 border-b border-border px-4">
        <i className="size-[9px] rounded-full bg-border" />
        <i className="size-[9px] rounded-full bg-border" />
        <i className="size-[9px] rounded-full bg-border" />
        <span className="ml-2 font-display text-[0.8125rem] font-medium tracking-[0.02em] text-muted-foreground">
          {dashboardTitle}
        </span>
        <Cube strokeWidth={2.5} className="ml-auto h-[26px] w-[23px]" />
      </div>

      <div className="grid gap-3.5 p-3.5 min-[900px]:grid-cols-[3fr_2fr] min-[900px]:gap-5 min-[900px]:p-5">
        {/* key: a new chip remounts the dashboard so its entrance animations restart. */}
        <div key={chip.question} className="grid min-w-0 content-start gap-3">
          <div className="grid grid-cols-3 gap-2 min-[600px]:gap-3">
            {chip.tiles.map((tile, k) => (
              <div
                key={tile.name}
                data-rise={k}
                className="rounded-xl border border-border bg-secondary p-2.5 shadow-[0_6px_18px_hsl(var(--primary)/0.16)] min-[600px]:px-3.5 min-[600px]:py-3"
              >
                <div className="font-display text-xs font-medium text-muted-foreground">{tile.name}</div>
                <div className="mt-0.5 font-display text-[1.375rem] font-medium leading-[1.15] tracking-[-0.02em] tabular-nums min-[600px]:text-[1.75rem]">
                  {tile.prefix}
                  {money(tile.value * ease)}
                  {tile.suffix}
                </div>
                <div className="text-xs leading-[1.3] text-muted-foreground">{tile.sub}</div>
                <div className="mt-2 flex gap-1">
                  {tile.toolIds.map((id) => (
                    <i key={id} title={toolName(id)} className={`block size-[7px] rounded-full ${TOOL_DOT[id]}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div data-rise={3} className="overflow-hidden rounded-xl border border-border bg-secondary">
            <div className="px-3.5 pb-2 pt-2.5 font-display text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {chip.listHeading}
            </div>
            {chip.bars ? (
              <div
                aria-hidden
                className="flex h-36 items-end gap-2 border-t border-border px-3.5 pb-3 pt-1.5"
              >
                {chip.bars.map((pct, n) => (
                  <span key={n} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <b
                      data-grow
                      className="block max-h-[calc(100%-18px)] w-full origin-bottom rounded-t-[3px] bg-primary opacity-[.85]"
                      style={{ height: `${pct}%` }}
                    />
                    <em className="font-display text-xs font-medium not-italic text-muted-foreground">
                      {dayLetters.charAt(n)}
                    </em>
                  </span>
                ))}
              </div>
            ) : (
              chip.rows?.map((row, n) => (
                <div
                  key={row.title}
                  data-rise={4 + n}
                  className="flex min-h-12 items-center justify-between gap-3 border-t border-border px-3.5 py-2 text-sm"
                >
                  <div>
                    <b className="block font-display text-[0.9375rem] font-medium">{row.title}</b>
                    <small className="block text-xs leading-[1.3] text-muted-foreground">{row.detail}</small>
                  </div>
                  <span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-2.5 py-[3px] font-display text-xs font-medium text-primary-ink">
                    {row.tag}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div
          aria-live="polite"
          className="flex min-h-[10.5rem] min-w-0 flex-col gap-2.5 rounded-[0.875rem] border border-primary bg-card px-4 py-3.5 shadow-[0_16px_40px_hsl(var(--primary)/0.16)]"
        >
          <div className="flex items-center gap-2 font-display text-[0.8125rem] font-medium uppercase tracking-[0.12em] text-primary-ink">
            <i className="block size-[9px] rounded-full bg-primary" />
            {agentLabel}
          </div>
          <div key={chip.question} className="flex flex-1 flex-col gap-2.5">
            <div
              data-rise={2}
              className="max-w-[92%] self-end rounded-xl rounded-br-[3px] border border-border bg-secondary px-3 py-2 text-sm leading-[1.4]"
            >
              {chip.question}
            </div>
            <div
              data-rise={6}
              className="max-w-[96%] self-start rounded-xl rounded-bl-[3px] bg-primary-ink px-3 py-[0.5625rem] text-sm leading-[1.45] text-primary-foreground"
            >
              {renderBold(chip.answer)}
            </div>
            <div data-rise={7} className="text-xs text-muted-foreground">
              {chip.source}
            </div>
          </div>
          <div
            aria-hidden
            className="mt-auto rounded-full border border-input px-3.5 py-2.5 text-[0.8125rem] text-muted-foreground"
          >
            {agentPlaceholder}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DeluxeAsk() {
  const { chips, groupLabel } = siteContent.deluxeDemo;
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const seen = useInView(rootRef, { threshold: 0.3, once: true, enabled: !reduced });
  const [cur, setCur] = useState(0);
  const [progress, setProgress] = useState(1);

  // Entrance stagger + count-up. Runs before paint so a new chip never flashes its final state.
  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (reduced || !seen || !root) return;
    setProgress(0);
    const anims: Animation[] = [];
    root.querySelectorAll("[data-rise]").forEach((el) => {
      const i = Number(el.getAttribute("data-rise"));
      anims.push(
        el.animate(
          [
            { opacity: 0, transform: "translateY(12px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 550, delay: i * 80, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" },
        ),
      );
    });
    root.querySelectorAll("[data-grow]").forEach((el, n) =>
      anims.push(
        el.animate([{ transform: "scaleY(0)" }, { transform: "none" }], {
          duration: 700,
          delay: n * 60 + 250,
          easing: "cubic-bezier(.34,1.2,.5,1)",
          fill: "backwards",
        }),
      ),
    );
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const u = Math.min(1, Math.max(0, (now - t0 - COUNT_DELAY_MS) / COUNT_MS));
      setProgress(u);
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      anims.forEach((a) => a.cancel());
    };
  }, [cur, seen, reduced]);

  const pick = (i: number) => {
    if (i === cur) return;
    setCur(i);
    setProgress(reduced ? 1 : 0);
  };

  return (
    <div ref={rootRef}>
      <div role="group" aria-label={groupLabel} className="mb-[1.125rem] mt-7 flex flex-wrap gap-2.5">
        {chips.map((chip, i) => (
          <button
            key={chip.question}
            type="button"
            aria-pressed={i === cur}
            onClick={() => pick(i)}
            className="min-h-12 rounded-full border border-input bg-card px-5 py-2.5 text-left font-display text-[0.9375rem] font-medium leading-[1.3] text-foreground transition-[border-color,background-color,color,box-shadow] duration-200 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-pressed:border-primary-ink aria-pressed:bg-primary-ink aria-pressed:text-primary-foreground aria-pressed:shadow-[0_8px_20px_hsl(var(--primary)/0.16)] motion-reduce:transition-none"
          >
            {chip.question}
          </button>
        ))}
      </div>
      <Mock chip={chips[cur] ?? chips[0]} progress={progress} />
    </div>
  );
}
