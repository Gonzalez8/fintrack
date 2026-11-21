import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearOfflineData, takeSharedFiles } from "./offline";

// Minimal in-memory CacheStorage: enough for what lib/offline.ts uses
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      keys: async () => [...store.keys()].map((url) => new Request(`http://app${url}`)),
      match: async (req: Request) => store.get(new URL(req.url).pathname),
      put: async (url: string, res: Response) => void store.set(url, res),
      delete: async (req: Request) => store.delete(new URL(req.url).pathname),
    };
  };
  return {
    stores,
    api: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
  };
}

describe("offline helpers", () => {
  let fake: ReturnType<typeof fakeCaches>;
  beforeEach(() => {
    fake = fakeCaches();
    vi.stubGlobal("caches", fake.api);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("clearOfflineData deletes only Fintrack caches", async () => {
    await fake.api.open("fintrack-data-v1");
    await fake.api.open("fintrack-pages-v1");
    await fake.api.open("other-app");
    await clearOfflineData();
    expect([...fake.stores.keys()]).toEqual(["other-app"]);
  });

  it("takeSharedFiles returns the shared PDFs once", async () => {
    const share = await fake.api.open("fintrack-share");
    await share.put(
      "/shared/0",
      new Response("%PDF-1.4", {
        // Same headers public/sw.js stores with each shared file
        headers: { "Content-Type": "application/pdf", "X-File-Name": encodeURIComponent("nómina octubre.pdf") },
      }),
    );
    const files = await takeSharedFiles();
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("nómina octubre.pdf");
    expect(files[0].type).toBe("application/pdf");
    expect(await takeSharedFiles()).toHaveLength(0);
  });
});
