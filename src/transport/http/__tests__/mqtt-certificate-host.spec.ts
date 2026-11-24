import { describe, expect, it } from "vitest";

import { MemorySessionStore } from "../../../core/store.js";
import { MegaHttpClient } from "../mega-client.js";

/**
 * Where the security certificate (`app/mqtt/register/iot`) is asked: the app's Basic host, which is
 * `estimate_domain`'s `domain` as named — a `mega-` one included — and which the app caches across launches.
 * Synthetic hosts throughout.
 */
const DOMAIN = "mega-zz-pr.example.invalid";

function client(store = new MemorySessionStore()) {
  const mega = new MegaHttpClient({
    email: "synthetic@example.invalid",
    password: "synthetic",
    countryCode: "US",
    store,
  });
  const internals = mega as unknown as {
    auth_: { userId: string; authToken: string };
    sessionKey: { shareKey: string; keyIdent: string; createdAt: number };
    httpPost: (url: string) => Promise<{ status: number; data: unknown }>;
    persist: () => void;
  };
  const urls: string[] = [];
  internals.httpPost = async (url) => {
    urls.push(url);
    return url.endsWith("/estimate_domain")
      ? { status: 200, data: { code: 0, data: { domain: DOMAIN } } }
      : { status: 200, data: { code: 0, data: { endpoint_addr: "e" } } };
  };
  return { mega, internals, urls, store };
}

describe("security certificate host", () => {
  it("asks the `mega-` domain estimate_domain names, not one rebuilt from the region", async () => {
    const { mega, internals, urls } = client();
    await mega.estimateDomain();
    internals.auth_ = { userId: "synthetic-user", authToken: "synthetic-token" };
    internals.sessionKey = { shareKey: "00".repeat(16), keyIdent: "ident-0", createdAt: Date.now() };
    await mega.getUserMqttInfo("eufy_security");
    expect(urls.at(-1)).toBe(`https://${DOMAIN}/app/mqtt/register/iot`);
  });

  it("keeps that domain across a restored session", async () => {
    const first = client();
    await first.mega.estimateDomain();
    first.internals.auth_ = { userId: "synthetic-user", authToken: "synthetic-token" };
    first.internals.sessionKey = { shareKey: "00".repeat(16), keyIdent: "ident-0", createdAt: Date.now() };
    first.internals.persist();

    const restored = client(first.store);
    await restored.mega.getUserMqttInfo("eufy_security");
    expect(restored.urls).toEqual([`https://${DOMAIN}/app/mqtt/register/iot`]);
  });
});
