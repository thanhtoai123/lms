const ALLOWED = () => (process.env.PUBLIC_FORM_ORIGINS ?? "https://satarobo.vn,http://localhost:3000").split(",").map((s) => s.trim());

/** CORS cho API công khai dùng bởi website satarobo.vn */
export function publicCors(origin: string | null, methods = "GET, POST, OPTIONS") {
  const list = ALLOWED();
  const ok = origin && list.includes(origin);
  return { "Access-Control-Allow-Origin": ok ? origin! : list[0]!, "Access-Control-Allow-Methods": methods, "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
}
