// Places API (New) text search, restricted API key in the X-Goog-Api-Key header.
//
// No key, no client: jobs/run.mjs fails the source run loudly rather than
// spending blind.
//
// One call returns up to 20 places. `search` also returns `nextPageToken`
// when Places has more, so a caller (jobs/source.mjs) can page a cell up to
// its own MAX_PAGES rather than settling for one page's worth per run.

// Only the fields the businesses table stores. A '*' mask silently upgrades
// every call to the priciest SKU.
export const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  // Places (New) only returns fields the mask names; without this the token
  // never arrives and every cell silently stops after page one.
  "nextPageToken",
].join(",");

export const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

export function createPlaces({
  apiKey,
  fetch = globalThis.fetch,
  maxResults = 20,
  timeoutMs = 15_000,
} = {}) {
  if (!apiKey) throw new Error("createPlaces needs an API key");

  return {
    async search(query, { pageToken } = {}) {
      const body = { textQuery: query, maxResultCount: maxResults };
      if (pageToken) body.pageToken = pageToken;
      const res = await fetch(SEARCH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(
          `places search failed (${res.status}): ${String(await res.text()).slice(0, 300)}`
        );
      }
      const resBody = await res.json();
      const results = (resBody?.places ?? []).map((p) => ({
        place_id: p.id ?? null,
        name: p.displayName?.text ?? null,
        phone: p.nationalPhoneNumber ?? null,
        website: p.websiteUri ?? null,
        address: p.formattedAddress ?? null,
        rating: p.rating ?? null,
        review_count: p.userRatingCount ?? null,
      }));
      return { results, nextPageToken: resBody?.nextPageToken ?? null };
    },
  };
}
