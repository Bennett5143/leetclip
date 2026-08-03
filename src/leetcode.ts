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

// Fetch every accepted submission, keeping only the most recent one per problem.
export async function collectAcceptedSubmissions(leetcode: LeetCode): Promise<Submission[]> {
  const byProblem = new Map<string, Submission>();
  const pageSize = 20;
  let offset = 0;

  while (offset < 5000) {
    const page = await leetcode.submissions({ limit: pageSize, offset }).catch(() => []);
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
