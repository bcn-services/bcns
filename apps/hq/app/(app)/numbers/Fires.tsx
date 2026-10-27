"use client";

import { useEffect, useRef, useState } from "react";
import { ownsKeys } from "@/lib/keys";
import type { Fire } from "@/lib/fires";
import type { ActionResult } from "./actions";

/** Fires list: j/k move, `c` makes an ops task for the focused fire. */
export function Fires({
  fires,
  create,
}: {
  fires: Fire[];
  create: (f: { key: string; title: string; detail?: string }) => Promise<ActionResult>;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const live = useRef({ fires, sel, create });
  live.current = { fires, sel, create };

  async function make(f: Fire) {
    setMsg((m) => ({ ...m, [f.key]: "creating…" }));
    try {
      const r = await live.current.create({ key: f.key, title: f.title, detail: f.detail });
      setMsg((m) => ({ ...m, [f.key]: r.message }));
    } catch {
      setMsg((m) => ({ ...m, [f.key]: "failed" }));
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (ownsKeys(e.target as HTMLElement | null, e.key)) return;
      const { fires, sel } = live.current;
      const i = fires.findIndex((f) => f.key === sel);
      if (e.key === "j" || e.key === "k") {
        if (!fires.length) return;
        const n = e.key === "j" ? Math.min(i + 1, fires.length - 1) : Math.max(i - 1, 0);
        setSel(fires[n]?.key ?? null);
      } else if (e.key === "c" && i >= 0) {
        const f = fires[i];
        if (f) void make(f);
      } else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!fires.length) return <div className="empty">No fires.</div>;
  return (
    <div className="card" data-testid="fires">
      {fires.map((f) => (
        <div
          key={f.key}
          className={`row${f.key === sel ? " f" : ""}`}
          onClick={() => setSel(f.key)}
          aria-current={f.key === sel ? "true" : undefined}
        >
          <div className="rb">
            <div className="r1">
              <span className="rt">{f.title}</span>
              <span className={`chip ${f.severity === "urgent" ? "bad" : "warn"}`}>{f.kind}</span>
            </div>
            <div className="r2">
              {f.detail}
              {msg[f.key] ? <b> · {msg[f.key]}</b> : null}
            </div>
          </div>
          <button type="button" className="btn sm" onClick={() => void make(f)}>
            <b className="k">c</b> task
          </button>
        </div>
      ))}
    </div>
  );
}
