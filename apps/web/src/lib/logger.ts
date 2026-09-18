/**
 * Logger của tầng web (route handler, server action, proxy).
 *
 * Dùng chung bộ dựng bản ghi ở `@satarobo/core`: che SĐT / email / CCCD và lược câu SQL
 * kèm giá trị tham số trước khi in. KHÔNG gọi thẳng `console.*` ở bất kỳ đâu trong `apps/web`.
 */
import { createLogger } from "@satarobo/core";

export const webLogger = createLogger("web");
