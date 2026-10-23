/**
 * MondayPanel.tsx — five items of the board's "Daily" group: the not-done ones
 * plus any marked Done from SB in the last day. The ring on a row queues a mark-done
 * command, or an undo when it is already checked (MondayRow, app/monday-actions.ts);
 * the row reads the new state with a small dot until a later sync shows it, and a
 * failed command shows a quiet note. "View All" opens the board itself.
 */

import type { PanelState } from "@/lib/panels";
import { isChecked, rowBadge, type DailyTask, type ItemCommand } from "@/lib/monday";
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
  commands: ReadonlyMap<string, ItemCommand>;
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
              const cmd = commands.get(task.external_id ?? "");
              const checked = isChecked(task, cmd);
              return <MondayRow key={task.id ?? `${title}-${i}`} itemId={task.external_id ?? ""} title={title} cmd={cmd?.state} checked={checked} badge={rowBadge(task, checked)} />;
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
