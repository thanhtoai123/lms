import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import {
  ForbiddenError, SessionTransitionError, assertAuthorized,
  shouldLogSlow, slowProcedureLog, slowThresholdFromEnv,
  type Permission, type ResourceRef,
} from "@satarobo/core";
import { countQueries } from "@satarobo/db";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const zod = error.cause instanceof ZodError ? error.cause : null;
    return {
      ...shape,
      // Thông báo dễ đọc cho người dùng thay vì JSON thô của zod
      message: zod ? [...new Set(zod.issues.map((i) => i.message))].join("; ") : shape.message,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Chuyển lỗi domain thành mã tRPC chuẩn */
const mapDomainErrors = t.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (e) {
    // So sánh theo name vì @satarobo/core có thể được nạp 2 lần (src qua Turbopack + dist) → instanceof không đáng tin
    const name = (e as { name?: string })?.name;
    if (e instanceof ForbiddenError || name === "ForbiddenError" || name === "TenantIsolationError") throw new TRPCError({ code: "FORBIDDEN", message: (e as Error).message, cause: e as Error });
    if (e instanceof SessionTransitionError || name === "SessionTransitionError" || name === "LeadTransitionError" || name === "EnrollmentTransitionError" || name === "MakeupTransitionError" || name === "ReportCardTransitionError" || name === "TrialTransitionError" || name === "FinanceRuleError" || name === "ClassTransitionError" || name === "HrRuleError" || name === "StudentLifecycleError") throw new TRPCError({ code: "PRECONDITION_FAILED", message: (e as Error).message, cause: e as Error });
    throw e;
  }
});

/**
 * Đo thời lượng mọi thủ tục; chỉ GHI LOG thủ tục chậm hơn ngưỡng (mặc định 1000 ms,
 * đổi bằng `SLOW_PROCEDURE_MS`; đặt 0 để ghi tất khi cần soi).
 *
 * Dòng log chỉ có: tên thủ tục + số mili giây + số truy vấn CSDL. KHÔNG tham số đầu vào,
 * KHÔNG id, KHÔNG tên người / SĐT — log thường chảy ra tệp hoặc dịch vụ ngoài.
 * Số truy vấn là thứ phân biệt "một truy vấn nặng" với "N+1": xem `packages/db/src/metrics.ts`.
 */
const measure = t.middleware(async ({ next, path }) => {
  const threshold = slowThresholdFromEnv(process.env.SLOW_PROCEDURE_MS);
  const started = performance.now();
  const { result, queries } = await countQueries(() => next());
  const durationMs = performance.now() - started;
  if (shouldLogSlow(durationMs, threshold)) {
    console.warn(slowProcedureLog({ path, durationMs, queries, ok: result.ok }));
  }
  return result;
});

/** Thủ tục công khai (đăng nhập, OTP, form web) — cũng được đo */
export const publicProcedure = t.procedure.use(measure);

export const protectedProcedure = t.procedure.use(measure).use(mapDomainErrors).use(({ ctx, next, path }) => {
  if (!ctx.actor || !ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Chưa đăng nhập" });
  if (ctx.auth?.mfa.required && !ctx.auth.mfa.satisfied && !path.startsWith("auth.")) throw new TRPCError({ code: "FORBIDDEN", message: "Cần xác thực 2 lớp (vào Bảo mật tài khoản)" });
  return next({ ctx: { ...ctx, actor: ctx.actor, user: ctx.user } });
});

export type ProtectedContext = Context & { actor: NonNullable<Context["actor"]>; user: NonNullable<Context["user"]> };

/** Helper dùng trong service: ném FORBIDDEN nếu không có quyền */
export function requirePermission(ctx: ProtectedContext, perm: Permission, resource?: ResourceRef) {
  assertAuthorized(ctx.actor, perm, resource);
}
