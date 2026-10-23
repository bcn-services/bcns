"use client";

/**
 * HomeGrid.tsx — the home panels on a 12-column react-grid-layout grid with an
 * Edit layout mode (drag by the grip, resize from the corner, vertical
 * compaction). The panels arrive server-rendered; this only places them.
 *
 * Below 768px the grid is not used at all: a fixed single column in default
 * order, no Edit button, the saved layout ignored. Before mount (server render
 * and first client render) it is that same column, so hydration matches.
 * Charts are SVG with a viewBox that fills their card, so they follow any
 * resize with no measuring code (see .sparkline in globals.css).
 */

import { useEffect, useMemo, useState } from "react";
import ReactGridLayout, { useContainerWidth, verticalCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { saveLayout } from "@/app/home-layout-actions";
import { COLS, GAP, MOBILE_PX, ROW_H, defaultLayout, layoutToSave, mergeLayout, type LayoutItem } from "@/lib/home-layout";
import { DragHandleIcon } from "./icons";

export function HomeGrid({ panels, saved }: { panels: Record<string, React.ReactNode>; saved: unknown }) {
  const ids = useMemo(() => Object.keys(panels), [panels]);
  const { width, containerRef, mounted } = useContainerWidth();
  const [narrow, setNarrow] = useState<boolean | null>(null);
  const [layout, setLayout] = useState<LayoutItem[]>(() => mergeLayout(saved, ids));
  const [wantsEdit, setWantsEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_PX - 1}px)`);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // A fresh server read (after a save elsewhere) replaces what was last rendered.
  useEffect(() => setLayout(mergeLayout(saved, ids)), [saved, ids]);

  const editing = wantsEdit && narrow === false;
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

  const stacked = !mounted || narrow !== false;

  return (
    <div className={editing ? "hg is-editing" : "hg"}>
      {narrow === false ? (
        <div className="hg-bar">
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
        </div>
      ) : null}

      {/* cast: RGL v2 types the ref for React 19's RefObject<T | null>; this app is on React 18 */}
      <div ref={containerRef as React.RefObject<HTMLDivElement>}>
        {stacked ? (
          <div className="hg-stack">
            {defaultLayout(ids).map((d) => (
              <div key={d.i}>{panels[d.i]}</div>
            ))}
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
