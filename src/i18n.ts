import { catalogs } from "./locales.generated";

const DEFAULT_LANG = "en" in catalogs ? "en" : Object.keys(catalogs)[0];

function detectLang(): string {
  const nav =
    typeof navigator !== "undefined" ? navigator.language : "";
  const code = nav.toLowerCase().split("-")[0];
  return code in catalogs ? code : DEFAULT_LANG;
}

export const lang: string = detectLang();

if (typeof document !== "undefined") {
  document.documentElement.lang = lang;
}

export function t(key: string): string {
  return catalogs[lang]?.[key] ?? catalogs[DEFAULT_LANG]?.[key] ?? key;
}

export function tFmt(
  key: string,
  params: Record<string, string | number>,
): string {
  let msg = t(key);
  for (const [k, v] of Object.entries(params)) {
    msg = msg.replaceAll(`{${k}}`, String(v));
  }
  return msg;
}
