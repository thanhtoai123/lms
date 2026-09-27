/**
 * SOI VÀ GỘP PHỤ HUYNH TRÙNG SỐ ĐIỆN THOẠI.
 *
 * Vì sao cần chạy trước khi nhập dữ liệu thật: cổng phụ huynh tìm tài khoản bằng số điện
 * thoại và từ chối khi thấy nhiều hơn một dòng. Trùng số không báo lỗi — nó lặng lẽ khiến
 * phụ huynh đó KHÔNG đăng nhập được và KHÔNG nhận được thông báo. Dọn sau khi đã có dữ
 * liệu thật là sửa dữ liệu sản xuất, đắt hơn nhiều.
 *
 *   pnpm sdt-trung          → chỉ xem báo cáo, không ghi gì
 *   pnpm sdt-trung --gop    → gộp thật
 *
 * Gộp làm gì: chuyển con, đơn học phí, thông báo, phiên đăng nhập, đồng ý NĐ13 và PII về
 * dòng được giữ lại, rồi XOÁ MỀM các dòng còn lại (`deleted_at`) — không xoá cứng, để còn
 * lần ngược được nếu gộp nhầm. Mỗi lượt gộp là một giao dịch: hỏng giữa chừng thì không
 * để lại nửa vời.
 *
 * Luật chọn dòng giữ lại nằm ở `@satarobo/core` (`keHoachGopTheoSo`) và có kiểm thử —
 * script này chỉ đọc CSDL rồi thi hành.
 */
import "./env";
import process from "node:process";
import postgres from "postgres";
import { keHoachGopTheoSo } from "@satarobo/core";

const GOP = process.argv.includes("--gop");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Thiếu DATABASE_URL.");
  process.exit(1);
}
const sql = postgres(url, { max: 2 });

interface DongThoi {
  id: string;
  full_name: string;
  account_status: string;
  email: string | null;
  zalo_id: string | null;
  created_at: string;
  sdt: string;
  so_con: number;
  so_don: number;
}

/** Mọi bảng trỏ tới parents.id — chuyển hết về dòng giữ lại trước khi xoá mềm */
const CHUYEN = [
  { bang: "student_guardians", cot: "parent_id", note: "gắn con" },
  { bang: "orders", cot: "parent_id", note: "đơn học phí" },
  { bang: "parent_notifications", cot: "parent_id", note: "thông báo" },
  { bang: "parent_sessions", cot: "parent_id", note: "phiên đăng nhập" },
  { bang: "consent_records", cot: "parent_id", note: "đồng ý NĐ13" },
  { bang: "parent_feedback", cot: "parent_id", note: "phản hồi sau buổi" },
  { bang: "parent_requests", cot: "parent_id", note: "yêu cầu của phụ huynh" },
  { bang: "push_subscriptions", cot: "parent_id", note: "đăng ký thông báo đẩy" },
];

async function coBang(ten: string): Promise<boolean> {
  const [r] = await sql<{ co: boolean }[]>`select to_regclass(${"public." + ten}) is not null as co`;
  return r?.co === true;
}

async function main() {
  const rows = await sql<DongThoi[]>`
    select p.id, p.full_name, p.account_status, p.email, p.zalo_id, p.created_at,
           coalesce(p.phone_normalized, '84' || right(regexp_replace(p.phone, '\\D', '', 'g'), 9)) as sdt,
           (select count(*)::int from student_guardians g where g.parent_id = p.id) as so_con,
           (select count(*)::int from orders o where o.parent_id = p.id) as so_don
      from parents p
     where p.deleted_at is null and p.anonymized_at is null
       and length(regexp_replace(p.phone, '\\D', '', 'g')) >= 9
     order by p.created_at`;

  const nhom = keHoachGopTheoSo(rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    accountStatus: r.account_status,
    email: r.email,
    zaloId: r.zalo_id,
    soCon: r.so_con,
    soDon: r.so_don,
    createdAt: new Date(r.created_at),
    sdt: r.sdt,
  })));

  if (nhom.length === 0) {
    console.log(`Không có số điện thoại phụ huynh nào bị trùng (đã soi ${rows.length} dòng). Tạo được chỉ mục duy nhất.`);
    return;
  }

  const soDongThua = nhom.reduce((s, n) => s + n.gopVao.length, 0);
  console.log(`\n${nhom.length} số bị trùng · ${soDongThua} dòng sẽ được gộp vào dòng khác\n`);
  for (const n of nhom) {
    console.log(`SĐT ${n.sdt}`);
    console.log(`  GIỮ   ${n.giuLai.fullName}  (${n.giuLai.soCon} con · ${n.giuLai.soDon} đơn · ${n.giuLai.accountStatus}) — ${n.lyDo}`);
    for (const g of n.gopVao) {
      console.log(`  gộp   ${g.fullName}  (${g.soCon} con · ${g.soDon} đơn · ${g.accountStatus})`);
    }
    console.log("");
  }

  if (!GOP) {
    console.log("Đây mới là báo cáo. Xem kỹ cột GIỮ rồi chạy lại với  --gop  để gộp thật.");
    return;
  }

  const bangCo: typeof CHUYEN = [];
  for (const c of CHUYEN) if (await coBang(c.bang)) bangCo.push(c);

  let daGop = 0;
  for (const n of nhom) {
    await sql.begin(async (tx) => {
      for (const g of n.gopVao) {
        for (const c of bangCo) {
          // `on conflict do nothing` cho bảng có ràng buộc duy nhất (một con không gắn hai lần cùng một phụ huynh)
          await tx.unsafe(
            `update ${c.bang} set ${c.cot} = $1 where ${c.cot} = $2`,
            [n.giuLai.id, g.id],
          ).catch(async (e: unknown) => {
            if (!/duplicate key/i.test(String(e))) throw e;
            await tx.unsafe(`delete from ${c.bang} where ${c.cot} = $1`, [g.id]);
          });
        }
        // PII: chỉ chuyển sang dòng giữ lại khi dòng đó chưa có
        if (await coBang("parent_private")) {
          await tx`
            insert into parent_private (parent_id, national_id_enc, address_enc, created_at, updated_at)
            select ${n.giuLai.id}, national_id_enc, address_enc, now(), now()
              from parent_private where parent_id = ${g.id}
            on conflict (parent_id) do nothing`;
          await tx`delete from parent_private where parent_id = ${g.id}`;
        }
        await tx`update parents set deleted_at = now(), updated_at = now() where id = ${g.id}`;
        daGop += 1;
      }
      // Dòng giữ lại nhận những gì nó còn thiếu
      await tx`
        update parents set
          email = coalesce(email, (select max(email) from parents where id = any(${n.gopVao.map((g) => g.id)}))),
          zalo_id = coalesce(zalo_id, (select max(zalo_id) from parents where id = any(${n.gopVao.map((g) => g.id)}))),
          updated_at = now()
        where id = ${n.giuLai.id}`;
    });
  }

  console.log(`Đã gộp ${daGop} dòng vào ${nhom.length} dòng giữ lại (xoá mềm, lần ngược được).`);
  console.log("Bước tiếp: pnpm db:apply-sql  → tạo chỉ mục duy nhất parents_phone_uq.");
}

main()
  .then(() => sql.end())
  .catch(async (e: unknown) => {
    console.error("Lỗi:", e instanceof Error ? e.message : e);
    await sql.end();
    process.exit(1);
  });
