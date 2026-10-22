# TH STEAM LMS — ảnh chạy thật (web + worker dùng chung một ảnh)
# Node 22 + pnpm + Chromium (xuất PDF chứng nhận / biên lai). Dữ liệu cá nhân nằm ở Postgres riêng.
FROM node:22-bookworm-slim

# Chromium cho xuất PDF + phông có tiếng Việt (PDF không mất dấu). tini để dừng gọn gàng.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation fonts-noto-core fonts-noto-cjk ca-certificates tini curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PDF_RENDERER=playwright \
    PDF_CHROME_PATH=/usr/bin/chromium \
    PDF_CHROME_ARGS="--no-sandbox --disable-dev-shm-usage" \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

# Chép cả mã nguồn (đã loại node_modules/.next/.git qua .dockerignore) rồi cài — monorepo nhiều
# workspace (apps/*, packages/*, scripts/*) nên chép đủ trước khi install cho chắc.
COPY . .
RUN pnpm install --frozen-lockfile

# Các biến NEXT_PUBLIC_* được Next NHÚNG vào JS lúc build → phải có mặt lúc build.
# Đổi tên miền / khoá Supabase công khai thì build lại ảnh.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN pnpm build

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
# Mặc định chạy web; worker ghi đè command trong docker-compose
CMD ["pnpm", "--filter", "@satarobo/web", "exec", "next", "start", "-p", "3000"]
