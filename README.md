# SwitchBot WebUI

A web-based control panel using the SwitchBot API v1.1.

## Features

- Device status display and control (power, brightness, color temperature, curtain, lock, etc.)
- IR remote control (air conditioner, TV, light, fan, DVD/speaker/projector)
- Custom button support for "Others" type remotes
- Scene execution
- Room-based device grouping via Hub association
- Dark mode / light mode toggle

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
  ghcr.io/gomasy/switchbot-webui
```

Multi-architecture images (amd64 / arm64) are automatically built via GitHub Actions.

## Tech Stack

- React 19 / TypeScript
- Parcel 2
- Rust / axum (API proxy with HMAC-SHA256 authentication)

## License

[MIT](LICENSE)
