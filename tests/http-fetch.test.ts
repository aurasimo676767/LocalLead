import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { RequestOptions } from "node:http";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ default: { request: mocks.request } }));
vi.mock("node:http", () => ({ default: { request: mocks.request } }));
import { publicHtml } from "@/lib/providers/http";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
});

function respond(status: number, location?: string) {
  mocks.request.mockImplementationOnce(
    (_url, options: RequestOptions, receive) => {
      const req = new EventEmitter() as EventEmitter & {
        end: () => void;
        destroy: (error: Error) => void;
      };
      req.destroy = (error) => {
        req.emit("error", error);
        req.emit("close");
      };
      req.end = () =>
        queueMicrotask(() => {
          const callback = vi.fn();
          options.lookup!("example.com", { all: true }, callback);
          const [, addresses] = callback.mock.calls[0];
          if (!Array.isArray(addresses)) {
            req.destroy(new Error("Invalid IP address: undefined"));
            return;
          }
          const response = Object.assign(new PassThrough(), {
            statusCode: status,
            headers: {
              "content-type": "text/html",
              ...(location ? { location } : {}),
            },
          });
          receive(response);
          response.end("<html><body>Menu del locale</body></html>");
          response.on("end", () => req.emit("close"));
        });
      return req;
    },
  );
}

describe("public HTML connection", () => {
  it("reads HTML using the modern Node all-address lookup contract", async () => {
    respond(200);
    const result = await publicHtml("https://example.com");
    expect(result.status).toBe(200);
    expect(result.body).toContain("Menu del locale");
    const options: RequestOptions = mocks.request.mock.calls[0][1];
    const callback = vi.fn();
    options.lookup!("example.com", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [
      { address: "8.8.8.8", family: 4 },
    ]);
    callback.mockClear();
    options.lookup!("example.com", { all: false }, callback);
    expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it("revalidates redirects and never connects to a private destination", async () => {
    respond(302, "https://private.example.com");
    mocks.lookup
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    await expect(publicHtml("https://example.com")).rejects.toThrow(
      "non pubblico",
    );
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
});
