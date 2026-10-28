/**
 * The keyboard hint bar at the foot of a page (v2 `.hint`): only the keys that work on that page for
 * that role. Each hint is its keys and what they do, e.g. [["j", "k"], "move"].
 */
export type Hint = [keys: string[], label: string];

export function HintBar({ hints }: { hints: Hint[] }) {
  return (
    <footer className="keys">
      {hints.map(([keys, label]) => (
        <span key={label}>
          {keys.map((k) => (
            <b className="k" key={k}>
              {k}
            </b>
          ))}{" "}
          {label}
        </span>
      ))}
    </footer>
  );
}
