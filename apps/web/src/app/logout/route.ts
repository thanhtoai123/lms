import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function GET() {
  const c = await cookies();
  c.delete("x-dev-actor");
  c.delete("sb-access-token");
  redirect("/login");
}
