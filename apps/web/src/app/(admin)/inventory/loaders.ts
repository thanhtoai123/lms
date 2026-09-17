import { hasPermission, type Actor } from "@satarobo/core";
import type { getServerCaller } from "@/lib/trpc/server";

type Caller = Awaited<ReturnType<typeof getServerCaller>>["caller"];

/** Phương thức thanh toán cho bán / thuê (chỉ khi có quyền tài chính) */
export async function productMethods(caller: Caller, actor: Actor) {
  if (!hasPermission(actor, "finance:create")) return [];
  try {
    const ms = await caller.finance.methods({ activeOnly: true, forType: "product" });
    return ms.map((m) => ({ id: m.id, label: `${m.name}${m.centerCode ? ` (${m.centerCode})` : ""}`, centerId: m.centerId }));
  } catch {
    return [];
  }
}
