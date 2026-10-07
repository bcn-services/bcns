/**
 * Machine-readable views of the site: JSON-LD graphs and llms.txt.
 * Every value is read from siteConfig / siteContent so prices and names
 * can't drift from what the pages say.
 */
import { siteConfig } from "./site.ts";
import { siteContent, type PricingTier } from "./content.ts";

const ORG_ID = `${siteConfig.url}/#org`;

/** "$5,000+ setup" → 5000. Throws so a reworded price fails the build, not the schema. */
export function parsePrice(text: string | undefined): number {
  const amount = text?.match(/\$([\d,]+)/)?.[1];
  if (!amount) throw new Error(`No $ amount in price text: ${text}`);
  return Number(amount.replace(/,/g, ""));
}

function tier(id: PricingTier["id"]): PricingTier {
  const t = siteContent.pricing.tiers.find((x) => x.id === id);
  if (!t) throw new Error(`No pricing tier "${id}"`);
  return t;
}

export function siteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: siteConfig.name,
        legalName: siteConfig.legalName,
        url: siteConfig.url,
        email: siteConfig.email,
        description: `${siteConfig.description} ${siteConfig.serviceArea}`,
        founder: siteContent.about.founders.map((f) => ({
          "@type": "Person",
          name: f.name,
          jobTitle: f.roleLine,
          ...(f.sameAs?.length ? { sameAs: f.sameAs } : {}),
        })),
      },
      {
        "@type": "WebSite",
        "@id": `${siteConfig.url}/#site`,
        url: siteConfig.url,
        name: siteConfig.name,
        publisher: { "@id": ORG_ID },
      },
    ],
  };
}

const SERVICES = {
  connect: { path: "/services/connect", meta: "connect" },
  deluxe: { path: "/services/deluxe", meta: "deluxe" },
  consulting: { path: "/services/ai-consulting", meta: "aiConsulting" },
} as const;

export type ServiceId = keyof typeof SERVICES;

function offer(id: ServiceId) {
  const t = tier(id);
  const usd = { priceCurrency: "USD" };
  if (id === "deluxe") {
    return {
      "@type": "Offer",
      ...usd,
      priceSpecification: [
        { "@type": "PriceSpecification", name: "Setup", minPrice: parsePrice(t.setup), ...usd },
        {
          "@type": "UnitPriceSpecification",
          name: "Monthly",
          minPrice: parsePrice(t.monthly),
          unitText: "MONTH",
          ...usd,
        },
      ],
    };
  }
  return {
    "@type": "Offer",
    ...usd,
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: parsePrice(t.price),
      unitText: id === "connect" ? "MONTH" : "DAY",
      ...usd,
    },
  };
}

export function serviceJsonLd(id: ServiceId) {
  const s = SERVICES[id];
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: tier(id).name,
    url: `${siteConfig.url}${s.path}`,
    description: siteContent.pageMeta[s.meta].description,
    provider: { "@id": ORG_ID },
    offers: offer(id),
  };
}

export function llmsTxt(): string {
  const u = siteConfig.url;
  const { pageMeta, about, pastWork } = siteContent;
  const pages = [
    ...siteConfig.services.map((p) => (p.href === "/services" ? { ...p, label: "Services" } : p)),
    ...siteConfig.nav.filter((n) => n.href !== "/services"),
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ];
  return [
    `# ${siteConfig.name}`,
    "",
    `> ${siteConfig.description} ${siteConfig.serviceArea} Run by ${siteConfig.legalName}.`,
    "",
    "## What we offer",
    ...(Object.keys(SERVICES) as ServiceId[]).map(
      (id) => `- ${tier(id).name}: ${pageMeta[SERVICES[id].meta].description}`,
    ),
    "",
    "## Who runs it",
    ...about.founders.map(
      (f) => `- ${f.name}, ${f.roleLine}${f.credentials[0] ? ` (${f.credentials[0]})` : ""}`,
    ),
    "",
    "## Past work",
    ...pastWork.items.map((i) => `- ${i.title}: ${u}/work/${i.slug}`),
    "",
    "## Contact",
    `Email: ${siteConfig.email}`,
    "",
    "## Key pages",
    ...pages.map((p) => `- ${p.label}: ${u}${p.href}`),
    "",
  ].join("\n");
}
