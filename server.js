import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.SWITCHBOT_TOKEN;
const SECRET = process.env.SWITCHBOT_SECRET;
const API_BASE = "https://api.switch-bot.com";

if (!TOKEN || !SECRET) {
  console.error("SWITCHBOT_TOKEN and SWITCHBOT_SECRET must be set in .env");
  process.exit(1);
}

function generateHeaders() {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID();
  const sign = crypto
    .createHmac("sha256", SECRET)
    .update(TOKEN + t + nonce)
    .digest("base64");

  return {
    Authorization: TOKEN,
    sign,
    t,
    nonce,
    "Content-Type": "application/json; charset=utf8",
  };
}

const app = express();
app.use(express.json());

app.use("/api", async (req, res) => {
  const url = `${API_BASE}${req.url}`;
  const headers = generateHeaders();

  try {
    const opts = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      opts.body = JSON.stringify(req.body);
    }

    const apiRes = await fetch(url, opts);
    const data = await apiRes.json();
    res.status(apiRes.status).json(data);
  } catch (e) {
    console.error("Proxy error:", e.message);
    res.status(502).json({ statusCode: 502, message: "Proxy error" });
  }
});

app.use(express.static(path.join(__dirname, "dist")));
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
