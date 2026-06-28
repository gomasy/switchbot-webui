# SwitchBot WebUI

A web-based control panel using the SwitchBot API v1.1.

## Features

- Device status display and control (power, brightness, color temperature, curtain, lock, etc.)
- IR remote control (air conditioner, TV, light, fan, DVD/speaker/projector)
- Custom button support for "Others" type remotes
- Scene execution
- Room-based device grouping via Hub association

## Setup

### Prerequisites

- Node.js 20+
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

### Development

```bash
npm run dev
```

Access at http://localhost:3000.

### Production

```bash
npm run build
npm start
```

## Tech Stack

- React 19 / TypeScript
- Parcel 2
- Express 5 (API proxy with HMAC-SHA256 authentication)

## License

[MIT](LICENSE)
