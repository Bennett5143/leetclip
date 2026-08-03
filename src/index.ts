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
  const accepted = await collectAcceptedSubmissions(leetcode);
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
if (slugArg) {
  const subs = await leetcode.submissions({ slug: slugArg, limit: 1 }).catch(() => null);
  target = subs?.[0];
} else {
  const subs = await leetcode.submissions({ limit: 20 }).catch(() => null);
  target = subs?.find((s) => s.statusDisplay === "Accepted");
}

if (!target) {
  console.error(
    slugArg
      ? `No submission found for "${slugArg}". Is the slug correct (lowercase, hyphenated)? Cookie still valid?`
      : "No accepted submission found. Have you solved a problem, and is your cookie valid?"
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
