import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);

// Only register the service worker in production to avoid conflicts with Parcel HMR
if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  navigator.serviceWorker.register(new URL("sw.js", import.meta.url));
}
