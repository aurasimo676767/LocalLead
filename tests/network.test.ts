import { describe, it, expect, vi } from "vitest";
const lookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup }));
import { resolvePublic, publicHtml } from "@/lib/providers/http";
describe("SSRF DNS validation", () => {
  it("blocks a public-looking hostname resolving to a private address", async () => {
    lookup.mockResolvedValue([{ address: "10.1.2.3", family: 4 }]);
    await expect(publicHtml("https://looks-public.com")).rejects.toThrow(
      "non pubblico",
    );
  });
  it("rejects mixed public/private DNS answers", async () => {
    lookup.mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(resolvePublic("https://looks-public.com")).rejects.toThrow();
  });
  it("returns the validated public address to pin into the socket", async () => {
    lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    expect(await resolvePublic("https://looks-public.com")).toEqual({
      address: "8.8.8.8",
      family: 4,
    });
  });
  it("blocks local IPv6 before DNS/network access", async () => {
    lookup.mockClear();
    await expect(publicHtml("http://[::1]")).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();
  });
});
