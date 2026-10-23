/**
 * MondayPanel.tsx — the first five not-done items of the board's "Daily"
 * group. The ring on a row queues a mark-done command (MondayRow, app/monday-actions.ts);
 * the row reads "Done" with a small dot until a later sync shows it done, and a
 * failed command shows a quiet note. "View All" opens the board itself.
 */

import { taskBadge, type PanelState } from "@/lib/panels";
import type { CommandState, DailyTask } from "@/lib/monday";
import { MondayRow } from "./MondayRow";
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
              const title = task.title ?? "Untitled task";
              return <MondayRow key={task.id ?? `${title}-${i}`} itemId={task.external_id ?? ""} title={title} cmd={commands.get(task.external_id ?? "")} badge={taskBadge(task)} />;
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
