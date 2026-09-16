import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { ForbiddenError, SessionTransitionError, assertAuthorized, type Permission, type ResourceRef } from "@satarobo/core";
import type { Context } from "./context.js";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

/** Chuyển lỗi domain thành mã tRPC chuẩn */
const mapDomainErrors = t.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (e) {
    if (e instanceof ForbiddenError) throw new TRPCError({ code: "FORBIDDEN", message: e.message, cause: e });
    if (e instanceof SessionTransitionError) throw new TRPCError({ code: "PRECONDITION_FAILED", message: e.message, cause: e });
    throw e;
  }
});

export const protectedProcedure = t.procedure.use(mapDomainErrors).use(({ ctx, next }) => {
  if (!ctx.actor || !ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Chưa đăng nhập" });
  return next({ ctx: { ...ctx, actor: ctx.actor, user: ctx.user } });
});

export type ProtectedContext = Context & { actor: NonNullable<Context["actor"]>; user: NonNullable<Context["user"]> };

/** Helper dùng trong service: ném FORBIDDEN nếu không có quyền */
export function requirePermission(ctx: ProtectedContext, perm: Permission, resource?: ResourceRef) {
  assertAuthorized(ctx.actor, perm, resource);
}
