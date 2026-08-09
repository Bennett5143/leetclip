import { LeetCode, Credential, type Submission } from "leetcode-query";
import { setTimeout as sleep } from "node:timers/promises";
import { resolveSession } from "./cookie";

export type { Submission };

export async function createLeetCode(): Promise<LeetCode> {
  const session = await resolveSession();
  const credential = new Credential();
  await credential.init(session);
  return new LeetCode(credential);
}

// A transient error must not silently truncate the backfill: retry with
// backoff, then fail loudly so incomplete results never look like success.
async function fetchPage(leetcode: LeetCode, limit: number, offset: number): Promise<Submission[]> {
  const attempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await leetcode.submissions({ limit, offset });
    } catch (err) {
      lastError = err;
      if (attempt < attempts) await sleep(1000 * attempt);
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Fetching submissions at offset ${offset} failed after ${attempts} attempts: ${msg}`
  );
}

// Fetch every accepted submission, keeping only the most recent one per problem.
export async function collectAcceptedSubmissions(leetcode: LeetCode): Promise<Submission[]> {
  const byProblem = new Map<string, Submission>();
  const pageSize = 20;
  let offset = 0;

  while (offset < 5000) {
    const page = await fetchPage(leetcode, pageSize, offset);
    if (page.length === 0) break;
    for (const sub of page) {
      if (sub.statusDisplay !== "Accepted") continue;
      const existing = byProblem.get(sub.titleSlug);
      if (!existing || sub.timestamp > existing.timestamp) {
        byProblem.set(sub.titleSlug, sub);
      }
    }
    offset += pageSize;
    await sleep(400);
  }
  return [...byProblem.values()];
}
