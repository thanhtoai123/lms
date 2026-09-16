import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@satarobo/api";

export type RouterOutputs = inferRouterOutputs<AppRouter>;
