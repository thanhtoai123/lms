import { outbox, type Database } from "@satarobo/db";
import type { DomainEvent } from "@satarobo/core";

/** Ghi domain event vào outbox — gọi trong cùng transaction với nghiệp vụ */
export async function emit(db: Database, event: DomainEvent) {
  const { type, ...payload } = event;
  await db.insert(outbox).values({ type, payload: payload as Record<string, unknown> });
}
