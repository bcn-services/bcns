"use client";

/**
 * HomeGrid.tsx — the home panels on a 12-column react-grid-layout grid with an
 * Edit layout mode (drag by the grip, resize from the corner, vertical
 * compaction). The panels arrive server-rendered; this only places them.
 *
 * The grid and the Edit button exist from GRID_MIN_PX (1101px) up; the button
 * (Reset/Done while editing, the save error) is portalled into the header slot
 * AppHeader renders left of "Sources & data" (LAYOUT_SLOT_ID). Below that the
 * panels render as plain CSS cells in default order (3-column metrics and
 * 2-column panels from 768px, one column under), saved layout ignored. The
 * server render and first client render are those same cells, which at >=1101px
 * CSS places exactly where the grid will (--x/--y/--w/--h), so there is no
 * layout jump and no-JS still shows the page; hydration matches at any width.
 * Charts are SVG with a viewBox that fills their card, so they follow any
 * resize with no measuring code (see .sparkline in globals.css).
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ReactGridLayout, { useContainerWidth, verticalCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { saveLayout } from "@/app/home-layout-actions";
import { COLS, GAP, GRID_MIN_PX, LAYOUT_SLOT_ID, ROW_H, defaultLayout, layoutToSave, mergeLayout, type LayoutItem } from "@/lib/home-layout";
import { DragHandleIcon } from "./icons";

export function HomeGrid({ panels, saved }: { panels: Record<string, React.ReactNode>; saved: unknown }) {
  const ids = useMemo(() => Object.keys(panels), [panels]);
  const { width, containerRef, mounted } = useContainerWidth();
  const [wide, setWide] = useState<boolean | null>(null);
  const [layout, setLayout] = useState<LayoutItem[]>(() => mergeLayout(saved, ids));
  const [wantsEdit, setWantsEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  // The header is server-rendered above this component, so its slot exists by the time effects run.
  useEffect(() => setSlot(document.getElementById(LAYOUT_SLOT_ID)), []);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${GRID_MIN_PX}px)`);
    const sync = () => {
      setWide(mq.matches);
      if (!mq.matches) setWantsEdit(false); // shrinking past the grid closes the editor
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // A fresh server read (after a save elsewhere) replaces what was last rendered. Keyed on
  // values, not identity: a header re-render (range pill, popup) must not wipe unsaved drags.
  const idsKey = ids.join(",");
  const savedKey = JSON.stringify(saved ?? null);
  useEffect(() => setLayout(mergeLayout(JSON.parse(savedKey), idsKey.split(","))), [savedKey, idsKey]);

  const editing = wantsEdit && wide === true;
  const dragConfig = useMemo(() => ({ enabled: editing, handle: ".hg-grip" }), [editing]);
  const resizeConfig = useMemo(() => ({ enabled: editing }), [editing]);

  // Both buttons wait for the save: a failure keeps the editor open with its changes.
  const persist = async (next: LayoutItem[] | null, leave: boolean) => {
    setBusy(true);
    setFailed(false);
    let ok = false;
    try {
      ok = await saveLayout(next ? layoutToSave(next) : null);
    } catch {
      ok = false;
    }
    setBusy(false);
    if (!ok) return setFailed(true);
    if (next === null) setLayout(defaultLayout(ids));
    if (leave) setWantsEdit(false);
  };

  const showGrid = wide === true && mounted;
  const at = new Map(layout.map((d) => [d.i, d]));

  const bar =
    wide === true && slot
      ? createPortal(
          <>
            {failed ? <span className="hg-bar__error">Couldn&apos;t save the layout. Try again.</span> : null}
            {editing ? (
              <>
                <button type="button" className="page-btn" disabled={busy} onClick={() => persist(null, false)}>
                  Reset
                </button>
                <button type="button" className="page-btn is-active" disabled={busy} onClick={() => persist(layout, true)}>
                  Done
                </button>
              </>
            ) : (
              <button type="button" className="page-btn" onClick={() => setWantsEdit(true)}>
                Edit layout
              </button>
            )}
          </>,
          slot,
        )
      : null;

  return (
    <div className={editing ? "hg is-editing" : "hg"}>
      {bar}
      {/* cast: RGL v2 types the ref for React 19's RefObject<T | null>; this app is on React 18 */}
      <div ref={containerRef as React.RefObject<HTMLDivElement>}>
        {!showGrid ? (
          <div className="hg-stack">
            {defaultLayout(ids).map((d) => {
              const p = at.get(d.i) ?? d;
              // cast: React's CSSProperties has no custom properties; read by .hg-cell at >=1101px
              const pos = { "--x": p.x + 1, "--y": p.y + 1, "--w": p.w, "--h": p.h } as React.CSSProperties;
              return (
                <div key={d.i} className={d.i.startsWith("m-") ? "hg-cell hg-cell--metric" : "hg-cell"} style={pos}>
                  {panels[d.i]}
                </div>
              );
            })}
          </div>
        ) : (
          <ReactGridLayout
            width={width}
            layout={layout}
            gridConfig={{ cols: COLS, rowHeight: ROW_H, margin: [GAP, GAP], containerPadding: [0, 0] }}
            dragConfig={dragConfig}
            resizeConfig={resizeConfig}
            compactor={verticalCompactor}
            onLayoutChange={(next) => editing && setLayout(next.map(({ i, x, y, w, h, minW, minH }) => ({ i, x, y, w, h, minW, minH })))}
          >
            {layout.map((d) => (
              <div key={d.i} className="hg-item">
                {editing ? (
                  <span className="hg-grip" title="Drag to move">
                    <DragHandleIcon />
                  </span>
                ) : null}
                {panels[d.i]}
              </div>
            ))}
          </ReactGridLayout>
        )}
      </div>
    </div>
  );
}
