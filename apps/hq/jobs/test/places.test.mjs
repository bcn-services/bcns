import { test } from "node:test";
import assert from "node:assert/strict";

import { createPlaces, FIELD_MASK, SEARCH_URL } from "../lib/places.mjs";
import { createReadBudget, DEFAULT_CAP } from "../lib/budget.mjs";

// Every fetch here is a fake. Nothing in this file opens a socket.
const fakeFetch = (body, { ok = true, status = 200 } = {}) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
  fn.calls = calls;
  return fn;
};

const PLACE = {
  id: "ChIJ1",
  displayName: { text: "Harbor Lane Bookkeeping" },
  formattedAddress: "1 Main St, Milford, CT 06460, USA",
  nationalPhoneNumber: "phone-fixture-1",
  websiteUri: "https://www.harborlane.example.invalid/",
  rating: 4.7,
  userRatingCount: 88,
};

test("search posts a Places (New) text search with the API key header and the field mask", async () => {
  const fetch = fakeFetch({ places: [PLACE] });
  await createPlaces({ apiKey: "key-123", fetch }).search("bookkeepers in Milford CT");

  const [{ url, init }] = fetch.calls;
  assert.equal(url, SEARCH_URL);
  assert.equal(init.method, "POST");
  assert.equal(init.headers["X-Goog-Api-Key"], "key-123");
  assert.equal(init.headers["X-Goog-FieldMask"], FIELD_MASK);
  assert.deepEqual(JSON.parse(init.body), {
    textQuery: "bookkeepers in Milford CT",
    maxResultCount: 20,
  });
  // The key rides in the header, never the URL; no bearer token, no GCP project.
  assert.ok(!/key=/.test(url));
  assert.ok(!("authorization" in init.headers) && !("x-goog-user-project" in init.headers));
  assert.ok(init.signal, "the request carries a timeout signal");
});

test("the field mask is pinned: only stored fields, and nextPageToken or Places never pages", () => {
  assert.equal(
    FIELD_MASK,
    "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,nextPageToken"
  );
  assert.ok(!FIELD_MASK.includes("*"));
});

test("search maps a Places response to the row shape source inserts, alongside a nextPageToken", async () => {
  const fetch = fakeFetch({
    places: [PLACE, { id: "ChIJ2", displayName: { text: "Bare Co" } }],
    nextPageToken: "tok-page-2",
  });
  const { results, nextPageToken } = await createPlaces({ apiKey: "k", fetch }).search("q");
  assert.deepEqual(results[0], {
    place_id: "ChIJ1",
    name: "Harbor Lane Bookkeeping",
    phone: "phone-fixture-1",
    website: "https://www.harborlane.example.invalid/",
    address: "1 Main St, Milford, CT 06460, USA",
    rating: 4.7,
    review_count: 88,
  });
  assert.deepEqual(results[1], {
    place_id: "ChIJ2",
    name: "Bare Co",
    phone: null,
    website: null,
    address: null,
    rating: null,
    review_count: null,
  });
  assert.equal(nextPageToken, "tok-page-2");
});

test("pageToken is sent only when given; nextPageToken is null when absent", async () => {
  const fetch = fakeFetch({ places: [PLACE] });
  const places = createPlaces({ apiKey: "k", fetch });
  assert.equal((await places.search("q")).nextPageToken, null);
  await places.search("q", { pageToken: "tok-page-2" });
  assert.ok(!("pageToken" in JSON.parse(fetch.calls[0].init.body)));
  assert.equal(JSON.parse(fetch.calls[1].init.body).pageToken, "tok-page-2");
});

test("search throws on a non-ok response rather than returning no rows", async () => {
  const fetch = fakeFetch({ error: "nope" }, { ok: false, status: 403 });
  await assert.rejects(
    createPlaces({ apiKey: "k", fetch }).search("q"),
    /places search failed \(403\)/
  );
});

test("createPlaces refuses to exist without a key", () => {
  assert.throws(() => createPlaces({}), /API key/);
});

// --- lib/budget.mjs: month-to-date from events -----------------------------

// A fake tagged-template sql: records the query text and bound values.
const fakeSql = (rows) => {
  const calls = [];
  const fn = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    if (rows instanceof Error) throw rows;
    return rows;
  };
  fn.calls = calls;
  return fn;
};

test("the default cap is 950", () => {
  assert.equal(DEFAULT_CAP, 950);
});

test("readBudget counts places_call events since the first of the UTC month", async () => {
  const sql = fakeSql([{ used: 150 }]);
  const out = await createReadBudget({ sql, now: () => new Date("2026-08-31T23:30:00Z") })();
  assert.deepEqual(out, { remaining: 800, month: "2026-08", used: 150, cap: 950 });
  const [{ text, values }] = sql.calls;
  assert.match(text, /from events/);
  assert.match(text, /kind = 'places_call'/);
  assert.doesNotMatch(text, /job\s*=/, "any job counts, not just source");
  assert.equal(values[0].toISOString(), "2026-08-01T00:00:00.000Z");
});

test("readBudget honours a custom cap and floors at zero", async () => {
  const readBudget = createReadBudget({ sql: fakeSql([{ used: 400 }]), cap: 100 });
  assert.equal((await readBudget()).remaining, 0);
  assert.equal(
    (await createReadBudget({ sql: fakeSql([{ used: 0 }]), cap: 100 })()).remaining,
    100
  );
});

test("readBudget fails closed: a failing or malformed count throws, never a number", async () => {
  await assert.rejects(
    createReadBudget({ sql: fakeSql(new Error("connection refused")) })(),
    /connection refused/
  );
  for (const rows of [[], undefined, [{}], [{ used: "lots" }], [{ used: -1 }]]) {
    await assert.rejects(
      createReadBudget({ sql: fakeSql(rows) })(),
      /malformed usage count/,
      JSON.stringify(rows)
    );
  }
  assert.throws(() => createReadBudget({}), /sql client/);
});
