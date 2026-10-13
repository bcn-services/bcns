import Link from "next/link";
import { requireHub } from "@/lib/session";
import { HUB_SOURCES, TITLES } from "@/lib/sources";
import { GUIDE_FOOTER, guideFilter } from "@/lib/source-guides";
import { SourceGuide } from "../source-guide";
import { KIND, kindSlug } from "../source-look";

export const dynamic = "force-dynamic";

/** Every source's connection guide on one page; `?source=<slug>` narrows it to one. Same copy as each source page. */
export default async function GuidePage({ searchParams }: { searchParams: { source?: string } }) {
  // Same gate as the other pages: middleware needs a session, requireHub a membership.
  await requireHub();
  const only = guideFilter(searchParams.source);
  const shown = only ? [only] : HUB_SOURCES;

  return (
    <div className="pg">
      <section className="phead" aria-labelledby="guide-h">
        <div className="ph-r">
          <h1 id="guide-h" className="page-title">
            Connection guide
          </h1>
          <Link className="btn btn-out btn-sm" href="/">
            Back to Sources
          </Link>
        </div>
        <p className="sum">How to connect each source, in plain steps.</p>
      </section>

      <nav className="kchips" aria-label="Filter guides">
        <a className="kch" href="/guide" aria-current={only ? undefined : "true"}>
          All
        </a>
        {HUB_SOURCES.map((source) => (
          <a key={source} className="kch" data-kind={kindSlug(KIND[source])} href={`/guide?source=${source}`} aria-current={only === source ? "true" : undefined}>
            {TITLES[source]}
          </a>
        ))}
      </nav>

      {shown.map((source) => (
        <SourceGuide key={source} source={source} anchor={`how-${source}`} footer={false} />
      ))}
      <p className="note">{GUIDE_FOOTER}</p>
    </div>
  );
}
