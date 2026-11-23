import assert from "node:assert/strict";
import { test } from "node:test";
import { renderNote, type NoteData } from "./note";

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

test("renders Go fences while preserving the LeetCode language metadata", async () => {
  const note = await renderNote(data);
  assert.match(note, /^language: golang$/m);
  assert.match(note, /```go\nfunc main\(\) \{\}\n```/);
});

test("leaves other language fences unchanged", async () => {
  const note = await renderNote({ ...data, language: "python3" });
  assert.match(note, /```python3\n/);
});
