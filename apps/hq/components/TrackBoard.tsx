import "@/app/work.css";
import { COLUMNS, COLUMN_LABEL, type Column, type BoardCard } from "@/lib/tracks";
import { TrackCard } from "./TrackCard";

/**
 * The track board: Now / Next / Waiting / Done · 7 days, columns by task phase, so one track can
 * show in several. Presentational, so Work (client) and Today can both render it; pass onStep from
 * a client parent, or omit it and steps link to /work?task=<id>. `board` comes from buildBoard(tracks, tasks) in lib/tracks.ts.
 */
export function TrackBoard({
  board,
  onStep,
}: {
  board: Record<Column, BoardCard[]>;
  onStep?: (taskId: string) => void;
}) {
  return (
    <div className="wk-board">
      {COLUMNS.map((c) => (
        <div key={c}>
          <div className="wk-colh">{COLUMN_LABEL[c]}</div>
          <div className="wk-col">
            {board[c].map((card) => (
              <TrackCard key={card.track.id} card={card} onStep={onStep} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
