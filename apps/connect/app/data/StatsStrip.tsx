import { Button } from "@bcn-services/ui";
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
    <details className="relative ml-auto text-sm">
      <summary className="cursor-pointer select-none rounded-md border border-border bg-background px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Customize
      </summary>
      <form
        action={savePins}
        className="absolute right-0 z-10 mt-2 flex max-h-96 w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto rounded-md border border-border bg-background p-3 shadow-lg"
      >
        <input type="hidden" name="returnTo" value={returnTo} />
        {sources.map((s) => (
          <fieldset key={s.source} className="space-y-1">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">{s.title}</legend>
            {catalog
              .filter((stat) => stat.source === s.source)
              .map((stat) => (
                <label key={stat.id} className="flex items-center gap-2 py-0.5">
                  <input type="checkbox" name="pin" value={stat.id} defaultChecked={pinned.some((p) => p.id === stat.id)} />
                  {stat.label}
                </label>
              ))}
          </fieldset>
        ))}
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            Save
          </Button>
          <Button type="submit" name="reset" value="1" variant="ghost" size="sm">
            Reset
          </Button>
        </div>
      </form>
    </details>
  );

  if (pinned.length === 0) return <div className="flex justify-end">{customize}</div>;

  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-3 rounded-xl border border-border bg-card px-5 py-4">
      <dl className="flex flex-1 flex-wrap gap-x-8 gap-y-3">
        {pinned.map((stat) => (
          <div key={stat.id} className="min-w-28">
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="break-words text-xl font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      {customize}
    </div>
  );
}
