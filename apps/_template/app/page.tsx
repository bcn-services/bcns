import { PRICING, formatUsd, monthlyCharge } from "@bcn-services/app-core";
import { isAiEnabled } from "@/lib/ai";
import { getDataClient } from "@/lib/data";
import { getConfig } from "@/lib/env";
import { loadBranding } from "@/lib/branding";

// Proves the workspace deps resolve and the app renders 200 with no keys set
// and the AI flag off. The heading is the client's logo when its branding sets
// one (api.client_v1.branding), the text title otherwise.
export default async function HomePage() {
  const client = await getDataClient();
  const branding = client ? await loadBranding(client, getConfig().supabaseUrl) : null;
  const title = branding?.name ?? "bcns App Template";
  const aiOn = isAiEnabled();
  const standard = monthlyCharge("standard", 20);

  return (
    <main>
      <h1>
        {branding?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- public bucket URL, per-client; next/image would need its host allow-listed
          <img src={branding.logoUrl} alt={title} style={{ maxHeight: 48, width: "auto" }} />
        ) : (
          title
        )}
      </h1>
      <p>
        A runnable starter for a hosted client app. AI features are{" "}
        <strong>{aiOn ? "enabled" : "disabled"}</strong> (set <code>AI_ENABLED=1</code> to opt in).
      </p>
      <p>
        Standard plan base: {formatUsd(PRICING.standard.monthlyCents)}/mo. At 20 seats:{" "}
        {formatUsd(standard.totalCents)}/mo.
      </p>
    </main>
  );
}
