/**
 * CHUẨN CHỮ ĐẦU TRANG — mỗi trang chỉ MỘT dòng mô tả ngắn dưới tiêu đề; phần giải thích dài
 * (quy tắc, cách dùng, lưu ý) thu vào nút "Cách dùng" và chỉ mở khi người dùng cần.
 *
 * `tachMoTa` tách mô tả cũ (thường 2–3 câu) thành: `lead` = câu đầu (hoặc vế đầu nếu câu quá dài),
 * `rest` = phần còn lại. Không cắt giữa chừng một từ; câu đủ ngắn thì giữ nguyên, không có phần thêm.
 */
export const MO_TA_TOI_DA = 110;

export function tachMoTa(desc: string | null | undefined, max = MO_TA_TOI_DA): { lead: string; rest: string | null } {
  const d = (desc ?? "").replace(/\s+/g, " ").trim();
  if (!d) return { lead: "", rest: null };
  if (d.length <= max) return { lead: d, rest: null };
  // 1) Câu đầu tiên (kết thúc bằng . ! ? rồi khoảng trắng) — bỏ qua chữ viết tắt ("VD.", "v.v.")
  //    và dấu chấm nằm trong ngoặc đơn chưa đóng
  const m = cauDau(d);
  if (m && m[1]!.length <= max) return { lead: m[1]!, rest: m[2]! };
  const first = m ? m[1]! : d;
  const after = m ? m[2]! : "";
  // 2) Câu đầu quá dài → cắt ở vế đầu: " — ", ": ", "; ", ", " (vị trí xa nhất còn trong giới hạn)
  for (const sep of [" — ", ": ", "; ", ", "]) {
    const i = first.lastIndexOf(sep, max);
    if (i >= 30) {
      const lead = first.slice(0, i).replace(/[,;:]$/, "") + (sep === ", " || sep === "; " ? "…" : ".");
      const rest = (first.slice(i + sep.length) + (after ? ` ${after}` : "")).trim();
      return { lead: lead.replace(/\.\.$/, "."), rest: rest.charAt(0).toUpperCase() + rest.slice(1) };
    }
  }
  // 3) Không có chỗ cắt đẹp → giữ nguyên câu đầu
  return { lead: first, rest: after || null };
}

const VIET_TAT = /(?:^|[\s(])(?:VD|vd|Vd|v\.v|TP|Tp|ThS|TS|PGS|GS|Dr|Mr|Ms|No|Mục|mục|tr|Tr)\.$/;

/** Tách câu đầu: trả [câu đầu, phần còn lại] hoặc null nếu chỉ có một câu */
function cauDau(d: string): [string, string, string] | null {
  const re = /[.!?](?=\s+)/g;
  let x: RegExpExecArray | null;
  while ((x = re.exec(d))) {
    const head = d.slice(0, x.index + 1);
    if (VIET_TAT.test(head)) continue;
    if ((head.match(/\(/g)?.length ?? 0) > (head.match(/\)/g)?.length ?? 0)) continue;
    const tail = d.slice(x.index + 1).trim();
    if (!tail) return null;
    return [d, head, tail];
  }
  return null;
}
