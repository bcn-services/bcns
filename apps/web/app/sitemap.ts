import type { MetadataRoute } from "next";
import { siteConfig } from "../lib/site.ts";
import { siteContent } from "../lib/content.ts";

type Freq = MetadataRoute.Sitemap[number]["changeFrequency"];

// lastModified is the date the page's content last changed, edited by hand.
// Build time would tell crawlers every page changed on every deploy.
type Page = [path: string, lastModified: string, changeFrequency: Freq, priority: number];

const pages: Page[] = [
  ["", "2026-10-06", "monthly", 1],
  ["/services", "2026-10-06", "monthly", 0.8],
  ["/services/connect", "2026-10-06", "monthly", 0.8],
  ["/services/connect/setup", "2026-10-06", "monthly", 0.7],
  ["/services/deluxe", "2026-10-06", "monthly", 0.8],
  ["/services/ai-consulting", "2026-10-06", "monthly", 0.8],
  ["/work", "2026-10-06", "monthly", 0.8],
  ...siteContent.pastWork.items.map(
    ({ slug }): Page => [`/work/${slug}`, "2026-10-06", "monthly", 0.6],
  ),
  ["/pricing", "2026-10-06", "monthly", 0.8],
  ["/about", "2026-10-06", "monthly", 0.8],
  ["/privacy", "2026-10-06", "yearly", 0.3],
  ["/terms", "2026-10-06", "yearly", 0.3],
];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map(([path, lastModified, changeFrequency, priority]) => ({
    url: `${siteConfig.url}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
