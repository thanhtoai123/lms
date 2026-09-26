/**
 * TRÙNG SỐ ĐIỆN THOẠI PHỤ HUYNH — chọn giữ dòng nào, gộp dòng nào.
 *
 * Vì sao phải có: cổng phụ huynh tìm tài khoản bằng số điện thoại và **từ chối khi thấy
 * nhiều hơn một dòng** (`parentPortal.findParentByPhone`). Nghĩa là trùng số không gây lỗi
 * ồn ào — nó lặng lẽ khiến phụ huynh đó *không đăng nhập được và không nhận được thông báo*.
 * Dữ liệu hệ cũ gần như chắc chắn có trùng: bố và mẹ khai cùng một số, hoặc nhập hai lần.
 *
 * Phải dọn **trước khi** nhập dữ liệu thật. Dọn sau là sửa dữ liệu sản xuất, đắt hơn nhiều.
 *
 * Luật chọn ở đây là luật thuần để kiểm thử được; phần chuyển con, đơn hàng, thông báo
 * sang dòng giữ lại nằm ở tầng dịch vụ.
 */

export interface DongPhuHuynh {
  id: string;
  fullName: string;
  /** Trạng thái tài khoản cổng: "active" nghĩa là phụ huynh ĐÃ từng đăng nhập được */
  accountStatus: string;
  email: string | null;
  zaloId: string | null;
  /** Số con đang gắn với dòng này */
  soCon: number;
  /** Số đơn học phí đứng tên dòng này */
  soDon: number;
  createdAt: Date;
}

export interface KeHoachGop {
  /** Dòng được giữ lại — mọi thứ của các dòng khác sẽ chuyển về đây */
  giuLai: DongPhuHuynh;
  /** Các dòng sẽ được gộp rồi xoá mềm */
  gopVao: DongPhuHuynh[];
  /** Vì sao chọn dòng này — hiện cho người duyệt đọc trước khi bấm */
  lyDo: string;
}

/**
 * Thứ tự ưu tiên khi chọn dòng giữ lại. Xếp theo mức độ "mất đi thì đau":
 *
 * 1. **Đã kích hoạt tài khoản cổng** — phụ huynh đã đăng nhập được bằng dòng này; xoá là
 *    bắt họ kích hoạt lại, và mọi phiên đang mở đều đứt.
 * 2. **Gắn nhiều con hơn** — chuyển con là thao tác rủi ro nhất trong việc gộp, nên chuyển
 *    càng ít càng tốt.
 * 3. **Nhiều đơn học phí hơn** — công nợ và phiếu thu bám theo đơn.
 * 4. **Có Zalo ID** — mất là mất đường gửi ZNS.
 * 5. **Có email**.
 * 6. **Tạo sớm nhất** — dòng gốc, các dòng sau thường là bản nhập lại.
 * 7. `id` nhỏ nhất — để hai lần chạy ra cùng một kết quả, không phụ thuộc thứ tự đọc.
 */
function diem(r: DongPhuHuynh): number[] {
  return [
    r.accountStatus === "active" ? 1 : 0,
    r.soCon,
    r.soDon,
    r.zaloId ? 1 : 0,
    r.email ? 1 : 0,
    -r.createdAt.getTime(),
  ];
}

function tot(a: DongPhuHuynh, b: DongPhuHuynh): DongPhuHuynh {
  const da = diem(a);
  const db = diem(b);
  for (let i = 0; i < da.length; i += 1) {
    if (da[i]! !== db[i]!) return da[i]! > db[i]! ? a : b;
  }
  return a.id <= b.id ? a : b;
}

/** Câu giải thích ngắn cho người duyệt — nói đúng tiêu chí đã quyết định */
function noLyDo(giu: DongPhuHuynh, khac: readonly DongPhuHuynh[]): string {
  if (giu.accountStatus === "active" && khac.every((r) => r.accountStatus !== "active")) {
    return "đã kích hoạt tài khoản cổng — xoá dòng này là bắt phụ huynh kích hoạt lại";
  }
  if (khac.every((r) => r.soCon < giu.soCon)) return `đang gắn nhiều con nhất (${giu.soCon} con)`;
  if (khac.every((r) => r.soDon < giu.soDon)) return `đứng tên nhiều đơn học phí nhất (${giu.soDon} đơn)`;
  if (giu.zaloId && khac.every((r) => !r.zaloId)) return "có Zalo ID — giữ được đường gửi tin";
  if (giu.email && khac.every((r) => !r.email)) return "có email";
  if (khac.every((r) => r.createdAt >= giu.createdAt)) return "là dòng tạo sớm nhất";
  return "chọn theo thứ tự ưu tiên chuẩn";
}

/**
 * Lập kế hoạch gộp cho MỘT nhóm dòng cùng số điện thoại.
 * Trả `null` khi nhóm chỉ có một dòng (không có gì để gộp).
 */
export function keHoachGop(rows: readonly DongPhuHuynh[]): KeHoachGop | null {
  if (rows.length < 2) return null;
  const giuLai = rows.reduce((a, b) => tot(a, b));
  const gopVao = rows.filter((r) => r.id !== giuLai.id);
  return { giuLai, gopVao, lyDo: noLyDo(giuLai, gopVao) };
}

/**
 * Gộp cả danh sách, nhóm theo số đã chuẩn hoá.
 * `sdt` là số đã chuẩn hoá (`normalizeVnPhone`) — nhóm theo số thô sẽ bỏ sót
 * `0911000001` và `84911000001` vốn là cùng một người.
 */
export function keHoachGopTheoSo(rows: readonly (DongPhuHuynh & { sdt: string })[]): (KeHoachGop & { sdt: string })[] {
  const nhom = new Map<string, (DongPhuHuynh & { sdt: string })[]>();
  for (const r of rows) {
    if (!r.sdt) continue;
    const l = nhom.get(r.sdt);
    if (l) l.push(r);
    else nhom.set(r.sdt, [r]);
  }
  const out: (KeHoachGop & { sdt: string })[] = [];
  for (const [sdt, l] of nhom) {
    const k = keHoachGop(l);
    if (k) out.push({ ...k, sdt });
  }
  // Nhóm nhiều dòng nhất lên đầu — đó là chỗ sai nhiều nhất, xem trước
  return out.sort((a, b) => b.gopVao.length - a.gopVao.length || (a.sdt < b.sdt ? -1 : 1));
}
