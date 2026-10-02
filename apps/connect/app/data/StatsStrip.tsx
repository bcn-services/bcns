import type { Stat } from "@/lib/data-stats";
import { savePins } from "./actions";

/** The pinned numbers (none pinned = no box) and, always, the Customize menu that edits them. */
export function StatsStrip({
  pinned,
  catalog,
  sources,
  returnTo,
}: {
  pinned: readonly Stat[];
  catalog: readonly Stat[];
  sources: readonly { source: string; title: string }[];
  returnTo: string;
}) {
  const customize = (
    <details className="cust">
      <summary>Customize</summary>
      <form action={savePins}>
        <input type="hidden" name="returnTo" value={returnTo} />
        {sources.map((s) => (
          <fieldset key={s.source}>
            <legend>{s.title}</legend>
            {catalog
              .filter((stat) => stat.source === s.source)
              .map((stat) => (
                <label key={stat.id}>
                  <input type="checkbox" name="pin" value={stat.id} defaultChecked={pinned.some((p) => p.id === stat.id)} />
                  {stat.label}
                </label>
              ))}
          </fieldset>
        ))}
        <div className="row">
          <button type="submit" className="btn btn-sm">
            Save
          </button>
          <button type="submit" name="reset" value="1" className="btn btn-ghost btn-sm">
            Reset
          </button>
        </div>
      </form>
    </details>
  );

  if (pinned.length === 0) return <div className="stats-solo">{customize}</div>;

  return (
    <div className="stats">
      <dl>
        {pinned.map((stat) => (
          <div key={stat.id}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
      {customize}
    </div>
  );
}
