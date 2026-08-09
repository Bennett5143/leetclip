import "dotenv/config";
import { collectAcceptedSubmissions, createLeetCode, type Submission } from "./leetcode";
import { getReviewer } from "./review";
import { buildNoteIndex, clipSubmission } from "./clip";
import { openInObsidian } from "./opener";

const args = process.argv.slice(2);
const noOpen = args.includes("--no-open");
const backfill = args.includes("--all");
const relink = args.includes("--relink");
const slugArg = args.find((arg) => !arg.startsWith("--"));

const leetcode = await createLeetCode();
const reviewer = getReviewer();

if (backfill || relink) {
  const reuseReview = relink;
  console.log("Collecting all accepted submissions ...");
  let accepted: Submission[];
  try {
    accepted = await collectAcceptedSubmissions(leetcode);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Collecting submissions failed: ${msg}`);
    console.error("This usually means your session cookie is invalid or expired.");
    process.exit(1);
  }
  const noteIndex = await buildNoteIndex();
  console.log(
    `${accepted.length} solved problems found. ` +
      `${reuseReview ? "Rebuilding links" : "Starting backfill"} ...\n`
  );

  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < accepted.length; i++) {
    const sub = accepted[i];
    const progress = `[${i + 1}/${accepted.length}]`;
    try {
      const result = await clipSubmission(leetcode, reviewer, sub, noteIndex, {
        skipExisting: !reuseReview,
        reuseReview,
      });
      if (result.skipped) {
        skipped++;
        console.log(`${progress} ${sub.title} — skipped`);
      } else {
        written++;
        console.log(`${progress} ${sub.title} — ${reuseReview ? "updated" : "saved"}`);
        await new Promise((resolve) => setTimeout(resolve, reuseReview ? 500 : 1000));
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${progress} ${sub.title} — ERROR: ${msg}`);
    }
  }

  console.log(`\nDone. ${written} written, ${skipped} skipped, ${failed} failed.`);
  process.exit(0);
}

let target: Submission | undefined;
try {
  if (slugArg) {
    const subs = await leetcode.submissions({ slug: slugArg, limit: 1 });
    target = subs[0];
  } else {
    const subs = await leetcode.submissions({ limit: 20 });
    target = subs.find((s) => s.statusDisplay === "Accepted");
  }
} catch (err) {
  // leetcode-query throws a TypeError on `submissionList` being null, which is
  // what LeetCode's API returns for unauthenticated requests.
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Fetching submissions failed: ${msg}`);
  console.error("This usually means your session cookie is invalid or expired.");
  process.exit(1);
}

if (!target) {
  console.error(
    slugArg
      ? `No submission found for "${slugArg}". Is the slug correct (lowercase, hyphenated)?`
      : "No accepted submission among your 20 most recent submissions."
  );
  process.exit(1);
}

const noteIndex = await buildNoteIndex();
console.log("Fetching AI review ...");
const { filePath } = await clipSubmission(leetcode, reviewer, target, noteIndex);
console.log(`Note saved: ${filePath}`);

if (!noOpen) {
  await openInObsidian(filePath);
}
