export function getDeviceIcon(deviceType: string | undefined): string {
  if (!deviceType) return "📱";
  const t = deviceType.toLowerCase();
  if (t.includes("bot")) return "🤖";
  if (t.includes("plug")) return "🔌";
  if (
    t.includes("bulb") ||
    t.includes("light") ||
    t.includes("strip") ||
    t.includes("lamp")
  )
    return "💡";
  if (t.includes("curtain") || t.includes("blind") || t.includes("roller"))
    return "🪟";
  if (t.includes("lock")) return "🔒";
  if (t.includes("meter") || t.includes("thermo")) return "🌡️";
  if (t.includes("hub")) return "📡";
  if (t.includes("motion")) return "👁️";
  if (t.includes("contact")) return "🚪";
  if (t.includes("humidifier")) return "💧";
  if (
    t.includes("vacuum") ||
    t.includes("k10") ||
    t.includes("k20") ||
    t.includes("s10") ||
    t.includes("k11")
  )
    return "🧹";
  if (t.includes("purifier")) return "🌬️";
  if (t.includes("fan") || t.includes("circulator")) return "🌀";
  if (t.includes("air conditioner")) return "❄️";
  if (t.includes("tv") || t.includes("dvd") || t.includes("projector"))
    return "📺";
  if (t.includes("camera")) return "📷";
  if (t.includes("keypad")) return "🔢";
  if (t.includes("water")) return "🚿";
  return "📱";
}
