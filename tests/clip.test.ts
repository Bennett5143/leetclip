import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import type { LeetCode } from "leetcode-query";
import type { Submission } from "../src/leetcode";

const directory = await mkdtemp(join(tmpdir(), "leetclip-test-"));
process.env.LEETCODE_NOTES_DIR = directory;
const { clipSubmission } = await import("../src/clip");
after(async () => rm(directory, { recursive: true, force: true }));

const submission = { id: 1, lang: "golang", timestamp: 1_700_000_000_000 } as Submission;
const leetcode = {
  submission: async () => ({
    question: { titleSlug: "example" },
    code: "func main() {}",
    runtimeDisplay: "1 ms",
    runtimePercentile: 50,
    memoryDisplay: "1 MB",
    memoryPercentile: 50,
  }),
  problem: async () => ({
    questionFrontendId: "1",
    title: "Example",
    difficulty: "Easy",
    content: "<p>Problem</p>",
    similarQuestions: "[]",
    topicTags: [],
  }),
} as unknown as LeetCode;
const path = join(directory, "1 - Example.md");
const reviewer = async () => {
  throw new Error("Review must not be requested");
};

test("skipExisting leaves the existing note untouched", async () => {
  const original = "Personal note that must not be overwritten";
  await writeFile(path, original);
  const result = await clipSubmission(leetcode, reviewer, submission, new Map(), {
    skipExisting: true,
  });
  assert.equal(result.skipped, true);
  assert.equal(await readFile(path, "utf8"), original);
});

test("relink reuses the existing review without calling the reviewer", async () => {
  await writeFile(path, "## AI Review\n\nExisting review\n\n## Similar Problems\n\nOld links");
  const result = await clipSubmission(leetcode, reviewer, submission, new Map(), {
    reuseReview: true,
  });
  assert.equal(result.skipped, false);
  const note = await readFile(path, "utf8");
  assert.match(note, /## AI Review\n\nExisting review/);
  assert.doesNotMatch(note, /Old links/);
});
