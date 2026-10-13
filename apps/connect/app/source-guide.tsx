import { GUIDES, GUIDE_FOOTER } from "@/lib/source-guides";
import { TITLES, type HubSource } from "@/lib/sources";

/** The "How to connect" panel on a source page. Always open, so the Sources card can link to #how. */
export function SourceGuide({ source }: { source: HubSource }) {
  const guide = GUIDES[source];
  return (
    <section className="panel" id="how" aria-labelledby="how-h">
      <h2 id="how-h">How to connect {TITLES[source]}</h2>
      <div className="body">
        <p className="sub">{guide.intro}</p>
        <ol className="steps" role="list">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="sub">{guide.after}</p>
        <p className="sub">{GUIDE_FOOTER}</p>
      </div>
    </section>
  );
}
