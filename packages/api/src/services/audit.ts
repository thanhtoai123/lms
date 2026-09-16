import { auditLog, type Database } from "@satarobo/db";

export interface AuditInput {
  actorId: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "TRANSITION" | "PII_REVEAL";
  module: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string;
}

/** Ghi audit trong cùng transaction với nghiệp vụ (truyền tx vào) */
export async function writeAudit(db: Database, input: AuditInput) {
  await db.insert(auditLog).values({
    actorId: input.actorId,
    action: input.action,
    module: input.module,
    entity: input.entity,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason ?? null,
    ip: input.ip ?? null,
  });
}
