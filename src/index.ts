import "dotenv/config";
import { LeetCode, Credential, type Submission } from "leetcode-query";
import TurndownService from "turndown";
import Anthropic from "@anthropic-ai/sdk";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} fehlt. Trag den Wert in die .env-Datei ein.`);
    process.exit(1);
  }
  return value;
}

const session = requireEnv("LEETCODE_SESSION");
const notesDir = requireEnv("LEETCODE_NOTES_DIR");
const apiKey = requireEnv("ANTHROPIC_API_KEY");

// Präfix für die Themen-Tags im Frontmatter, z.B. "leetcode/array".
// Leer lassen ("") für Tags ohne Namespace.
const TAG_PREFIX = "leetcode/";

const credential = new Credential();
await credential.init(session);
const leetcode = new LeetCode(credential);
const anthropic = new Anthropic({ apiKey });
const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

const run = promisify(execFile);

function extractReview(content: string): string {
  const afterMarker = content.split("## KI-Review")[1];
  if (!afterMarker) return "";
  return afterMarker.split(/\n## (?:Themen|Ähnliche Aufgaben)/)[0].trim();
}

// Einheitliches Dateinamen-Schema, damit Links und tatsächliche Dateien garantiert übereinstimmen.
function noteBasename(frontendId: string, title: string): string {
  return `${frontendId} - ${title}`.replace(/[/\\:*?"<>|]/g, "");
}

// Index aller vorhandenen Notes: titleSlug -> Dateiname (ohne .md).
// Damit lassen sich ähnliche Aufgaben per echtem Dateinamen verlinken statt per (nicht auflösendem) Alias.
async function buildNoteIndex(): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  const files = await readdir(notesDir).catch(() => [] as string[]);
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const content = await readFile(join(notesDir, file), "utf-8").catch(() => "");
    const match = content.match(/^url: https:\/\/leetcode\.com\/problems\/([^/\s]+)\//m);
    if (match) index.set(match[1], file.replace(/\.md$/, ""));
  }
  return index;
}

async function collectAcceptedSubmissions(): Promise<Submission[]> {
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

// Aus einer Submission eine Notiz bauen.
// noteIndex: titleSlug -> Dateiname, für die Verlinkung ähnlicher Aufgaben.
// skipExisting: vorhandene Dateien überspringen. reuseReview: vorhandenes Review wiederverwenden.
async function clipSubmission(
  submission: Submission,
  noteIndex: Map<string, string>,
  options: { skipExisting?: boolean; reuseReview?: boolean } = {}
): Promise<{ skipped: boolean; filePath: string }> {
  const { skipExisting = false, reuseReview = false } = options;

  const detail = await leetcode.submission(submission.id);
  const slug = detail.question.titleSlug;
  const problem = await leetcode.problem(slug);

  const safeName = noteBasename(problem.questionFrontendId, problem.title);
  const filePath = join(notesDir, `${safeName}.md`);

  const existing = await readFile(filePath, "utf-8").catch(() => null);
  if (skipExisting && existing !== null) {
    return { skipped: true, filePath };
  }

  const description = turndown.turndown(problem.content);
  const solvedDate = new Date(submission.timestamp).toISOString().slice(0, 10);
  const lang = submission.lang;

  // Themen als Obsidian-Tags ins Frontmatter (statt als Sektion am Ende).
  // t.slug ist bereits tag-sicher (klein, mit Bindestrichen), z.B. "hash-table".
  const tagLines = problem.topicTags.map((t) => `  - ${TAG_PREFIX}${t.slug}`).join("\n");
  const tagsBlock = tagLines ? `\ntags:\n${tagLines}` : "";

  // Ähnliche Aufgaben immer per künftigem Dateinamen [[NNN - Titel]] verlinken.
  // So wird der Link automatisch grün, sobald die Aufgabe (irgendwann) gelöst wird –
  // ohne dass diese Notiz je erneut angefasst werden muss.
  type SimilarQuestion = { title: string; titleSlug: string };
  const similarLinks: string[] = [];
  try {
    for (const q of JSON.parse(problem.similarQuestions) as SimilarQuestion[]) {
      let basename = noteIndex.get(q.titleSlug);
      if (!basename) {
        // Nummer der noch nicht geclippten Aufgabe einmalig nachschlagen und cachen
        const p = await leetcode.problem(q.titleSlug).catch(() => null);
        if (p) {
          basename = noteBasename(p.questionFrontendId, p.title);
          noteIndex.set(q.titleSlug, basename);
          await sleep(200);
        }
      }
      similarLinks.push(`- [[${basename ?? q.title}]]`);
    }
  } catch {
    // similarQuestions leer oder ungültig
  }
  const similarSection = similarLinks.length
    ? `\n\n## Ähnliche Aufgaben\n\n${similarLinks.join("\n")}`
    : "";

  let review = "";
  if (reuseReview && existing !== null) {
    review = extractReview(existing);
  }
  if (!review) {
    const reviewPrompt = `Du bist ein erfahrener Code-Reviewer. Unten stehen eine LeetCode-Aufgabe und meine Lösung in ${lang}.

Gib mir ein kurzes, konkretes Review auf Deutsch in Markdown:
- Wie idiomatisch und sauber ist die Lösung?
- Zeit- und Speicherkomplexität (Big-O).
- Konkrete Verbesserungs- oder Refactoring-Vorschläge, falls sinnvoll.

## Aufgabe
${description}

## Meine Lösung
\`\`\`${lang}
${detail.code}
\`\`\``;

    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      messages: [{ role: "user", content: reviewPrompt }],
    });
    review = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim();
  }

  const note = `---
type: leetcode${tagsBlock}
aliases:
  - "${problem.title}"
number: ${problem.questionFrontendId}
difficulty: ${problem.difficulty}
language: ${lang}
runtime: ${detail.runtimeDisplay}
runtime_percentile: ${detail.runtimePercentile.toFixed(1)}
memory: ${detail.memoryDisplay}
memory_percentile: ${detail.memoryPercentile.toFixed(1)}
url: https://leetcode.com/problems/${slug}/
solved: ${solvedDate}
related: [[_LeetCode]]
---

# #${problem.questionFrontendId} — ${problem.title}

## Aufgabenstellung

${description}

## Meine Lösung

\`\`\`${lang}
${detail.code}
\`\`\`

## KI-Review

${review}${similarSection}
`;

  await mkdir(notesDir, { recursive: true });
  await writeFile(filePath, note, "utf-8");
  noteIndex.set(slug, safeName); // frisch geschriebene Note sofort im Index verfügbar machen
  return { skipped: false, filePath };
}

const slugArg = process.argv[2];

if (slugArg === "--all" || slugArg === "--relink") {
  const reuseReview = slugArg === "--relink";
  console.log("Sammle alle akzeptierten Abgaben ...");
  const accepted = await collectAcceptedSubmissions();
  const noteIndex = await buildNoteIndex();
  console.log(
    `${accepted.length} gelöste Aufgaben gefunden. ` +
      `${reuseReview ? "Rüste Verknüpfungen nach" : "Starte Backfill"} ...\n`
  );

  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < accepted.length; i++) {
    const sub = accepted[i];
    const progress = `[${i + 1}/${accepted.length}]`;
    try {
      const result = await clipSubmission(sub, noteIndex, { skipExisting: !reuseReview, reuseReview });
      if (result.skipped) {
        skipped++;
        console.log(`${progress} ${sub.title} — übersprungen`);
      } else {
        written++;
        console.log(`${progress} ${sub.title} — ${reuseReview ? "aktualisiert" : "gespeichert"}`);
        await sleep(reuseReview ? 500 : 1000);
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${progress} ${sub.title} — FEHLER: ${msg}`);
    }
  }

  console.log(`\nFertig. ${written} geschrieben, ${skipped} übersprungen, ${failed} fehlgeschlagen.`);
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
      ? `Keine Submission für "${slugArg}" gefunden. Slug korrekt (klein, mit Bindestrichen)? Cookie gültig?`
      : "Keine akzeptierte Submission gefunden. Schon eine Aufgabe gelöst, und ist dein Cookie gültig?"
  );
  process.exit(1);
}

const noteIndex = await buildNoteIndex();
console.log("Hole KI-Review von Opus ...");
const { filePath } = await clipSubmission(target, noteIndex);
console.log(`Notiz gespeichert: ${filePath}`);

await run("open", [`obsidian://open?path=${encodeURIComponent(filePath)}`]);