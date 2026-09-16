"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";
import type { AppRouter } from "@satarobo/api";

export const { TRPCProvider: TRPCContextProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
      mutations: { retry: 0 },
    },
  });
}

let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          async headers() {
            const h: Record<string, string> = {};
            // Supabase session token (nếu đã đăng nhập); dev bypass dùng cookie x-dev-actor
            try {
              const raw = document.cookie.split("; ").find((c) => c.startsWith("sb-access-token="))?.split("=")[1];
              if (raw) h.authorization = `Bearer ${decodeURIComponent(raw)}`;
              const dev = document.cookie.split("; ").find((c) => c.startsWith("x-dev-actor="))?.split("=")[1];
              if (dev) h["x-dev-actor"] = decodeURIComponent(dev);
            } catch {}
            return h;
          },
        }),
      ],
    }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCContextProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCContextProvider>
    </QueryClientProvider>
  );
}
