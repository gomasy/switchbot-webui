import { createRoot } from "react-dom/client";
import { App } from "./App";
import { init } from "./i18n";
import "./styles.css";

// Render even if the locale files could not be fetched: t() falls back to the
// key, which is far better than the blank page an unhandled rejection leaves.
init()
  .catch((e) => console.error("i18n init failed:", e))
  .then(() => {
    const root = document.getElementById("root");
    if (!root) throw new Error("index.html is missing the #root element");
    createRoot(root).render(<App />);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register(new URL("sw.js", import.meta.url));
    }
  });
