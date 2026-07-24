# SwitchBot WebUI

A web-based control panel using the SwitchBot API v1.1.

## Features

- Device status display and control (power, brightness, color temperature, curtain, lock, etc.)
- IR remote control (air conditioner, TV, light, fan, DVD/speaker/projector)
- Custom button support for "Others" type remotes
- Scene execution
- Room-based device grouping via Hub association
- Internationalization (i18n) — auto-detects browser language; add a JSON file to support a new language
- Dark mode / light mode toggle
- Installable as a PWA (add to home screen)
- Low battery warning on device cards
- Optional access authentication via `AUTH_TOKEN`, with logout
- Realtime status updates over WebSocket (opt-in, via SwitchBot webhook)
- Server-side status caching to stay under the SwitchBot API rate limit

## Setup

### Prerequisites

- Node.js 22+
- Rust 1.86+
- SwitchBot API token and secret (obtain from the [SwitchBot app](https://support.switch-bot.com/hc/en-us/articles/12822710195351))

### Installation

```bash
npm install
cp .env.example .env
```

Set your token and secret in `.env`:

```
SWITCHBOT_TOKEN=your_token
SWITCHBOT_SECRET=your_secret
```

The server listens on port 3000 by default. Set `PORT` to change it.

To require authentication for the UI, set `AUTH_TOKEN` to a long random string.
When set, the web UI prompts for this token on first access and stores a session
cookie for one year. When unset, the UI is accessible without authentication
(a warning is printed at startup). A logout button appears in the header while
authentication is enabled.

### Realtime updates (optional)

By default the UI fetches device status on load and when the tab regains focus.
Set `WEBHOOK_URL` to a publicly reachable URL to receive changes in realtime:

```
WEBHOOK_URL=https://your-host/webhook
```

On startup the server registers this URL with the SwitchBot API (overwriting any
previously configured webhook for the token). SwitchBot then POSTs device state
changes to the URL's path, and the server pushes them to the browser over a
WebSocket at `/ws` — physical operations and changes from other apps appear
immediately without polling. The URL must be reachable from the internet; the
path portion (e.g. `/webhook`) is where the receiver is mounted, so choosing a
hard-to-guess path adds a little protection (SwitchBot webhooks are unsigned).

### Rate limiting

The SwitchBot API allows a limited number of calls per day. To avoid exhausting
it when several device cards or clients are open, status responses are cached
server-side for `STATUS_CACHE_TTL` seconds (default `5`; set to `0` to disable).
Cached entries are dropped immediately when a webhook reports a change.

### Development

```bash
npm run dev
```

Runs the Parcel dev server and Rust backend concurrently. Access at http://localhost:3000.

### Production

```bash
npm run build
npm start
```

### Docker

```bash
docker run -d -p 3000:3000 \
  -e SWITCHBOT_TOKEN=your_token \
  -e SWITCHBOT_SECRET=your_secret \
  -e AUTH_TOKEN=choose_a_long_random_string \
  ghcr.io/gomasy/switchbot-webui
```

Multi-architecture images (amd64 / arm64) are automatically built via GitHub Actions.

## Adding a Language

Drop a JSON file named `<code>.json` (e.g. `fr.json`) into the `locales/` directory
with the same keys as `en.json`. No rebuild required — locale files are served
directly and fetched on demand at runtime. The UI selects the best match from
`navigator.language` at load time and falls back to English.

## Tech Stack

- React 19 / TypeScript
- Parcel 2
- Rust / axum (API proxy with HMAC-SHA256 authentication)

## License

[MIT](LICENSE)
