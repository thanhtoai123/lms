import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import {
  ForbiddenError, SessionTransitionError, assertAuthorized, clientSafeMessage,
  shouldLogSlow, slowProcedureLog, slowThresholdFromEnv, tenantChanGhi,
  type Permission, type ResourceRef,
} from "@satarobo/core";
import { sql } from "drizzle-orm";
import { countQueries, tenantSessionSql } from "@satarobo/db";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const zod = error.cause instanceof ZodError ? error.cause : null;
    /**
     * Thông báo gửi về MÁY KHÁCH không được kèm câu SQL hay tên bảng / cột.
     * `postgres-js` ném lỗi với `message` kiểu `column "parents"."citizen_id" does not exist`
     * hoặc `duplicate key … (phone)=(0912345678)`; tRPC mặc định chuyển thẳng `message` ra ngoài,
     * nên một lỗi lập trình là đủ để vẽ lại lược đồ CSDL hoặc lộ SĐT khách.
     * `clientSafeMessage` giữ nguyên câu nghiệp vụ tiếng Việt và thay mọi thứ khác bằng câu chung.
     * (Tiền lệ: `packages/db/src/health.ts` đã làm đúng như vậy cho lỗi mất kết nối.)
     */
    const message = zod
      ? [...new Set(zod.issues.map((i) => i.message))].join("; ")
      : error.code === "INTERNAL_SERVER_ERROR"
        ? clientSafeMessage(error.cause ?? error)
        : clientSafeMessage(error, shape.message);
    return {
      ...shape,
      message,
      data: {
        ...shape.data,
        // `stack` mặc định chỉ có ở môi trường phát triển; ghi đè cho chắc, nó lộ đường dẫn máy chủ
        stack: undefined,
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

/**
 * LỚP PHÒNG THỦ THỨ HAI — Row Level Security của Postgres (xem packages/db/sql/0009, 0018).
 *
 * Bật bằng `DB_RLS=on`. Mỗi lượt gọi đã đăng nhập chạy trong MỘT giao dịch: đổi sang vai trò
 * `satarobo_app` (không phải chủ bảng → chính sách RLS có hiệu lực) và đặt `app.tenant_ids` là các
 * trung tâm người này được thấy. Khi đó một truy vấn quên `tenantCond` cũng không đọc được dòng
 * của trung tâm khác — CSDL trả về rỗng.
 *
 * `set local` / `set_config(..., true)` chỉ sống trong giao dịch, nên pool dùng chung kết nối
 * không bao giờ rò phạm vi của người này sang lượt gọi của người khác.
 *
 * tRPC trả lỗi dạng `{ ok: false }` thay vì ném, nên phải ném lại để giao dịch ROLLBACK —
 * không thì một thủ tục ghi nửa chừng rồi báo lỗi vẫn được commit.
 */
export function rlsBat(env: Record<string, string | undefined> = process.env): boolean {
  return ["on", "1", "true"].includes((env.DB_RLS ?? "").trim().toLowerCase());
}

const rlsSession = t.middleware(async ({ ctx, next }) => {
  if (!rlsBat() || !ctx.actor) return next();
  return ctx.db.transaction(async (tx) => {
    await tx.execute(sql`set local role satarobo_app`);
    await tx.execute(tenantSessionSql({ tenantIds: ctx.tenantIds ?? [] }));
    const r = await next({ ctx: { ...ctx, db: tx as unknown as typeof ctx.db } });
    if (!r.ok) throw r.error;
    return r;
  });
});

export const protectedProcedure = t.procedure.use(measure).use(mapDomainErrors).use(({ ctx, next, path, type }) => {
  if (!ctx.actor || !ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Chưa đăng nhập" });
  if (ctx.auth?.mfa.required && !ctx.auth.mfa.satisfied && !path.startsWith("auth.")) throw new TRPCError({ code: "FORBIDDEN", message: "Cần xác thực 2 lớp (vào Bảo mật tài khoản)" });
  // Trung tâm tạm ngừng / đã đóng: đọc được, không ghi được — kể cả quản trị của chính trung tâm đó.
  // Mở lại là việc của Hội sở (tenants.updateSettings, xem canChangeStatus), mà người Hội sở thuộc
  // trung tâm đang hoạt động nên không bị chặn ở đây.
  if (type === "mutation") {
    const status = ctx.tenants?.find((x) => x.id === ctx.tenantId)?.status;
    const chan = tenantChanGhi(status as Parameters<typeof tenantChanGhi>[0], path);
    if (chan) throw new TRPCError({ code: "FORBIDDEN", message: chan });
  }
  return next({ ctx: { ...ctx, actor: ctx.actor, user: ctx.user } });
}).use(rlsSession);

export type ProtectedContext = Context & { actor: NonNullable<Context["actor"]>; user: NonNullable<Context["user"]> };

/** Helper dùng trong service: ném FORBIDDEN nếu không có quyền */
export function requirePermission(ctx: ProtectedContext, perm: Permission, resource?: ResourceRef) {
  assertAuthorized(ctx.actor, perm, resource);
}
