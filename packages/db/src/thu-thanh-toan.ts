/**
 * KIỂM THỬ ĐẦU-CUỐI THANH TOÁN QR → WEBHOOK SEPAY → KHOẢN THU (chỉ máy dev / máy chạy thử).
 *
 *   pnpm --filter @satarobo/db thu-thanh-toan            # mặc định gọi http://localhost:3000
 *   THU_TT_URL=https://staging.example.vn pnpm --filter @satarobo/db thu-thanh-toan
 *   THU_TT_DON=DH26-000070 pnpm thu-thanh-toan   # thử trên ĐÚNG đơn này; đơn từ lead có lớp tự xếp → chờ worker tự xếp lớp rồi báo kết quả
 *
 * Gửi webhook GIẢ LẬP đúng định dạng SePay (ký HMAC nếu máy chủ dùng SEPAY_WEBHOOK_SECRET, không thì API Key)
 * tới máy chủ đang chạy, rồi đọc CSDL để đối chiếu: khoản thu tự xác nhận, số phiếu thu, chống trùng, từ chối chữ ký sai,
 * giao dịch lệch tiền / thiếu mã đơn vào "Biến động số dư". Mỗi lần chạy tạo MỘT khoản thu 10.000đ thật trong CSDL
 * đang trỏ tới (ghi chú "KIEM THU") — vì vậy TỪ CHỐI chạy khi NODE_ENV=production hoặc CSDL không ở máy này.
 */
import "./env";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "";
if (process.env.NODE_ENV === "production" || !/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error("✗ Chỉ chạy trên máy dev (DATABASE_URL trỏ localhost, NODE_ENV khác production).");
  process.exit(2);
}
const base = (process.env.THU_TT_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Khoá webhook: biến môi trường, không có thì đọc apps/web/.env (máy chủ Next đọc tệp này) */
function webEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const here = dirname(fileURLToPath(import.meta.url));
  const p = join(here, "..", "..", "..", "apps", "web", ".env");
  if (!existsSync(p)) return undefined;
  const m = new RegExp(`^${name}=(.*)$`, "m").exec(readFileSync(p, "utf8"));
  return m?.[1]?.trim().replace(/^["']|["']$/g, "") || undefined;
}
const secret = webEnv("SEPAY_WEBHOOK_SECRET");
const apiKey = webEnv("SEPAY_API_KEY");
if (!secret && !apiKey) {
  console.error("✗ Máy chủ chưa đặt SEPAY_WEBHOOK_SECRET hoặc SEPAY_API_KEY (apps/web/.env).");
  process.exit(2);
}

const sql = postgres(url, { max: 1 });
type Row = Record<string, unknown>;
let pass = 0;
let fail = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? "ĐẠT " : "LỖI "} ${label}${detail ? ` — ${detail}` : ""}`);
};

async function send(payload: Record<string, unknown>, opts: { badSig?: boolean; oldTs?: boolean } = {}) {
  const raw = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) {
    const ts = String(Math.floor(Date.now() / 1000) - (opts.oldTs ? 2 * 3600 : 0));
    const sig = createHmac("sha256", opts.badSig ? `${secret}x` : secret).update(`${ts}.${raw}`).digest("hex");
    headers["x-sepay-timestamp"] = ts;
    headers["x-sepay-signature"] = `sha256=${sig}`;
  } else {
    headers.authorization = `Apikey ${opts.badSig ? `${apiKey}x` : apiKey}`;
  }
  const r = await fetch(`${base}/api/webhooks/sepay`, { method: "POST", headers, body: raw });
  return { status: r.status, body: await r.text() };
}

try {
  console.log(`== Kiểm thử thanh toán QR → webhook SePay (${secret ? "HMAC-SHA256" : "API Key"}) → ${base}`);
  const methods = await sql<Row[]>`
    select id, center_id, bank_bin, account_no from payment_methods
    where kind = 'bank_transfer' and is_active and bank_bin is not null and account_no is not null order by created_at limit 5`;
  if (!methods.length) throw new Error("Chưa có phương thức chuyển khoản nào có BIN + số tài khoản");
  const centerIds = methods.map((m) => m.center_id).filter(Boolean) as string[];
  const hasShared = methods.some((m) => !m.center_id);
  const only = process.env.THU_TT_DON?.trim() || null;
  const [order] = await sql<Row[]>`
    select o.id, o.code, o.center_id, o.total, o.lead_id,
      o.total - coalesce((select sum(p.amount) from payments p where p.order_id = o.id and p.status = 'confirmed'), 0) as outstanding,
      (select count(*) from payments p where p.order_id = o.id and p.status = 'recorded') as pending_sale
    from orders o
    where o.status in ('pending_payment', 'partially_paid') ${only ? sql`and o.code = ${only}` : hasShared ? sql`` : sql`and o.center_id in ${sql(centerIds)}`}
    order by o.created_at desc limit 50`.then((rows) => rows.filter((o) => Number(o.outstanding) >= 20_000 && Number(o.pending_sale) === 0));
  if (!order) throw new Error(only ? `Đơn ${only} không đang mở / đã có khoản sale chờ xác nhận / còn thiếu < 20.000đ` : "Không có đơn đang mở còn thiếu ≥ 20.000đ (và không có khoản sale chờ xác nhận) để thử");
  const method = methods.find((m) => m.center_id === order.center_id) ?? methods.find((m) => !m.center_id)!;
  const acc = String(method.account_no).replace(/[^A-Za-z0-9]/g, "");
  const code = String(order.code);
  const memo = `THSTEAM ${code.replace(/[^A-Za-z0-9]/g, "")}`;
  console.log(`  Đơn ${code} · còn thiếu ${Number(order.outstanding).toLocaleString("vi-VN")}đ · TK nhận ${acc.slice(0, 3)}…${acc.slice(-3)}`);

  const idBase = Math.floor(Date.now() / 1000) * 10;
  const now = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " ");
  const tx = (id: number, amount: number, content: string, extra: Record<string, unknown> = {}) => ({
    id, gateway: "KiemThu", transactionDate: now, accountNumber: acc, subAccount: "", code: null, content,
    transferType: "in", description: "KIEM THU", transferAmount: amount, accumulated: 0, referenceCode: `KT${id}`, ...extra,
  });
  const btOf = async (id: number) => (await sql<Row[]>`select status, match_note, payment_id from bank_transactions where source = 'sepay' and external_id = ${String(id)}`)[0];

  // 1) Chuyển đúng: nội dung có mã đơn, ngân hàng nối thêm số TK phía sau
  const id1 = idBase + 1;
  const r1 = await send(tx(id1, 10_000, `${memo} ${acc} KIEM THU`));
  check(r1.status === 200 && r1.body.replace(/\s/g, "") === '{"success":true}', "Trả 200 + đúng {\"success\": true} (SePay mới coi là thành công)", `${r1.status} ${r1.body}`);
  const b1 = await btOf(id1);
  check(b1?.status === "matched", "Giao dịch tự khớp đơn", `${b1?.status ?? "không có"} · ${b1?.match_note ?? ""}`);
  const [p1] = b1?.payment_id ? await sql<Row[]>`select status, receipt_no, amount, source from payments where id = ${b1.payment_id as string}` : [];
  check(p1?.status === "confirmed" && !!p1?.receipt_no && Number(p1?.amount) === 10_000, "Khoản thu 10.000đ tự xác nhận, có số phiếu thu", `${p1?.status ?? "-"} · ${p1?.receipt_no ?? "-"}`);
  const [l1] = b1?.payment_id ? await sql<Row[]>`select count(*)::int as n from finance_ledger where ref_id = ${b1.payment_id as string}` : [{ n: 0 }];
  check(Number(l1?.n) === 1, "Có đúng 1 bút toán sổ cái");

  // 2) SePay gửi lại cùng id → không tạo khoản thu thứ hai
  const r2 = await send(tx(id1, 10_000, `${memo} ${acc} KIEM THU`));
  const [n2] = await sql<Row[]>`select count(*)::int as n from payments where external_ref = ${String(id1)}`;
  check(r2.status === 200 && Number(n2?.n) === 1, "Gửi lại cùng id: trả 200, vẫn 1 khoản thu", `${r2.status} · ${n2?.n} khoản`);

  // 3) Chữ ký / khoá sai → 401, không ghi giao dịch
  const id3 = idBase + 3;
  const r3 = await send(tx(id3, 10_000, memo), { badSig: true });
  check(r3.status === 401 && !(await btOf(id3)), "Sai chữ ký / khoá: 401, không ghi giao dịch", String(r3.status));

  // 4) Dấu thời gian quá cũ (chỉ kiểm khi dùng HMAC)
  if (secret) {
    const id4 = idBase + 4;
    const r4 = await send(tx(id4, 10_000, memo), { oldTs: true });
    check(r4.status === 401 && !(await btOf(id4)), "HMAC: dấu thời gian cũ 2 giờ bị từ chối", String(r4.status));
  }

  // 5) Không có mã đơn → Chưa khớp (kế toán gắn tay), vẫn trả 200
  const id5 = idBase + 5;
  const r5 = await send(tx(id5, 10_000, "chuyen tien hoc phi KIEM THU"));
  const b5 = await btOf(id5);
  check(r5.status === 200 && b5?.status === "unmatched", "Thiếu mã đơn → Chưa khớp", `${b5?.status ?? "-"}`);

  // 6) Vượt số còn thiếu → Cần kiểm tra, không tự thu
  const id6 = idBase + 6;
  await send(tx(id6, Number(order.outstanding) + 1_000_000, memo));
  const b6 = await btOf(id6);
  check(b6?.status === "needs_review" && !b6?.payment_id, "Tiền về vượt số còn thiếu → Cần kiểm tra", `${b6?.status ?? "-"} · ${b6?.match_note ?? ""}`);

  // 7) Tài khoản nhận chưa khai → Cần kiểm tra
  const id7 = idBase + 7;
  await send(tx(id7, 10_000, memo, { accountNumber: "999000111222" }));
  const b7 = await btOf(id7);
  check(b7?.status === "needs_review" && !b7?.payment_id, "Tài khoản nhận lạ → Cần kiểm tra", `${b7?.status ?? "-"}`);

  // 8) Tiền ra → bỏ qua
  const id8 = idBase + 8;
  await send(tx(id8, 10_000, memo, { transferType: "out" }));
  check((await btOf(id8))?.status === "ignored", "Tiền ra → Bỏ qua");

  // 9) Đơn từ lead có lớp tự xếp: worker tự chốt học viên + ghi danh sau khoản tiền đầu tiên
  if (only && order.lead_id) {
    const [want] = await sql<Row[]>`select count(*)::int as n from order_items where order_id = ${order.id as string} and target_class_id is not null`;
    if (Number(want?.n) > 0) {
      let ev: Row | undefined;
      for (let i = 0; i < 45 && !ev; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        [ev] = await sql<Row[]>`select note from order_events where order_id = ${order.id as string} and event = 'auto_enroll' order by created_at desc limit 1`;
      }
      const [enr] = await sql<Row[]>`
        select count(*)::int as n, string_agg(c.code, ', ') as lop from order_items i join enrollments e on e.id = i.enrollment_id join classes c on c.id = e.class_id
        where i.order_id = ${order.id as string}`;
      const [ld] = await sql<Row[]>`select status from leads where id = ${order.lead_id as string}`;
      check(Number(enr?.n) > 0, "Tiền về → worker tự xếp lớp", `${ev?.note ?? "chưa có sự kiện (worker chưa chạy?)"} · ghi danh: ${enr?.lop ?? "-"} · lead: ${ld?.status ?? "-"}`);
    }
  }

  console.log(`== Kết quả: ${pass} đạt, ${fail} lỗi. Đã tạo 1 khoản thu kiểm thử 10.000đ trên đơn ${code}.`);
  process.exitCode = fail ? 1 : 0;
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
