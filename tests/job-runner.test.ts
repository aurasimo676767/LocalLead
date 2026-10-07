import { describe, expect, it, vi } from "vitest";
import { retry, runEach } from "@/lib/job-runner";

const noWait = () => Promise.resolve();

describe("a batch never stops on one lead", () => {
  it("keeps going after a failure and reports it", async () => {
    const done: string[] = [];
    const failures = await runEach(
      ["a", "b", "c"],
      async (id) => {
        if (id === "b") throw new Error("Salvataggio non riuscito");
        done.push(id);
      },
      { wait: noWait },
    );
    expect(done).toEqual(["a", "c"]);
    expect(failures).toEqual([{ id: "b", error: "Salvataggio non riuscito" }]);
  });
  it("reports progress for every lead", async () => {
    const seen: number[] = [];
    await runEach(["a", "b"], async () => {}, {
      wait: noWait,
      onProgress: (index) => seen.push(index),
    });
    expect(seen).toEqual([0, 1]);
  });
});

describe("retries", () => {
  it("waits a minute and retries when there are too many requests", async () => {
    const wait = vi.fn(noWait);
    let calls = 0;
    const result = await retry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("Troppe richieste: attendi un minuto");
        return "ok";
      },
      { wait },
    );
    expect(result).toBe("ok");
    expect(wait).toHaveBeenCalledWith(60_000);
    expect(calls).toBe(3);
  });
  it("retries once on an edit conflict, then gives up", async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw new Error(
            "Lead modificato in un’altra scheda: aggiorna la pagina",
          );
        },
        { wait: noWait },
      ),
    ).rejects.toThrow(/modificato/);
    expect(calls).toBe(2);
  });
  it("does not retry other errors", async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw new Error("Lead non trovato");
        },
        { wait: noWait },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
