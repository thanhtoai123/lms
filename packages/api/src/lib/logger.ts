/**
 * Logger dùng chung của tầng máy chủ.
 *
 * MỌI chỗ ghi log trong `packages/api` và `apps/web` phải đi qua đây thay vì `console.*`:
 * bộ dựng bản ghi ở `@satarobo/core` che SĐT / email / CCCD và lược câu SQL kèm tham số
 * trước khi in. Trước bản vá này, một lỗi ghi trùng SĐT ở tầng CSDL là đủ để đẩy
 * "Key (phone)=(0912345678)" vào log máy chủ và từ đó sang dịch vụ log bên thứ ba.
 */
import { createLogger } from "@satarobo/core";

/** Gốc cho toàn tầng máy chủ — dùng `apiLogger.child("<phạm vi>")` cho từng nơi gọi */
export const apiLogger = createLogger("api");

/** Bí danh ngắn cho các service */
export const logger = apiLogger;
