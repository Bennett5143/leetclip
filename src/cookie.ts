import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Safari stores cookies in a binary "binarycookies" file inside its protected
// app container. Reading it requires the terminal to have Full Disk Access.
const SAFARI_COOKIE_PATHS = [
  join(homedir(), "Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies"),
  join(homedir(), "Library/Cookies/Cookies.binarycookies"),
];

const DOCS_HINT =
  "Set LEETCODE_SESSION in your .env, or (on macOS with Safari) grant your " +
  "terminal Full Disk Access. See docs/authentication.md.";

// Minimal parser for Apple's binarycookies format. Returns the value of the
// first cookie whose name matches `wantName` and whose URL contains `domain`.
function findCookie(buf: Buffer, wantName: string, domain: string): string | null {
  if (buf.toString("ascii", 0, 4) !== "cook") return null;

  const pageCount = buf.readUInt32BE(4);
  const pageSizes: number[] = [];
  let cursor = 8;
  for (let i = 0; i < pageCount; i++) {
    pageSizes.push(buf.readUInt32BE(cursor));
    cursor += 4;
  }

  for (const size of pageSizes) {
    const page = buf.subarray(cursor, cursor + size);
    cursor += size;

    const cookieCount = page.readUInt32LE(4);
    for (let i = 0; i < cookieCount; i++) {
      const start = page.readUInt32LE(8 + i * 4);
      const urlOffset = page.readUInt32LE(start + 16);
      const nameOffset = page.readUInt32LE(start + 20);
      const valueOffset = page.readUInt32LE(start + 28);

      // Offsets are relative to the cookie's start; strings are null-terminated.
      const readString = (relative: number): string => {
        const from = start + relative;
        let to = from;
        while (to < page.length && page[to] !== 0) to++;
        return page.toString("utf8", from, to);
      };

      if (readString(nameOffset) === wantName && readString(urlOffset).includes(domain)) {
        return readString(valueOffset);
      }
    }
  }
  return null;
}

async function readSafariSession(): Promise<string | null> {
  for (const path of SAFARI_COOKIE_PATHS) {
    let buf: Buffer;
    try {
      buf = await readFile(path);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") continue;
      if (code === "EPERM" || code === "EACCES") {
        throw new Error(
          `Can't read Safari cookies (${path}): permission denied. ` +
            "Grant your terminal Full Disk Access. See docs/authentication.md."
        );
      }
      throw err;
    }
    const value = findCookie(buf, "LEETCODE_SESSION", "leetcode.com");
    if (value) return value;
  }
  return null;
}

// Resolve the LeetCode session cookie. Order: LEETCODE_SESSION env var (works
// on any browser/platform), then Safari auto-read on macOS.
export async function resolveSession(): Promise<string> {
  const fromEnv = process.env.LEETCODE_SESSION;
  if (fromEnv) return fromEnv;

  const safariDisabled = process.env.LEETCODE_COOKIE_SAFARI === "0";
  if (process.platform === "darwin" && !safariDisabled) {
    const value = await readSafariSession();
    if (value) return value;
    throw new Error(`No LEETCODE_SESSION cookie found in Safari. ${DOCS_HINT}`);
  }

  throw new Error(`LEETCODE_SESSION is missing. ${DOCS_HINT}`);
}
