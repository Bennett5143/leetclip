# Authentication

leetclip talks to LeetCode using your `LEETCODE_SESSION` cookie. There are two
ways to provide it.

## Automatic (macOS + Safari)

If you use Safari on macOS, leetclip reads the cookie for you — no `.env` entry
needed.

This requires your terminal to have **Full Disk Access**, because Safari stores
its cookies in `Cookies.binarycookies` inside a protected app container that is
otherwise unreadable.

1. Open **System Settings → Privacy & Security → Full Disk Access**.
2. Enable it for your terminal app (Ghostty, Terminal, iTerm, …).
3. Restart the terminal.

To force the manual path even on macOS, set `LEETCODE_COOKIE_SAFARI=0`.

> Most third-party cookie-extraction libraries (e.g. `browser_cookie3`) support
> Chrome and Firefox but not Safari, which is why leetclip ships its own small
> Safari reader. On any other browser or platform, use the manual method below.

## Manual (any browser / platform)

Copy the cookie value into your `.env` file:

```
LEETCODE_SESSION=<your cookie value>
```

Get the value from your browser's dev tools while logged in at
[leetcode.com](https://leetcode.com):

- **Chrome / Edge:** DevTools → Application → Cookies → `https://leetcode.com` →
  copy the `LEETCODE_SESSION` value.
- **Firefox:** DevTools → Storage → Cookies → `https://leetcode.com`.
- **Safari:** enable the Web Inspector first (Settings → Advanced → "Show
  features for web developers"), then Develop → Show Web Inspector → Storage →
  Cookies.

The `LEETCODE_SESSION` cookie is a session token — treat it like a password and
never commit it. `.env` is gitignored.
