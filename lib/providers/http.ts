import "server-only";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { publicIp, safeUrl } from "../utils";
export async function resolvePublic(url: string) {
  const clean = safeUrl(url);
  if (!clean) throw new Error("URL non pubblico o non consentito");
  const host = new URL(clean).hostname.replace(/^\[|\]$/g, "");
  const records = await Promise.race([
    lookup(host, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new Error("Timeout DNS")), 4000);
      t.unref();
    }),
  ]);
  if (!records.length || records.some((r) => !publicIp(r.address)))
    throw new Error("Indirizzo di rete non pubblico");
  return records.find((record) => record.family === 4) || records[0];
}
/** Resolve and pin the validated address into the actual socket. Revalidate every redirect. */
export async function publicHtml(
  url: string,
  redirects = 0,
  deadline = Date.now() + 12000,
): Promise<{ body: string; status: number; url: string; type: string }> {
  if (redirects > 3) throw new Error("Troppi redirect");
  if (Date.now() >= deadline) throw new Error("Timeout redirect");
  const resolved = await resolvePublic(url);
  const u = new URL(url);
  const result = await new Promise<{
    body: string;
    status: number;
    location?: string;
    type: string;
  }>((resolve, reject) => {
    const transport = u.protocol === "https:" ? https : http;
    const req = transport.request(
      u,
      {
        method: "GET",
        agent: false,
        headers: {
          "User-Agent": "LocalLead/1.0 (public business website analysis)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "identity",
        },
        lookup: (_host, options, cb) => {
          // Modern Node requests an array when automatic IP-family selection is enabled.
          // Always return the address already validated above, never resolve it again.
          if (options.all) cb(null, [resolved]);
          else cb(null, resolved.address, resolved.family);
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        const type = String(res.headers["content-type"] || "");
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ body: "", status, location: res.headers.location, type });
          return;
        }
        if (!/text\/html|application\/xhtml/i.test(type)) {
          res.resume();
          resolve({ body: "", status, type });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 1_500_000) {
            res.destroy();
            reject(new Error("Pagina troppo grande"));
          } else chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            status,
            type,
          }),
        );
        res.on("error", reject);
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("Timeout sito")),
      Math.max(1, Math.min(8000, deadline - Date.now())),
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end();
  });
  if (result.location)
    return publicHtml(
      new URL(result.location, u).href,
      redirects + 1,
      deadline,
    );
  return { ...result, url: u.href };
}
export async function providerJson(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Provider: errore HTTP ${res.status}`);
  return res.json();
}
