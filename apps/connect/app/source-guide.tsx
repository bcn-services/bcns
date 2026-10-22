import { GUIDES, GUIDE_FOOTER } from "@/lib/source-guides";
import { TITLES, type HubSource } from "@/lib/sources";
import { KIND, MONO, kindSlug } from "./source-look";

/**
 * The "How to connect" panel: always open. `anchor` is its id (and heading id prefix); the source page keeps
 * the default, the /guide page stacks six and passes a distinct one each.
 */
export function SourceGuide({ source, anchor = "how", footer = true }: { source: HubSource; anchor?: string; footer?: boolean }) {
  const guide = GUIDES[source];
  return (
    <section className="panel gd" id={anchor} aria-labelledby={`${anchor}-h`}>
      <div className="hd">
        <span className="sc-b" data-kind={kindSlug(KIND[source])} aria-hidden="true">
          {MONO[source]}
        </span>
        <h2 id={`${anchor}-h`}>How to connect {TITLES[source]}</h2>
      </div>
      <div className="body">
        <p className="gd-lead">{guide.intro}</p>
        <ol className="steps gd-steps" role="list">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="gd-notes">
          <p className="note">{guide.after}</p>
          {footer && <p className="note">{GUIDE_FOOTER}</p>}
        </div>
      </div>
    </section>
  );
}
