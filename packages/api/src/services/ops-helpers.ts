import { envChecks, envSummary, backupFreshness, heartbeatState, fmtBytes } from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";

export { envChecks, envSummary, backupFreshness, heartbeatState, fmtBytes };
export function requirePermissionCheck(ctx: ProtectedContext) {
  requirePermission(ctx, "system:read");
}
