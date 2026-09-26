/**
 * THẺ "CÁC CON CỦA BẠN" — tóm tắt một dòng cho mỗi con ở trang Tổng quan cổng phụ huynh.
 *
 * Đây là thứ phụ huynh nhìn đầu tiên khi mở cổng, nên chỉ giữ đúng bốn con số trả lời được câu hỏi
 * "nhà mình đang ổn không": học tới đâu rồi, đi học có đều không, có bài nào đang nợ không, học phí
 * đã đủ chưa. Mỗi ô kèm **mức** (ổn / cần chú ý / chưa có số liệu) để giao diện tô màu mà không phải
 * tự đoán ngưỡng ở từng chỗ.
 *
 * Toàn bộ là hàm thuần: dịch vụ chỉ việc đếm trong CSDL rồi đưa số vào đây.
 */
import { completionPercent } from "./family.js";

/** Mức của một ô chỉ số — quyết định màu, không quyết định chữ */
export type MucChiSo = "ok" | "can_chu_y" | "chua_co";

export interface TinHieuCon {
  /** Số buổi đã học (có mặt / đi muộn / học bù) của khoá đang theo */
  buoiDaHoc: number;
  /** Tổng số buổi của khoá đang theo, tính từ buổi con bắt đầu */
  buoiTong: number;
  /** Số buổi đã điểm danh trong kỳ xét chuyên cần */
  chuyenCanTong: number;
  /** Trong đó bao nhiêu buổi con có mặt */
  chuyenCanCoMat: number;
  /** Số bài tập đang chờ con làm hoặc làm lại */
  baiCho: number;
  /** Học phí còn phải đóng của riêng con (đồng) */
  hocPhiConLai: number;
}

export interface OChiSo {
  khoa: "chuyen_can" | "bai_cho" | "hoc_phi";
  nhan: string;
  giaTri: string;
  muc: MucChiSo;
}

export interface TomTatCon {
  /** Phần trăm buổi đã học của khoá đang theo; `null` khi chưa biết tổng số buổi */
  tienDoPhanTram: number | null;
  /** "2% · 1/48" — hoặc `null` khi chưa có khoá nào để đo */
  tienDoNhan: string | null;
  o: OChiSo[];
}

/** Dưới mốc này thì chuyên cần được coi là cần chú ý */
export const NGUONG_CHUYEN_CAN = 80;

/** Tiền Việt gọn cho thẻ: 4.200.000đ */
export function tienVi(n: number): string {
  return `${Math.round(n).toLocaleString("vi-VN")}đ`;
}

/**
 * Tóm tắt một con thành thanh tiến độ + ba ô chỉ số.
 *
 * Quy ước cố ý:
 * - chưa có buổi nào được điểm danh → chuyên cần hiện "—" mức *chưa có số liệu*, KHÔNG phải 0%
 *   (con mới nhập học mà báo đỏ 0% thì phụ huynh hoảng mà trung tâm thì sai);
 * - học phí bằng 0 → "Đủ" mức *ổn*; còn nợ → hiện đúng số tiền, mức *cần chú ý*;
 * - bài chờ 0 → "Không có" mức *ổn*.
 */
export function tomTatCon(t: TinHieuCon): TomTatCon {
  const daHoc = Math.max(0, t.buoiDaHoc);
  const tong = Math.max(0, t.buoiTong);
  const tienDoPhanTram = completionPercent(daHoc, tong);
  const tienDoNhan = tienDoPhanTram === null ? null : `${tienDoPhanTram}% · ${Math.min(daHoc, tong)}/${tong}`;

  const ccTong = Math.max(0, t.chuyenCanTong);
  const ccCoMat = Math.max(0, Math.min(t.chuyenCanCoMat, ccTong));
  const ccTyLe = ccTong > 0 ? Math.round((ccCoMat / ccTong) * 100) : null;

  const baiCho = Math.max(0, t.baiCho);
  const no = Math.max(0, t.hocPhiConLai);

  return {
    tienDoPhanTram,
    tienDoNhan,
    o: [
      {
        khoa: "chuyen_can",
        nhan: "Chuyên cần",
        giaTri: ccTyLe === null ? "—" : `${ccTyLe}%`,
        muc: ccTyLe === null ? "chua_co" : ccTyLe >= NGUONG_CHUYEN_CAN ? "ok" : "can_chu_y",
      },
      {
        khoa: "bai_cho",
        nhan: "Bài chờ",
        giaTri: baiCho === 0 ? "Không có" : String(baiCho),
        muc: baiCho === 0 ? "ok" : "can_chu_y",
      },
      {
        khoa: "hoc_phi",
        nhan: "Học phí",
        giaTri: no === 0 ? "Đủ" : tienVi(no),
        muc: no === 0 ? "ok" : "can_chu_y",
      },
    ],
  };
}
