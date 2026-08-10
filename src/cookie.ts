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

// LEETCODE_SESSION is a JWT whose payload carries the session lifetime as
// refreshed_at (epoch seconds) + _session_expiry (seconds, currently 14 days).
// Returns null when the token can't be decoded (unknown format — assume valid).
function sessionExpiry(session: string): Date | null {
  try {
    const payload = session.split(".")[1];
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      refreshed_at?: number;
      _session_expiry?: number;
    };
    if (!data.refreshed_at || !data._session_expiry) return null;
    return new Date((data.refreshed_at + data._session_expiry) * 1000);
  } catch {
    return null;
  }
}

function isExpired(session: string): boolean {
  const expiry = sessionExpiry(session);
  return expiry !== null && expiry.getTime() <= Date.now();
}

// Resolve the LeetCode session cookie. Order: LEETCODE_SESSION env var (works
// on any browser/platform), then Safari auto-read on macOS. An expired env
// cookie is skipped with a warning instead of silently failing downstream.
export async function resolveSession(): Promise<string> {
  const fromEnv = process.env.LEETCODE_SESSION;
  if (fromEnv) {
    const expiry = sessionExpiry(fromEnv);
    if (!isExpired(fromEnv)) return fromEnv;
    console.warn(
      `LEETCODE_SESSION in your environment expired on ${expiry!.toLocaleString()}; ` +
        "ignoring it. Remove it from .env or replace it with a fresh cookie."
    );
  }

  const safariDisabled = process.env.LEETCODE_COOKIE_SAFARI === "0";
  if (process.platform === "darwin" && !safariDisabled) {
    const value = await readSafariSession();
    if (value && !isExpired(value)) return value;
    if (value) {
      throw new Error(
        `The LEETCODE_SESSION cookie in Safari expired on ` +
          `${sessionExpiry(value)!.toLocaleString()}. Log in to leetcode.com again.`
      );
    }
    throw new Error(
      `No LEETCODE_SESSION cookie found in Safari — are you logged in to leetcode.com? ${DOCS_HINT}`
    );
  }

  throw new Error(
    fromEnv
      ? `LEETCODE_SESSION has expired. ${DOCS_HINT}`
      : `LEETCODE_SESSION is missing. ${DOCS_HINT}`
  );
}
