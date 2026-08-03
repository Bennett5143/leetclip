import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { NOTES_DIR, TAG_PREFIX, optionalEnv } from "./config";

const HEADING_SIMILAR = "## Similar Problems";
const DEFAULT_TEMPLATE_URL = new URL("../templates/note.md", import.meta.url);

// Extract the review section from an existing note. Matches both the current
// English headings and the older German ones, so `--relink` reuses reviews
// written before the English migration instead of regenerating them.
export function extractReview(content: string): string {
  const afterMarker = content.split(/## (?:AI Review|KI-Review)/)[1];
  if (!afterMarker) return "";
  return afterMarker.split(/\n## (?:Similar Problems|Ähnliche Aufgaben|Themen)/)[0].trim();
}

// Consistent filename scheme so links and actual files always match.
export function noteBasename(frontendId: string, title: string): string {
  return `${frontendId} - ${title}`.replace(/[/\\:*?"<>|]/g, "");
}

// Index of all existing notes: titleSlug -> filename (without .md).
// Lets us link similar problems by their real filename instead of a
// non-resolving alias.
export async function buildNoteIndex(): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  const files = await readdir(NOTES_DIR).catch(() => [] as string[]);
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const content = await readFile(join(NOTES_DIR, file), "utf-8").catch(() => "");
    const match = content.match(/^url: https:\/\/leetcode\.com\/problems\/([^/\s]+)\//m);
    if (match) index.set(match[1], file.replace(/\.md$/, ""));
  }
  return index;
}

export interface NoteData {
  frontendId: string;
  title: string;
  difficulty: string;
  language: string;
  runtimeDisplay: string;
  runtimePercentile: number;
  memoryDisplay: string;
  memoryPercentile: number;
  slug: string;
  solvedDate: string;
  topicSlugs: string[];
  similarBasenames: string[];
  description: string;
  code: string;
  review: string;
}

// Render a note from the template. The layout and frontmatter live in
// templates/note.md (override via NOTE_TEMPLATE_FILE) so they can be customized
// without touching the code. Placeholders are {{key}}; the tags and similar
// blocks are rendered here because they're conditional/list-based.
export async function renderNote(data: NoteData): Promise<string> {
  const template = await readFile(
    optionalEnv("NOTE_TEMPLATE_FILE") ?? DEFAULT_TEMPLATE_URL,
    "utf-8"
  );

  // Topics go into the frontmatter as Obsidian tags (rather than a section at
  // the end). Slugs are already tag-safe (lowercase, hyphenated), e.g.
  // "hash-table".
  const tagLines = data.topicSlugs.map((slug) => `  - ${TAG_PREFIX}${slug}`).join("\n");
  const tagsBlock = tagLines ? `\ntags:\n${tagLines}` : "";

  const similarBlock = data.similarBasenames.length
    ? `\n\n${HEADING_SIMILAR}\n\n${data.similarBasenames.map((b) => `- [[${b}]]`).join("\n")}`
    : "";

  const values: Record<string, string> = {
    tags: tagsBlock,
    title: data.title,
    number: data.frontendId,
    difficulty: data.difficulty,
    language: data.language,
    runtime: data.runtimeDisplay,
    runtimePercentile: data.runtimePercentile.toFixed(1),
    memory: data.memoryDisplay,
    memoryPercentile: data.memoryPercentile.toFixed(1),
    url: `https://leetcode.com/problems/${data.slug}/`,
    solved: data.solvedDate,
    description: data.description,
    code: data.code,
    review: data.review,
    similar: similarBlock,
  };

  // Single pass so substituted content (which may itself contain "{{...}}") is
  // never re-processed. Unknown placeholders are left untouched.
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}
