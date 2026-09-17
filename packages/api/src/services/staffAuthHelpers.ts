export function maskEmail(e: string): string {
  const [l = "", d = ""] = e.split("@");
  return `${l.slice(0, 2)}${"•".repeat(Math.max(1, l.length - 2))}@${d}`;
}
