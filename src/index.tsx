import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);

// 開発中は Parcel の HMR と干渉するため本番ビルドのみ登録する
if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  navigator.serviceWorker.register(new URL("sw.js", import.meta.url));
}
