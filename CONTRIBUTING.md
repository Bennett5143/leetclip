# Contributing

Thanks for your interest! leetclip is a small personal tool, but issues and
pull requests are welcome.

## Development setup

```bash
npm install
cp .env.example .env   # fill in LEETCODE_NOTES_DIR etc.
```

Requires Node.js 22+.

## Before opening a pull request

- `npm test` and `npm run typecheck` pass
- `npm run format` (Prettier) leaves no changes
- Keep changes focused; describe the "why" in the PR

CI runs tests, typecheck and format check on Node 22 and 24, and `main` requires a green
build. Merges are squash-only.

## Reporting bugs

Open an issue with what you ran, what you expected, and what happened. Never
paste your `LEETCODE_SESSION` cookie or API keys into an issue.
