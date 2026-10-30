import Link from "next/link";
import type { Task } from "@/lib/tasks";
import type { BoardCard } from "@/lib/tracks";

/** One board card: the track name and its steps (tagged with client_slug when set). A step opens its task (onStep) or links to /work?task=. */
export function TrackCard({
  card,
  onStep,
}: {
  card: BoardCard<Task & { lead?: string | null }>; // `lead`: the linked business name, when the page loaded it
  onStep?: (taskId: string) => void;
}) {
  const { track, steps } = card;
  return (
    <div className="wk-card">
      <div className="wk-ct">{track.name}</div>
      {steps.length ? (
        <ul>
          {steps.map((t) => {
            const done = t.status === "done";
            const inner = (
              <>
                <span className={`wk-mini${done ? " on" : ""}`} aria-hidden="true">
                  {done ? "✓" : ""}
                </span>
                <span className={`wk-step-t${done ? " done" : ""}`}>{t.title}</span>
                {t.client_slug || t.lead ? (
                  <span className="chip">{t.client_slug ?? t.lead}</span>
                ) : null}
              </>
            );
            return (
              <li key={t.id}>
                {onStep ? (
                  <button
                    type="button"
                    className={`wk-step own-${t.owners[0] ?? "none"}`}
                    onClick={() => onStep(t.id)}
                  >
                    {inner}
                  </button>
                ) : (
                  <Link
                    className={`wk-step own-${t.owners[0] ?? "none"}`}
                    href={`/work?task=${t.id}`}
                  >
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="wk-none">No steps yet</p>
      )}
    </div>
  );
}
