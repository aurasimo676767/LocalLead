export type StepFailure = { id: string; error: string };
type Options = { wait?: (ms: number) => Promise<void> };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Operazione non riuscita";

/**
 * One call with the retries a long batch needs: a rate limit waits a minute
 * (up to three times), an edit conflict is tried once more. Anything else is
 * the caller's to report.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  { wait = sleep }: Options = {},
): Promise<T> {
  let limited = 0;
  let conflicts = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      const text = message(e);
      if (/troppe richieste|429/i.test(text) && limited < 3) {
        limited++;
        await wait(60_000);
      } else if (
        /modificato in un.altra scheda|conflict/i.test(text) &&
        !conflicts
      ) {
        conflicts++;
        await wait(1500);
      } else throw e;
    }
  }
}

/** Runs a step for every id in turn; a failing id is reported, never fatal. */
export async function runEach(
  ids: string[],
  step: (id: string, index: number) => Promise<void>,
  {
    wait = sleep,
    onProgress,
  }: Options & { onProgress?: (index: number, id: string) => void } = {},
): Promise<StepFailure[]> {
  const failures: StepFailure[] = [];
  for (const [index, id] of ids.entries()) {
    onProgress?.(index, id);
    try {
      await retry(() => step(id, index), { wait });
    } catch (e) {
      failures.push({ id, error: message(e) });
    }
  }
  return failures;
}
