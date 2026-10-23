/**
 * MondayPanel.tsx — the first five not-done items of the board's "Daily"
 * group. The ring on a row queues a mark-done command (app/monday-actions.ts);
 * the row reads "Done" with a small dot until a later sync shows it done, and a
 * failed command shows a quiet note. "View All" opens the board itself.
 */

import { taskBadge, type PanelState } from "@/lib/panels";
import type { CommandState, DailyTask } from "@/lib/monday";
import { markMondayDone } from "@/app/monday-actions";
import { MondayDoneButton } from "./MondayDoneButton";
import { MondayDots } from "./icons";
import { Panel, PanelButton, PanelHead, StateNote, ViewAll } from "./Panel";

export function MondayPanel({
  state,
  tasks,
  commands,
  boardUrl,
  connectHref,
}: {
  state: PanelState;
  tasks: DailyTask[];
  commands: ReadonlyMap<string, CommandState>;
  boardUrl: string | null;
  connectHref: string;
}) {
  return (
    <Panel className="panel--column">
      <PanelHead tile={<MondayDots />} title="Monday.com" small />
      <div className="subhead subhead--tight">
        <span className="subhead__title">Daily Board</span>
        {boardUrl ? <ViewAll href={boardUrl} external /> : null}
      </div>
      <div className="panel__fill">
        {state === "data" ? (
          <div className="task-list">
            {tasks.map((task, i) => {
              const itemId = task.external_id ?? "";
              const cmd = commands.get(itemId);
              const done = cmd === "pending" || cmd === "done";
              const badge = done ? { label: "Done", tone: "done" } : taskBadge(task);
              const title = task.title ?? "Untitled task";
              return (
                <form className="task-row" action={markMondayDone} key={task.id ?? `${title}-${i}`}>
                  <input type="hidden" name="item_id" value={itemId} />
                  {itemId ? <MondayDoneButton title={title} pending={done} /> : <span className="task-ring" aria-hidden="true" />}
                  <span className="task-row__title">{title}</span>
                  {cmd === "failed" ? <span className="task-row__note">Couldn’t update</span> : null}
                  {cmd === "pending" ? <span className="task-dot" role="img" aria-label="Updating Monday" /> : null}
                  <span className={`badge badge--${badge.tone}`}>{badge.label}</span>
                </form>
              );
            })}
          </div>
        ) : (
          <StateNote state={state} label="Monday.com" connectHref={connectHref} />
        )}
      </div>
      {boardUrl ? <PanelButton href={boardUrl} label="Open Monday.com" external /> : null}
    </Panel>
  );
}
