# leetclip

[![CI](https://github.com/Bennett5143/leetclip/actions/workflows/ci.yml/badge.svg)](https://github.com/Bennett5143/leetclip/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A small CLI that clips your accepted LeetCode submissions into
[Obsidian](https://obsidian.md) notes — problem statement, your solution, an AI
code review, and auto-linked "similar problems".

> A personal tool, shared in case it's useful. It reads your own LeetCode
> submissions via your session cookie and writes Markdown notes into your vault.

## What it does

For a solved problem it writes a note with:

- Frontmatter (difficulty, language, runtime/memory percentiles, topic tags)
- The problem statement (converted from HTML to Markdown)
- Your accepted solution
- An AI code review (idiomaticness, Big-O, refactoring hints)
- Links to similar problems that turn into real notes once you solve them

## Prerequisites

- Node.js 22+
- An [Obsidian](https://obsidian.md) vault (any folder of Markdown files)
- A LeetCode account with at least one accepted submission

## Setup

```bash
npm install
cp .env.example .env   # then fill it in
```

`.env`:

```
LEETCODE_NOTES_DIR=/path/to/your/obsidian/vault/LeetCode
# LEETCODE_SESSION is optional — see Authentication below
ANTHROPIC_API_KEY=sk-ant-...
```

### Authentication

leetclip needs your `LEETCODE_SESSION` cookie. On **macOS with Safari** it reads
it automatically (your terminal needs Full Disk Access); otherwise set
`LEETCODE_SESSION` manually in `.env`. Full details:
[docs/authentication.md](docs/authentication.md).

## Usage

```bash
npm start                 # clip your latest accepted submission and open it
npm start two-sum         # clip a specific problem by slug
npm start -- --all        # backfill every solved problem (skips existing notes)
npm start -- --relink     # rebuild similar-problem links, reuse existing reviews
npm start -- --no-open    # don't open the note in Obsidian afterwards
```

The note is opened in Obsidian via the `obsidian://` URL scheme
(cross-platform: `open` / `start` / `xdg-open`). Use `--no-open` to skip it.

## AI review providers

The review defaults to Anthropic (Claude), but any OpenAI-compatible endpoint
works too — including local models via [Ollama](https://ollama.com) or LM
Studio. Configure via environment variables:

| Variable             | Default             | Notes                                                      |
| -------------------- | ------------------- | ---------------------------------------------------------- |
| `REVIEW_PROVIDER`    | `anthropic`         | `anthropic` or `openai-compatible`                         |
| `REVIEW_MODEL`       | `claude-opus-5`     | Model id for the chosen provider                           |
| `REVIEW_BASE_URL`    | —                   | `openai-compatible` only, e.g. `http://localhost:11434/v1` |
| `REVIEW_API_KEY`     | —                   | `openai-compatible` only; optional for local servers       |
| `REVIEW_PROMPT_FILE` | `prompts/review.md` | Override the review prompt (e.g. to change the language)   |

Example — review with a local Ollama model:

```
REVIEW_PROVIDER=openai-compatible
REVIEW_BASE_URL=http://localhost:11434/v1
REVIEW_MODEL=llama3
```

## Customizing output

Both the review prompt and the note layout are external templates you can edit,
or override with your own via an environment variable:

| Template      | File                                     | Override var         | Placeholders                                                                                                                                                                                                                               |
| ------------- | ---------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Review prompt | [`prompts/review.md`](prompts/review.md) | `REVIEW_PROMPT_FILE` | `{{lang}}`, `{{description}}`, `{{code}}`                                                                                                                                                                                                  |
| Note layout   | [`templates/note.md`](templates/note.md) | `NOTE_TEMPLATE_FILE` | `{{title}}`, `{{number}}`, `{{difficulty}}`, `{{language}}`, `{{description}}`, `{{code}}`, `{{review}}`, `{{url}}`, `{{solved}}`, `{{runtime}}`, `{{runtimePercentile}}`, `{{memory}}`, `{{memoryPercentile}}`, `{{tags}}`, `{{similar}}` |

Edit `prompts/review.md` to change the review's language or style, and
`templates/note.md` to change the frontmatter or note structure.

## License

[MIT](LICENSE)
