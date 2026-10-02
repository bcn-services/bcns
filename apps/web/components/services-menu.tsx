"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { siteConfig } from "@/lib/site";

const TRIGGER =
  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-[0.9375rem] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Desktop "Services" dropdown. Opens on hover, keyboard focus, or click; Esc and
 * an outside click close it. The three triggers are tracked separately so a click
 * while hovering pins the menu open instead of closing it.
 */
export function ServicesMenu() {
  const pathname = usePathname();
  const ref = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const leaveTimer = React.useRef<number | undefined>(undefined);
  const [hover, setHover] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const open = hover || focus || pinned;
  const onServices = pathname.startsWith("/services");

  const close = React.useCallback(() => {
    setHover(false);
    setFocus(false);
    setPinned(false);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Hidden panel would drop focus to <body>; hand it back to the trigger.
      if (ref.current?.contains(document.activeElement)) triggerRef.current?.focus();
      close();
    };
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, close]);

  // Route change (a menu link was followed) closes the menu.
  React.useEffect(close, [pathname, close]);
  React.useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  return (
    <div
      ref={ref}
      className="relative"
      // Mouse only: a touch tap fires emulated enter events with no matching leave.
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        window.clearTimeout(leaveTimer.current);
        setHover(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        // Grace delay so a small overshoot past the hover bridge doesn't flicker it shut.
        leaveTimer.current = window.setTimeout(() => setHover(false), 120);
      }}
      onFocus={(e) => {
        if (e.target.matches(":focus-visible")) setFocus(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="services-menu"
        onClick={() => {
          // Click pins; a second click closes. Clearing hover/focus here means the
          // second click really closes instead of leaving it held open by them.
          if (pinned) return close();
          setHover(false);
          setFocus(false);
          setPinned(true);
        }}
        className={`${TRIGGER} ${
          open
            ? "bg-secondary text-primary-ink"
            : onServices
              ? "text-primary-ink"
              : "text-muted-foreground"
        }`}
      >
        Services
        <ChevronDown
          aria-hidden
          className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {/* pt-2 is a hover bridge: no dead gap between trigger and panel. */}
      <div
        id="services-menu"
        hidden={!open}
        className="absolute left-0 top-full z-10 w-[17rem] pt-2"
      >
        <div className="rounded-[0.875rem] border border-border bg-card p-2 shadow-[0_18px_40px_hsl(var(--primary)/0.16)]">
          {siteConfig.services.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              aria-current={pathname === s.href ? "page" : undefined}
              className="block rounded-[0.5625rem] px-3 py-2.5 hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
            >
              <b
                className={`block font-display text-base font-medium ${
                  pathname === s.href ? "text-primary-ink" : ""
                }`}
              >
                {s.label}
              </b>
              <span className="block text-sm leading-snug text-muted-foreground">{s.blurb}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
