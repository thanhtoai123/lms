/**
 * ĐIỂM & TRẠNG THÁI KHÁCH — trả lời câu hỏi "gọi ai trước" bằng số, không bằng cảm tính.
 *
 * Công cụ CRM Zalo mà trung tâm đang dùng có mục "Điểm & Trạng thái": mỗi khách một điểm, kèm nhãn
 * *lạnh / ấm / nóng / nguội / rủi ro / ngủ đông*. Bản ở đây làm đúng ý đó nhưng theo nghề dạy học:
 *
 *  - **Khách nhắn nhiều** = đang quan tâm → cộng điểm, nhưng có trần để một người nhắn 50 tin không
 *    lấn át mười người thật sự tiềm năng.
 *  - **Có số điện thoại** mới gọi được → cộng.
 *  - **Đã hẹn / đã cho bé học thử** = đã bước sâu vào phễu → cộng mạnh.
 *  - **Càng lâu không liên lạc, điểm càng tụt** (hao mòn). Đây là phần quan trọng nhất: không có nó
 *    thì danh sách "khách nóng" chỉ toàn người của tháng trước.
 *
 * Trả về cả **lý do từng điểm** để nhân viên tin con số, và để quản lý chỉnh trọng số có căn cứ.
 * Hàm thuần tuý: cùng dữ liệu vào luôn ra cùng kết quả, kiểm thử được.
 */

export const LEAD_TEMPS = ["vo_dich", "nong", "am", "lanh", "nguoi", "rui_ro", "ngu_dong"] as const;
export type LeadTemp = (typeof LEAD_TEMPS)[number];

export const LEAD_TEMP_VI: Record<LeadTemp, string> = {
  vo_dich: "Đã ghi danh",
  nong: "Nóng",
  am: "Ấm",
  lanh: "Lạnh",
  nguoi: "Đang nguội",
  rui_ro: "Nguy cơ mất",
  ngu_dong: "Ngủ đông",
};

export const LEAD_TEMP_MO_TA: Record<LeadTemp, string> = {
  vo_dich: "Đã thành học viên — chuyển sang chăm sóc, không gọi bán nữa",
  nong: "Đang quan tâm mạnh, có việc để chốt trong vài ngày tới",
  am: "Có tương tác, cần thêm một nhịp chăm",
  lanh: "Mới vào phễu hoặc tương tác ít — nuôi dần",
  nguoi: "Từng nóng nhưng đã lâu không liên lạc — gọi lại trước khi mất",
  rui_ro: "Quá lâu im lặng dù từng quan tâm — cần nước đi khác (ưu đãi, đổi người chăm)",
  ngu_dong: "Không tương tác rất lâu — để vào chiến dịch nuôi dài hạn, đừng chiếm chỗ hàng ngày",
};

export const LEAD_TEMP_CHIP: Record<LeadTemp, string> = {
  vo_dich: "bg-green-100 text-green-800",
  nong: "bg-red-100 text-red-700",
  am: "bg-amber-100 text-amber-800",
  lanh: "bg-slate-100 text-slate-700",
  nguoi: "bg-violet-100 text-violet-700",
  rui_ro: "bg-orange-100 text-orange-800",
  ngu_dong: "bg-slate-100 text-ink-400",
};

/** Trọng số mặc định — quản lý chỉnh được về sau, nên để thành hằng có tên */
export const DIEM_LEAD_TRONG_SO = {
  /** Mỗi tin khách gửi tới */
  tinKhachGui: 6,
  tinKhachGuiToiDa: 30,
  /** Mỗi lần trung tâm chăm (nhắn ra / gọi) — thể hiện đã đầu tư công */
  luotCham: 2,
  luotChamToiDa: 10,
  /** Có số điện thoại gọi được */
  coSdt: 10,
  /** Mỗi cuộc hẹn đã đặt */
  hen: 8,
  henToiDa: 16,
  /** Đã cho bé học thử */
  daHocThu: 20,
  /** Hao mòn mỗi ngày kể từ lần khách tương tác cuối */
  haoMonMoiNgay: 1.5,
  /** Hao mòn tối đa (không để điểm âm vô hạn) */
  haoMonToiDa: 45,
} as const;

export interface TinHieuLead {
  /** Số tin khách gửi tới trung tâm */
  soTinKhachGui: number;
  /** Số lượt trung tâm chăm (tin gửi ra, cuộc gọi đã ghi nhận) */
  soLuotCham: number;
  coSdt: boolean;
  soCuocHen: number;
  daHocThu: boolean;
  daGhiDanh: boolean;
  /** Lần cuối khách tương tác (tin tới / bấm form). Null = chưa bao giờ */
  tuongTacCuoi: Date | null;
  /** Ngày lead vào hệ thống */
  taoLuc: Date;
}

export interface KetQuaDiemLead {
  diem: number;
  temp: LeadTemp;
  tempLabel: string;
  /** Số ngày kể từ lần khách tương tác cuối (hoặc kể từ lúc tạo nếu chưa tương tác) */
  imLangNgay: number;
  /** Từng khoản điểm, để giải thích cho người dùng */
  lyDo: { khoan: string; diem: number }[];
}

const ngayGiua = (a: Date, b: Date) => Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86_400_000));

/** Ngưỡng nhiệt theo điểm — đặt tên để test và để màn cấu hình về sau dùng chung */
export const NGUONG_NHIET = { nong: 65, am: 40, lanh: 20 } as const;
/** Im lặng bao nhiêu ngày thì tụt hạng dù điểm còn cao */
export const NGUONG_IM_LANG = { nguoi: 7, rui_ro: 21, ngu_dong: 45 } as const;

export function chamDiemLead(t: TinHieuLead, now: Date): KetQuaDiemLead {
  const lyDo: { khoan: string; diem: number }[] = [];
  const W = DIEM_LEAD_TRONG_SO;

  const dTin = Math.min(t.soTinKhachGui * W.tinKhachGui, W.tinKhachGuiToiDa);
  if (dTin) lyDo.push({ khoan: `Khách nhắn ${t.soTinKhachGui} tin`, diem: dTin });

  const dCham = Math.min(t.soLuotCham * W.luotCham, W.luotChamToiDa);
  if (dCham) lyDo.push({ khoan: `Trung tâm đã chăm ${t.soLuotCham} lượt`, diem: dCham });

  const dSdt = t.coSdt ? W.coSdt : 0;
  if (dSdt) lyDo.push({ khoan: "Có số điện thoại", diem: dSdt });

  const dHen = Math.min(t.soCuocHen * W.hen, W.henToiDa);
  if (dHen) lyDo.push({ khoan: `${t.soCuocHen} cuộc hẹn`, diem: dHen });

  const dThu = t.daHocThu ? W.daHocThu : 0;
  if (dThu) lyDo.push({ khoan: "Đã cho bé học thử", diem: dThu });

  const moc = t.tuongTacCuoi ?? t.taoLuc;
  const imLangNgay = ngayGiua(moc, now);
  const haoMon = Math.min(Math.round(imLangNgay * W.haoMonMoiNgay), W.haoMonToiDa);
  if (haoMon) lyDo.push({ khoan: `Im lặng ${imLangNgay} ngày`, diem: -haoMon });

  const diem = Math.max(0, Math.min(100, dTin + dCham + dSdt + dHen + dThu - haoMon));

  let temp: LeadTemp;
  if (t.daGhiDanh) temp = "vo_dich";
  else if (imLangNgay >= NGUONG_IM_LANG.ngu_dong) temp = "ngu_dong";
  else if (imLangNgay >= NGUONG_IM_LANG.rui_ro) temp = "rui_ro";
  else if (imLangNgay >= NGUONG_IM_LANG.nguoi && diem >= NGUONG_NHIET.lanh) temp = "nguoi";
  else if (diem >= NGUONG_NHIET.nong) temp = "nong";
  else if (diem >= NGUONG_NHIET.am) temp = "am";
  else temp = "lanh";

  return { diem, temp, tempLabel: LEAD_TEMP_VI[temp], imLangNgay, lyDo };
}

/**
 * Lead "đình trệ": đang ở một bậc phễu mà quá lâu không nhúc nhích.
 * Mốc theo bậc, vì "mới" để 3 ngày là chậm, còn "đang chăm" thì 7 ngày mới đáng lo.
 */
export const NGAY_DINH_TRE: Record<string, number> = {
  new: 2,
  contacted: 5,
  interested: 7,
  trial_booked: 3,
  trial_done: 3,
  negotiating: 5,
};

export function leadDinhTre(x: { status: string; capNhatCuoi: Date }, now: Date): { dinhTre: boolean; nguong: number; soNgay: number } {
  const nguong = NGAY_DINH_TRE[x.status] ?? 0;
  const soNgay = ngayGiua(x.capNhatCuoi, now);
  return { dinhTre: nguong > 0 && soNgay > nguong, nguong, soNgay };
}
