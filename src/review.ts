import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { optionalEnv, requireEnv } from "./config";

export type Reviewer = (prompt: string) => Promise<string>;

const MAX_TOKENS = 2048;
const DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_PROMPT_URL = new URL("../prompts/review.md", import.meta.url);

// The client and env vars are resolved lazily, on the first actual review, so
// `--relink` (which reuses existing reviews) never requires the API key.
function anthropicReviewer(model: string): Reviewer {
  let client: Anthropic | undefined;
  return async (prompt) => {
    client ??= new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    return response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim();
  };
}

// Works with any OpenAI-compatible chat-completions endpoint: Ollama,
// LM Studio, OpenRouter, OpenAI, etc. REVIEW_API_KEY is optional for local
// servers that don't require auth.
function openAICompatibleReviewer(model: string): Reviewer {
  return async (prompt) => {
    const baseUrl = requireEnv("REVIEW_BASE_URL").replace(/\/$/, "");
    const apiKey = optionalEnv("REVIEW_API_KEY");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) {
      throw new Error(`Review request failed (${response.status}): ${await response.text()}`);
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return (data.choices?.[0]?.message?.content ?? "").trim();
  };
}

export function getReviewer(): Reviewer {
  const provider = optionalEnv("REVIEW_PROVIDER") ?? "anthropic";
  const model = optionalEnv("REVIEW_MODEL") ?? DEFAULT_MODEL;
  switch (provider) {
    case "anthropic":
      return anthropicReviewer(model);
    case "openai-compatible":
      return openAICompatibleReviewer(model);
    default:
      throw new Error(
        `Unknown REVIEW_PROVIDER "${provider}". Use "anthropic" or "openai-compatible".`
      );
  }
}

// Load the review prompt template and fill in the placeholders. The default
// template lives in prompts/review.md; override it with REVIEW_PROMPT_FILE to
// change the review language or style without touching the code.
export async function buildReviewPrompt(
  language: string,
  description: string,
  code: string
): Promise<string> {
  const override = optionalEnv("REVIEW_PROMPT_FILE");
  const template = await readFile(override ?? DEFAULT_PROMPT_URL, "utf-8");
  return template
    .replaceAll("{{lang}}", language)
    .replaceAll("{{description}}", description)
    .replaceAll("{{code}}", code);
}
