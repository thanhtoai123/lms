/**
 * ĐIỂM & TRẠNG THÁI KHÁCH — gom tín hiệu thật từ CSDL rồi để `core/admissions/diemLead` chấm.
 *
 * Nguyên tắc chia việc: SQL chỉ **đếm** (bao nhiêu tin khách gửi, mấy cuộc hẹn, đã học thử chưa,
 * lần cuối khách tương tác là khi nào); còn **cách chấm và ngưỡng nóng/ấm/lạnh** nằm ở core để có
 * kiểm thử và để sau này chỉnh trọng số ở một chỗ. Không nhồi công thức vào SQL.
 */
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { appointments, conversations, leads, messages, trialBookings, users } from "@satarobo/db";
import { centersWith, chamDiemLead, leadDinhTre, LEAD_TEMP_VI, LEAD_STATUS_VI, type LeadTemp, type LeadStatus } from "@satarobo/core";
import { requirePermission, type ProtectedContext } from "../trpc";

function phamVi(ctx: ProtectedContext): SQL {
  const ds = centersWith(ctx.actor, "lead:read");
  if (ds === null) return sql`true`;
  if (ds.length === 0) return sql`false`;
  return or(inArray(leads.centerId, ds), isNull(leads.centerId))!;
}

export type LeadScoreView = "tat_ca" | "nong" | "am" | "lanh" | "nguoi" | "rui_ro" | "ngu_dong" | "dinh_tre";

/**
 * Bảng "Điểm & trạng thái": ai đáng gọi trước, ai sắp mất, ai nên bỏ vào chiến dịch nuôi dài hạn.
 * Chỉ tính trên lead CHƯA ghi danh và chưa đóng — người đã thành học viên thuộc phần chăm sóc.
 */
export async function bangDiemLead(ctx: ProtectedContext, input: { view?: LeadScoreView; limit?: number } = {}) {
  requirePermission(ctx, "lead:read");
  const now = new Date();
  const limit = Math.min(500, Math.max(20, input.limit ?? 200));

  const rows = await ctx.db
    .select({
      id: leads.id,
      ten: leads.parentName,
      status: leads.status,
      centerId: leads.centerId,
      taoLuc: leads.createdAt,
      capNhat: leads.updatedAt,
      coSdt: sql<boolean>`${leads.phoneNormalized} is not null and ${leads.phoneNormalized} <> ''`,
      nguoiPhuTrach: users.fullName,
      soTinKhachGui: sql<number>`(select count(*) from ${messages} m join ${conversations} c on c.id = m.conversation_id where c.lead_id = ${leads.id} and m.direction = 'in')::int`,
      soLuotCham: sql<number>`(select count(*) from ${messages} m join ${conversations} c on c.id = m.conversation_id where c.lead_id = ${leads.id} and m.direction = 'out')::int`,
      soCuocHen: sql<number>`(select count(*) from ${appointments} a where a.lead_id = ${leads.id})::int`,
      daHocThu: sql<boolean>`exists (select 1 from ${trialBookings} t where t.lead_id = ${leads.id} and t.status in ('attended','booked'))`,
      tuongTacCuoi: sql<Date | null>`(select max(m.created_at) from ${messages} m join ${conversations} c on c.id = m.conversation_id where c.lead_id = ${leads.id} and m.direction = 'in')`,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedToId))
    .where(and(phamVi(ctx), sql`${leads.status} not in ('enrolled','lost')`))
    .orderBy(desc(leads.updatedAt))
    .limit(limit);

  const cham = rows.map((r) => {
    const d = chamDiemLead({
      soTinKhachGui: r.soTinKhachGui,
      soLuotCham: r.soLuotCham,
      coSdt: !!r.coSdt,
      soCuocHen: r.soCuocHen,
      daHocThu: !!r.daHocThu,
      daGhiDanh: r.status === "enrolled",
      tuongTacCuoi: r.tuongTacCuoi ? new Date(r.tuongTacCuoi) : null,
      taoLuc: new Date(r.taoLuc),
    }, now);
    const dt = leadDinhTre({ status: r.status, capNhatCuoi: new Date(r.capNhat) }, now);
    return {
      id: r.id,
      ten: r.ten,
      status: r.status,
      statusLabel: LEAD_STATUS_VI[r.status as LeadStatus] ?? r.status,
      nguoiPhuTrach: r.nguoiPhuTrach,
      diem: d.diem,
      temp: d.temp,
      tempLabel: LEAD_TEMP_VI[d.temp],
      imLangNgay: d.imLangNgay,
      lyDo: d.lyDo,
      dinhTre: dt.dinhTre,
      dinhTreNgay: dt.soNgay,
      dinhTreNguong: dt.nguong,
      soTinKhachGui: r.soTinKhachGui,
      soCuocHen: r.soCuocHen,
      daHocThu: !!r.daHocThu,
    };
  });

  const dem: Record<LeadTemp | "dinh_tre", number> = {
    vo_dich: 0, nong: 0, am: 0, lanh: 0, nguoi: 0, rui_ro: 0, ngu_dong: 0, dinh_tre: 0,
  };
  for (const c of cham) {
    dem[c.temp] += 1;
    if (c.dinhTre) dem.dinh_tre += 1;
  }

  const view = input.view ?? "tat_ca";
  const loc = view === "tat_ca" ? cham : view === "dinh_tre" ? cham.filter((c) => c.dinhTre) : cham.filter((c) => c.temp === view);

  return {
    dem,
    tong: cham.length,
    items: loc.sort((a, b) => b.diem - a.diem || a.imLangNgay - b.imLangNgay).slice(0, 200),
  };
}
