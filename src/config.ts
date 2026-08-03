export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is missing. Add it to your .env file.`);
    process.exit(1);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value ? value : undefined;
}

export const NOTES_DIR = requireEnv("LEETCODE_NOTES_DIR");

// Prefix for the topic tags in the frontmatter, e.g. "leetcode/array".
// Leave empty ("") for tags without a namespace.
export const TAG_PREFIX = "leetcode/";
