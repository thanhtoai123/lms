/**
 * BỘ TIÊU CHÍ MẪU THEO CHƯƠNG TRÌNH — quản trị chọn một bộ khi khoá chưa có tiêu chí (hoặc thêm tiêu chí từ bộ mẫu
 * vào khoá đang có) rồi chỉnh lại cho đúng chương trình. Mỗi tiêu chí có 4 mô tả HÀNH VI QUAN SÁT ĐƯỢC (mức 1 → 4),
 * ngôn từ tích cực (đúng `validateCriterion`: ≥ 5 ký tự, khác nhau, không dùng "kém", "lười"…).
 *
 * Bộ mẫu chỉ là gợi ý ban đầu: sau khi áp, mỗi khoá có bộ tiêu chí riêng và sửa độc lập. Phiếu đã phát hành giữ bản chụp cũ.
 * Xem docs/HO-SO-HOC-TAP.md, mục "Tiêu chí theo chương trình".
 */
import { CRITERIA_TEMPLATE_ROBOTICS, type CriterionTemplate } from "./standard.js";

export interface CriteriaTemplateSet {
  id: string;
  name: string;
  /** Dùng cho chương trình nào / độ tuổi nào */
  audience: string;
  criteria: readonly CriterionTemplate[];
}

const G_DESIGN = "Thiết kế & lắp ráp";
const G_CODE = "Lập trình & tư duy";
const G_KNOW = "Kiến thức & kỹ năng";
const G_SOFT = "Thái độ & kỹ năng mềm";

const T = (name: string, groupName: string, description: string, l: [string, string, string, string]): CriterionTemplate => ({ name, groupName, description, levelDescriptors: l });

const TEAMWORK = T("Hợp tác nhóm", G_SOFT, "Chia việc, lắng nghe và hỗ trợ bạn", [
  "Đang làm quen làm việc cùng bạn; thường làm riêng phần của mình.",
  "Tham gia việc chung khi được thầy cô nhắc và phân công.",
  "Chủ động chia việc, lắng nghe ý kiến và cùng bạn hoàn thành sản phẩm.",
  "Điều phối nhóm, động viên và hướng dẫn được bạn còn chậm.",
]);
const PRESENT = T("Trình bày sản phẩm", G_SOFT, "Giới thiệu sản phẩm, cách hoạt động trước lớp", [
  "Giới thiệu được tên sản phẩm khi thầy cô hỏi.",
  "Kể được sản phẩm làm gì khi có câu hỏi gợi ý.",
  "Tự tin giới thiệu sản phẩm và cách nó hoạt động trước lớp.",
  "Trình bày mạch lạc, trả lời được câu hỏi của bạn và nêu ý tưởng cải tiến.",
]);

export const CRITERIA_TEMPLATE_PROGRAMMING: readonly CriterionTemplate[] = [
  T("Tư duy thuật toán", G_CODE, "Chia việc thành các bước, dùng tuần tự – lặp – rẽ nhánh", [
    "Nhận ra thứ tự các bước khi thầy cô làm mẫu từng lệnh.",
    "Sắp xếp được các bước theo mẫu khi có gợi ý.",
    "Tự chia bài toán thành các bước và dùng đúng tuần tự, vòng lặp hoặc điều kiện của bài.",
    "Tìm được cách gọn hơn (hàm, biến, vòng lặp lồng) và giải thích vì sao cách đó tốt hơn.",
  ]),
  T("Viết & chạy chương trình", G_CODE, "Ghép khối lệnh / viết mã chạy đúng yêu cầu", [
    "Kéo thả hoặc gõ được lệnh đơn giản khi thầy cô làm mẫu.",
    "Hoàn thành chương trình theo mẫu khi được chỉ chỗ khó.",
    "Tự viết chương trình chạy đúng yêu cầu của bài.",
    "Thêm tính năng ngoài yêu cầu; mã gọn, đặt tên dễ hiểu.",
  ]),
  T("Gỡ lỗi", G_CODE, "Tìm và sửa lỗi khi chương trình chạy sai", [
    "Nhận ra chương trình chạy chưa đúng; cần thầy cô chỉ chỗ lỗi.",
    "Tìm được lỗi khi thầy cô gợi ý nên kiểm tra đoạn nào.",
    "Tự chạy thử từng phần để tìm và sửa lỗi của chương trình.",
    "Giải thích được nguyên nhân lỗi, sửa gọn và chia sẻ cách tránh lỗi cho bạn.",
  ]),
  T("Dự án sáng tạo", G_CODE, "Biến ý tưởng của mình thành sản phẩm chạy được", [
    "Làm theo dự án mẫu; bắt đầu nói được mình muốn thay đổi điều gì.",
    "Thay đổi được vài chi tiết của dự án mẫu khi có gợi ý.",
    "Tự lên ý tưởng và hoàn thành một dự án nhỏ của riêng mình.",
    "Dự án có ý tưởng độc đáo, nhiều tính năng và được bạn khác muốn thử.",
  ]),
  TEAMWORK,
  PRESENT,
];

export const CRITERIA_TEMPLATE_STEAM_KIDS: readonly CriterionTemplate[] = [
  T("Khám phá & tò mò", G_KNOW, "Đặt câu hỏi, thử và quan sát điều xảy ra", [
    "Quan sát khi thầy cô làm; bắt đầu chạm vào và thử đồ dùng.",
    "Thử theo gợi ý và kể lại điều mình thấy.",
    "Tự thử, quan sát và nói được điều mình khám phá.",
    "Hay đặt câu hỏi hay, tự thử nhiều cách và kể lại cho bạn nghe.",
  ]),
  T("Lắp ráp theo mẫu", G_DESIGN, "Chọn và ghép chi tiết theo hình hướng dẫn", [
    "Nhận biết các khối chính; ghép từng bước cùng thầy cô.",
    "Ghép được theo hình khi thầy cô chỉ bước khó.",
    "Tự ghép đúng và chắc chắn mô hình của bài.",
    "Ghép nhanh, chắc và thêm được chi tiết trang trí hoặc cải tiến riêng.",
  ]),
  T("Phối hợp tay – mắt", G_DESIGN, "Cầm, xoay, lắp khít các chi tiết nhỏ", [
    "Cầm được chi tiết; cần thầy cô giúp lắp khít.",
    "Lắp được các chi tiết lớn, chi tiết nhỏ cần hỗ trợ.",
    "Tự lắp khít cả chi tiết nhỏ.",
    "Thao tác khéo léo, nhanh và giúp bạn lắp chi tiết khó.",
  ]),
  T("Chơi cùng bạn", G_SOFT, "Chia sẻ đồ dùng, chờ đến lượt, giúp bạn", [
    "Đang làm quen chơi cùng bạn; thích tự chơi một mình.",
    "Chia sẻ đồ dùng và chờ đến lượt khi được nhắc.",
    "Tự chia sẻ, chờ lượt và cùng bạn hoàn thành mô hình.",
    "Chủ động rủ bạn, giúp bạn và động viên cả nhóm.",
  ]),
  T("Tập trung & hoàn thành", G_SOFT, "Theo dõi bài và làm xong sản phẩm", [
    "Tập trung trong thời gian ngắn; cần thầy cô nhắc quay lại bài.",
    "Theo được phần lớn buổi học khi được nhắc.",
    "Tập trung suốt buổi và hoàn thành sản phẩm của bài.",
    "Hoàn thành sớm và tự đặt thêm thử thách cho mình.",
  ]),
];

export const CRITERIA_TEMPLATE_AI_DATA: readonly CriterionTemplate[] = [
  T("Hiểu khái niệm AI & dữ liệu", G_KNOW, "Giải thích được ý nghĩa của khái niệm trong bài", [
    "Nhận ra thuật ngữ của bài khi thầy cô giải thích có ví dụ.",
    "Nhắc lại được ý chính khi có câu hỏi gợi ý.",
    "Tự giải thích được khái niệm của bài bằng lời của mình và lấy được ví dụ.",
    "Liên hệ được với ví dụ ngoài đời, so sánh các khái niệm với nhau.",
  ]),
  T("Thu thập & xử lý dữ liệu", G_CODE, "Chuẩn bị, làm sạch và sắp xếp dữ liệu", [
    "Làm theo thầy cô để nhập và xem dữ liệu mẫu.",
    "Thu thập và sắp xếp dữ liệu theo mẫu khi có gợi ý.",
    "Tự thu thập, làm sạch và sắp xếp dữ liệu cho bài.",
    "Phát hiện dữ liệu sai hoặc thiếu và tự đề xuất cách xử lý.",
  ]),
  T("Huấn luyện & thử mô hình", G_CODE, "Dùng công cụ để huấn luyện và kiểm tra mô hình", [
    "Quan sát thầy cô huấn luyện mô hình mẫu.",
    "Huấn luyện được mô hình theo hướng dẫn từng bước.",
    "Tự huấn luyện và thử mô hình cho yêu cầu của bài.",
    "Thử nhiều cấu hình, so sánh kết quả và chọn cấu hình tốt nhất.",
  ]),
  T("Đánh giá & cải tiến", G_CODE, "Đọc kết quả, tìm nguyên nhân sai và cải tiến", [
    "Đọc được kết quả đúng / sai của mô hình khi thầy cô chỉ.",
    "Chỉ ra được vài trường hợp mô hình đoán sai khi có gợi ý.",
    "Tự tìm ra trường hợp sai và thử cải tiến mô hình.",
    "Giải thích nguyên nhân sai và cải tiến có kiểm chứng bằng số liệu.",
  ]),
  T("An toàn & đạo đức số", G_SOFT, "Dùng AI và dữ liệu có trách nhiệm", [
    "Nghe và nhắc lại quy tắc bảo vệ thông tin cá nhân.",
    "Áp dụng quy tắc an toàn khi được nhắc.",
    "Tự áp dụng quy tắc an toàn và tôn trọng bản quyền khi làm bài.",
    "Giải thích được rủi ro của AI và hướng dẫn bạn dùng an toàn.",
  ]),
  PRESENT,
];

/** Các bộ mẫu — thứ tự hiển thị trong màn chọn */
export const CRITERIA_TEMPLATE_SETS: readonly CriteriaTemplateSet[] = [
  { id: "robotics", name: "Robotics & lập trình robot", audience: "Lớp robot lắp ráp + lập trình (tiểu học – THCS)", criteria: CRITERIA_TEMPLATE_ROBOTICS },
  { id: "lap-trinh", name: "Lập trình (Scratch / Python)", audience: "Lớp lập trình thuần phần mềm, dự án sáng tạo", criteria: CRITERIA_TEMPLATE_PROGRAMMING },
  { id: "steam-nhi", name: "STEAM cho bé nhỏ", audience: "Bé 5–8 tuổi: khám phá, lắp ráp, chơi cùng bạn", criteria: CRITERIA_TEMPLATE_STEAM_KIDS },
  { id: "ai-du-lieu", name: "AI & dữ liệu", audience: "THCS – THPT: dữ liệu, mô hình, đạo đức số", criteria: CRITERIA_TEMPLATE_AI_DATA },
];

export function criteriaTemplateById(id: string | null | undefined): CriteriaTemplateSet | null {
  return CRITERIA_TEMPLATE_SETS.find((t) => t.id === (id ?? "robotics")) ?? null;
}

/**
 * Chọn các tiêu chí cần thêm vào khoá đang có: bỏ tiêu chí đã có cùng tên (không phân biệt hoa thường, dấu cách thừa)
 * để áp bộ mẫu / sao chép từ khoá khác nhiều lần không nhân đôi.
 */
export function newCriteriaOnly<T extends { name: string }>(existingNames: readonly string[], incoming: readonly T[]): T[] {
  const key = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const have = new Set(existingNames.map(key));
  const out: T[] = [];
  for (const c of incoming) {
    const k = key(c.name);
    if (have.has(k)) continue;
    have.add(k);
    out.push(c);
  }
  return out;
}
