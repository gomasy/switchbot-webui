import { createRoot } from "react-dom/client";
import { App } from "./App";
import { init } from "./i18n";
import "./styles.css";

init().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);

  if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
    navigator.serviceWorker.register(new URL("sw.js", import.meta.url));
  }
});
