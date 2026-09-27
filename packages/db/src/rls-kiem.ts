/**
 * KIỂM TRA LỚP RLS TRÊN CSDL THẬT — không để lại dấu vết.
 *
 *   pnpm --filter @satarobo/db rls-kiem
 *
 * Toàn bộ chạy trong MỘT giao dịch rồi ROLLBACK: bật RLS, đổi sang vai trò `satarobo_app`, đặt
 * phạm vi một trung tâm, rồi đếm xem còn đọc được dòng của trung tâm khác không. Nhờ rollback,
 * chạy trên CSDL đang dùng cũng không đổi gì (cả việc bật RLS cũng được hoàn tác).
 *
 * Đạt khi: (1) phạm vi trung tâm A không thấy dòng nào của trung tâm khác, (2) không đặt phạm vi
 * thì không thấy dòng nào đã gắn tenant (mặc định an toàn), (3) ghi một dòng mang tenant khác
 * bị CSDL chặn, (4) chế độ quản trị (bypass) thấy đủ.
 */
import "./env";
import process from "node:process";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Thiếu DATABASE_URL.");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
const BANG = ["orders", "payments", "students", "parents", "refunds", "commissions", "enrollments"];
let loi = 0;
const ok = (dat: boolean, msg: string) => {
  console.log(`${dat ? "PASS" : "FAIL"}  ${msg}`);
  if (!dat) loi++;
};

class HoanTac extends Error {}
try {
  await sql.begin(async (tx) => {
    const tenants = await tx<{ id: string; code: string }[]>`select id, code from tenants order by is_default desc, code`;
    if (tenants.length === 0) {
      console.log("SKIP  chưa có bảng tenants có dữ liệu — chạy 0005 trước");
      throw new HoanTac();
    }
    const [{ n }] = await tx<{ n: number }[]>`select satarobo_rls_enable() as n`;
    console.log(`→ bật RLS tạm thời trên ${n} bảng (sẽ hoàn tác)`);
    const a = tenants[0]!;
    const bangCo = (await tx<{ t: string }[]>`select table_name as t from satarobo_rls_tables()`).map((r) => r.t);
    ok(bangCo.includes("refunds") && bangCo.includes("commissions"), "refunds và commissions đã có tenant_id (nằm trong danh sách RLS)");

    // Đếm với tư cách chủ bảng trước (không bị RLS) để biết có dữ liệu trung tâm khác không
    const tong: Record<string, { tong: number; khac: number }> = {};
    for (const b of BANG.filter((x) => bangCo.includes(x))) {
      const [r] = await tx.unsafe(`select count(*)::int as tong, count(*) filter (where tenant_id is distinct from $1::uuid and tenant_id is not null)::int as khac from ${b}`, [a.id]);
      tong[b] = { tong: r!.tong, khac: r!.khac };
    }

    await tx`set local role satarobo_app`;
    // (1) phạm vi một trung tâm
    await tx`select set_config('app.tenant_ids', ${a.id}, true), set_config('app.bypass_rls', 'off', true)`;
    for (const b of Object.keys(tong)) {
      const [r] = await tx.unsafe(`select count(*) filter (where tenant_id is distinct from $1::uuid and tenant_id is not null)::int as khac from ${b}`, [a.id]);
      ok(r!.khac === 0, `${b}: phạm vi ${a.code} không thấy dòng trung tâm khác (chủ bảng thấy ${tong[b]!.khac}, ứng dụng thấy ${r!.khac})`);
    }
    // (2) quên đặt phạm vi → không thấy gì đã gắn tenant
    await tx`select set_config('app.tenant_ids', '', true)`;
    const [r2] = await tx`select count(*) filter (where tenant_id is not null)::int as c from orders`;
    ok(r2!.c === 0, `quên đặt phạm vi thì không đọc được đơn nào (thấy ${r2!.c})`);
    // (3) ghi dòng mang tenant ngoài phạm vi → bị chặn (dùng savepoint để giao dịch còn sống)
    if (tenants.length > 1) {
      const b = tenants[1]!;
      await tx`select set_config('app.tenant_ids', ${a.id}, true)`;
      let chan = false;
      try {
        await tx.savepoint(async (sp) => {
          await sp`update orders set updated_at = updated_at where tenant_id = ${b.id}`;
          await sp`insert into audit_log (action, module, entity, tenant_id) values ('RLS_TEST', 'ops', 'rls', ${b.id})`;
        });
      } catch {
        chan = true;
      }
      ok(chan, `ghi dòng mang tenant ${b.code} khi đang ở phạm vi ${a.code} bị CSDL chặn`);
    } else {
      console.log("SKIP  chỉ có một trung tâm — bỏ qua bài ghi chéo");
    }
    // (4) quản trị (bypass) thấy đủ
    await tx`select set_config('app.bypass_rls', 'on', true)`;
    const [r4] = await tx`select count(*)::int as c from orders`;
    ok(r4!.c === (tong.orders?.tong ?? 0), `chế độ quản trị thấy đủ ${tong.orders?.tong ?? 0} đơn (thấy ${r4!.c})`);
    throw new HoanTac();
  });
} catch (e) {
  if (!(e instanceof HoanTac)) {
    console.error("LỖI:", (e as Error).message);
    loi++;
  }
} finally {
  await sql.end();
}
console.log(loi ? `\n${loi} bài KHÔNG ĐẠT` : "\nRLS: tất cả đạt (đã hoàn tác, CSDL không đổi)");
process.exit(loi ? 1 : 0);
