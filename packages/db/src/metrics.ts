/**
 * Đếm số truy vấn CSDL của MỘT lượt gọi (một thủ tục tRPC, một nhịp worker).
 *
 * Vì sao cần: "trang chủ chậm" không nói được gì. "inbox.today 2.400 ms / 96 truy vấn" thì
 * chỉ thẳng vào N+1. Bộ đếm này là thứ biến một lời phàn nàn thành một con số kiểm chứng được.
 *
 * Cách làm: drizzle gọi `logger.logQuery` cho MỌI câu lệnh; ta chỉ tăng bộ đếm đang nằm trong
 * `AsyncLocalStorage` của lượt gọi hiện tại — không ghi câu SQL, không ghi tham số, nên
 * KHÔNG có đường nào để dữ liệu cá nhân lọt vào đây.
 */
import { AsyncLocalStorage } from "node:async_hooks";

interface Counter { n: number }

const store = new AsyncLocalStorage<Counter>();

/** Tăng bộ đếm của lượt gọi hiện tại (không có lượt nào đang đếm thì bỏ qua) */
export function bumpQueryCount(): void {
  const c = store.getStore();
  if (c) c.n += 1;
}

/** Số truy vấn đã chạy trong lượt gọi hiện tại; 0 khi không nằm trong `countQueries` */
export function currentQueryCount(): number {
  return store.getStore()?.n ?? 0;
}

/**
 * Chạy `fn` và trả về kèm số truy vấn CSDL nó đã dùng.
 * Lồng nhau vẫn đúng: mỗi lần gọi có bộ đếm riêng.
 */
export async function countQueries<T>(fn: () => Promise<T>): Promise<{ result: T; queries: number }> {
  const counter: Counter = { n: 0 };
  const result = await store.run(counter, fn);
  return { result, queries: counter.n };
}

/**
 * Logger cắm vào drizzle. KHÔNG in gì ra màn hình — chỉ đếm.
 * (Muốn xem câu SQL thì bật `DRIZZLE_LOG=1`, và chỉ nên bật ở máy dev.)
 */
export const queryCountingLogger = {
  logQuery(query: string): void {
    bumpQueryCount();
    if (process.env.DRIZZLE_LOG === "1") console.log("[sql]", query);
  },
};
