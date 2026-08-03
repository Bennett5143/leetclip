import type { LeetCode } from "leetcode-query";
import TurndownService from "turndown";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { NOTES_DIR } from "./config";
import type { Submission } from "./leetcode";
import { buildReviewPrompt, type Reviewer } from "./review";
import { buildNoteIndex, extractReview, noteBasename, renderNote, type NoteData } from "./note";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

export { buildNoteIndex };

interface ClipOptions {
  skipExisting?: boolean;
  reuseReview?: boolean;
}

type SimilarQuestion = { title: string; titleSlug: string };

// Resolve the linked "similar" problems to their (future) note filenames, so
// [[NNN - Title]] links turn green automatically once a problem is solved,
// without ever touching this note again.
async function resolveSimilarLinks(
  leetcode: LeetCode,
  similarQuestions: string,
  noteIndex: Map<string, string>
): Promise<string[]> {
  const links: string[] = [];
  try {
    for (const q of JSON.parse(similarQuestions) as SimilarQuestion[]) {
      let basename = noteIndex.get(q.titleSlug);
      if (!basename) {
        // Look up the number of the not-yet-clipped problem once and cache it.
        const p = await leetcode.problem(q.titleSlug).catch(() => null);
        if (p) {
          basename = noteBasename(p.questionFrontendId, p.title);
          noteIndex.set(q.titleSlug, basename);
          await sleep(200);
        }
      }
      links.push(basename ?? q.title);
    }
  } catch {
    // similarQuestions empty or invalid
  }
  return links;
}

// Build a note from a submission.
// noteIndex: titleSlug -> filename, for linking similar problems.
// skipExisting: skip files that already exist. reuseReview: reuse an existing review.
export async function clipSubmission(
  leetcode: LeetCode,
  reviewer: Reviewer,
  submission: Submission,
  noteIndex: Map<string, string>,
  options: ClipOptions = {}
): Promise<{ skipped: boolean; filePath: string }> {
  const { skipExisting = false, reuseReview = false } = options;

  const detail = await leetcode.submission(submission.id);
  const slug = detail.question.titleSlug;
  const problem = await leetcode.problem(slug);

  const safeName = noteBasename(problem.questionFrontendId, problem.title);
  const filePath = join(NOTES_DIR, `${safeName}.md`);

  const existing = await readFile(filePath, "utf-8").catch(() => null);
  if (skipExisting && existing !== null) {
    return { skipped: true, filePath };
  }

  const description = turndown.turndown(problem.content);
  const solvedDate = new Date(submission.timestamp).toISOString().slice(0, 10);
  const language = submission.lang;

  const similarBasenames = await resolveSimilarLinks(leetcode, problem.similarQuestions, noteIndex);

  let review = "";
  if (reuseReview && existing !== null) {
    review = extractReview(existing);
  }
  if (!review) {
    const prompt = await buildReviewPrompt(language, description, detail.code);
    review = await reviewer(prompt);
  }

  const data: NoteData = {
    frontendId: problem.questionFrontendId,
    title: problem.title,
    difficulty: problem.difficulty,
    language,
    runtimeDisplay: detail.runtimeDisplay,
    runtimePercentile: detail.runtimePercentile,
    memoryDisplay: detail.memoryDisplay,
    memoryPercentile: detail.memoryPercentile,
    slug,
    solvedDate,
    topicSlugs: problem.topicTags.map((t) => t.slug),
    similarBasenames,
    description,
    code: detail.code,
    review,
  };

  await mkdir(NOTES_DIR, { recursive: true });
  await writeFile(filePath, renderNote(data), "utf-8");
  noteIndex.set(slug, safeName); // make the freshly written note available in the index
  return { skipped: false, filePath };
}
