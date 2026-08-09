# SwitchBot WebUI

A web-based control panel using the SwitchBot API v1.1.

## Features

- Status display and control for every device family the SwitchBot API
  documents — lights, curtains, blinds, locks, plugs and relays, robot vacuums,
  humidifiers, air purifiers, fans, thermostats, garage door openers, cameras
  and sensors
- IR remote control (air conditioner, TV, light, fan, DVD/speaker/projector),
  including custom buttons for "Others" type remotes
- Scene execution
- Room-based device grouping via Hub association
- Realtime status updates over WebSocket (opt-in, via SwitchBot webhook)
- Server-side status caching to stay under the SwitchBot API rate limit
- Optional access authentication via `AUTH_TOKEN`
- Internationalization, dark mode, PWA install, low battery warnings

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

### Authentication (optional)

Set `AUTH_TOKEN` to a long random string to require a login. The UI then prompts
for the token and stores a session cookie valid for 30 days, and a logout button
appears in the header. When unset, the UI is open to anyone who can reach it
(reported at startup).

Sessions live in memory, so logging out revokes that session everywhere and
restarting the server logs everyone out. Failed logins are handled one at a time
with a delay that doubles per failure (up to 30s), so guesses cannot be
parallelized.

The session cookie is always `HttpOnly`, and is marked `Secure` when the request
arrived over HTTPS — read from `Origin`, falling back to `X-Forwarded-Proto`.
Behind a TLS-terminating proxy, forward that header (nginx:
`proxy_set_header X-Forwarded-Proto $scheme;`); without it a request that
carries no `Origin` looks like plain HTTP, and the cookie is left unmarked.

Commands are refused when the browser reports the request as cross-site, whether
or not `AUTH_TOKEN` is set. The check reads `Sec-Fetch-Site`, falling back to
comparing `Origin` against `Host`. Behind a reverse proxy, forward the original
`Host` header (nginx: `proxy_set_header Host $host;`) — rewriting it can make
that fallback reject legitimate commands with a 403.

### Realtime updates (optional)

By default the UI fetches device status on load and when the tab regains focus.
Set `WEBHOOK_URL` to a publicly reachable URL to receive changes in realtime:

```
WEBHOOK_URL=https://your-host/webhook
```

On startup the server registers this URL with the SwitchBot API, overwriting any
webhook previously configured for the token. SwitchBot then POSTs device state
changes to the URL's path, and the server pushes them to the browser over a
WebSocket at `/ws` — physical operations and changes from other apps appear
immediately without polling. SwitchBot webhooks are unsigned, so a hard-to-guess
path adds a little protection.

### Rate limiting

The SwitchBot API allows a limited number of calls per day. To avoid exhausting
it when several device cards or clients are open, status responses are cached
server-side for `STATUS_CACHE_TTL` seconds (default `5`; set to `0` to disable).
Cached entries are dropped immediately when a webhook reports a change.
Concurrent readers of the same device queue behind one upstream call rather than
each making their own, so a cold cache costs a single request per device.

### Development

```bash
npm run dev
```

Runs the Parcel dev server and Rust backend concurrently. Access at http://localhost:3000.

The frontend lives in `src/`, the axum proxy in `backend/`; `locales/` is served
as-is at runtime.

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

Multi-architecture images (amd64 / arm64) are built via GitHub Actions.

## Adding a Language

Drop a JSON file named `<code>.json` (e.g. `fr.json`) into `locales/` with the
same keys as `en.json`. No rebuild required — locale files are served directly
and fetched on demand. The UI picks the best match for `navigator.language` at
load time and falls back to English.

## Tech Stack

- React 19 / TypeScript
- Parcel 2
- Rust / axum (API proxy with HMAC-SHA256 authentication)

## License

[MIT](LICENSE)
