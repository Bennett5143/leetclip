import assert from "node:assert/strict";
import { test } from "node:test";
import type { LeetCode } from "leetcode-query";
import { collectAcceptedSubmissions, type Submission } from "../src/leetcode";

function submission(
  id: number,
  titleSlug: string,
  timestamp: number,
  statusDisplay: string
): Submission {
  return { id, titleSlug, timestamp, statusDisplay } as Submission;
}

test("backfill keeps the newest accepted submission for each problem across pages", async () => {
  const calls: number[] = [];
  const pages = [
    [submission(1, "a", 100, "Accepted"), submission(2, "b", 200, "Wrong Answer")],
    [submission(3, "a", 300, "Accepted"), submission(4, "b", 150, "Accepted")],
    [],
  ];
  const leetcode = {
    submissions: async ({ offset }: { offset: number }) => {
      calls.push(offset);
      return pages[offset / 20];
    },
  } as unknown as LeetCode;
  const result = await collectAcceptedSubmissions(leetcode);
  assert.deepEqual(calls, [0, 20, 40]);
  assert.deepEqual(
    result.map((s) => s.id),
    [3, 4]
  );
});

test("backfill fails after a page remains unavailable instead of returning partial results", async () => {
  const calls: number[] = [];
  const leetcode = {
    submissions: async ({ offset }: { offset: number }) => {
      calls.push(offset);
      if (offset === 0) return [submission(1, "a", 100, "Accepted")];
      throw new Error("offline");
    },
  } as unknown as LeetCode;
  await assert.rejects(
    collectAcceptedSubmissions(leetcode),
    /offset 20 failed after 3 attempts: offline/
  );
  assert.deepEqual(calls, [0, 20, 20, 20]);
});
