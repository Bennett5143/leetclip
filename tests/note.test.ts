import assert from "node:assert/strict";
import { test } from "node:test";
import type { NoteData } from "../src/note";

process.env.LEETCODE_NOTES_DIR = "/unused";
const { renderNote, extractReview } = await import("../src/note");

const data: NoteData = {
  frontendId: "1",
  title: "Example",
  difficulty: "Easy",
  language: "golang",
  runtimeDisplay: "1 ms",
  runtimePercentile: 50,
  memoryDisplay: "1 MB",
  memoryPercentile: 50,
  slug: "example",
  solvedDate: "2026-01-01",
  topicSlugs: [],
  similarBasenames: [],
  description: "Example problem",
  code: "func main() {}",
  review: "Review",
};

test("extracts English and legacy German reviews without following sections", () => {
  for (const [heading, next] of [
    ["AI Review", "Similar Problems"],
    ["KI-Review", "Ähnliche Aufgaben"],
    ["KI-Review", "Themen"],
  ]) {
    assert.equal(
      extractReview(`## ${heading}\n\nKeep this review\n\n## ${next}\n\nExclude this`),
      "Keep this review"
    );
  }
  assert.equal(extractReview("## Problem\nNo review here"), "");
});

test("renders Go fences while preserving the LeetCode language metadata", async () => {
  const note = await renderNote(data);
  assert.match(note, /^language: golang$/m);
  assert.match(note, /```go\nfunc main\(\) \{\}\n```/);
});
