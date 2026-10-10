/**
 * MẪU LANDING — điểm khởi đầu để quản trị chọn rồi sửa chữ / ảnh / thứ tự khối.
 *
 * Nội dung mẫu cố ý KHÔNG có con số thành tích, giá, phần thưởng hay lời của phụ huynh: những thứ đó phải do trung tâm
 * nhập số THẬT (khối trống tự ẩn). Chỉ có câu chữ mô tả chung, sửa thoải mái.
 */
import { emptySection, type LandingDoc, type LandingSection, type LandingVariant, type SectionType } from "./model.js";

export interface LandingTemplate {
  key: string;
  label: string;
  desc: string;
  variant: LandingVariant;
  build(): LandingDoc;
}

function sec(type: SectionType, id: string, data: Record<string, string> = {}, lists: Record<string, Record<string, string>[]> = {}, enabled = true): LandingSection {
  const s = emptySection(type, id);
  return { ...s, enabled, data: { ...s.data, ...data }, lists: { ...s.lists, ...lists } };
}

const HEADER = (extraNav: Record<string, string>[] = []) => sec("header", "header", { ctaLabel: "Học thử miễn phí", ctaUrl: "#dang-ky" }, { nav: extraNav });
const FOOTER = () => sec("footer", "footer", { tagline: "Học lập trình robot vui, hiểu bài, tự tin sáng tạo.", copyright: "" }, {
  addresses: [],
  links: [{ label: "Chính sách bảo mật", href: "https://satarobo.vn/chinh-sach-bao-mat" }],
});

const FAQ_ITEMS = [
  { q: "Con mấy tuổi có thể học?", a: "Chương trình dành cho bé từ lớp 1 trở lên. Khi học thử, giáo viên sẽ đánh giá để xếp bé vào cấp độ phù hợp." },
  { q: "Học thử có mất phí không?", a: "Buổi học thử miễn phí, không ràng buộc đăng ký." },
  { q: "Mỗi lớp có bao nhiêu bé?", a: "Lớp nhỏ để giáo viên theo sát từng bé. Số bé tối đa mỗi lớp được ghi rõ khi tư vấn." },
  { q: "Làm sao theo dõi con học thế nào?", a: "Phụ huynh nhận nhận xét sau buổi học và học bạ theo mốc, kèm ảnh hoạt động của lớp (khi gia đình đồng ý)." },
  { q: "Học phí và lịch khai giảng ở đâu?", a: "Trung tâm sẽ gửi bảng học phí, lịch học theo cơ sở sau khi gọi tư vấn." },
];

export const LANDING_TEMPLATES: readonly LandingTemplate[] = [
  {
    key: "phu-huynh-tin-cay", label: "Đầy đủ — thuyết phục phụ huynh", variant: "classic",
    desc: "Trang dài: mở đầu, cam kết, chương trình, quy trình, phản hồi, hỏi đáp, form. Hợp trang chủ và quảng cáo thương hiệu.",
    build: () => ({
      sections: [
        HEADER([{ label: "Cam kết", href: "#cam-ket" }, { label: "Khoá học", href: "#khoa-hoc" }, { label: "Hỏi đáp", href: "#hoi-dap" }]),
        sec("hero", "hero", {
          eyebrow: "Học thử miễn phí", title: "Lập trình Robot cùng con từ tuổi tiểu học",
          subtitle: "Lớp nhỏ, giáo viên theo sát từng bé. Con làm ra sản phẩm thật sau mỗi buổi và phụ huynh luôn biết con tiến bộ thế nào.",
          primaryLabel: "Đặt buổi học thử", primaryUrl: "#dang-ky", secondaryLabel: "Xem khoá học", secondaryUrl: "#khoa-hoc",
        }, { badges: [{ text: "Lớp nhỏ, theo sát từng bé" }, { text: "Học thử miễn phí" }, { text: "Nhận xét sau mỗi buổi" }] }),
        sec("stats", "stats", { title: "" }, { items: [] }, false),
        sec("features", "features", { title: "Vì sao phụ huynh chọn chúng tôi", intro: "Những điều chúng tôi cam kết với mỗi gia đình." }, {
          items: [
            { title: "Lớp nhỏ, giáo viên theo sát", text: "Mỗi bé được hướng dẫn trực tiếp, không bị bỏ lại phía sau." },
            { title: "Học qua làm, ra sản phẩm", text: "Lắp ráp và lập trình robot thật, bé tự tay hoàn thành dự án của mình." },
            { title: "Phụ huynh nắm tiến bộ của con", text: "Nhận xét sau buổi học, học bạ theo mốc và ảnh hoạt động của lớp." },
            { title: "Lộ trình rõ ràng", text: "Từ làm quen đến nâng cao, bé học đúng cấp độ của mình." },
          ],
        }),
        sec("programs", "programs", { title: "Chương trình học", intro: "Chọn hình thức phù hợp với con." }, {
          items: [
            { name: "Lập trình Robot", badge: "Học tại trung tâm", text: "Lắp ráp và lập trình robot cùng giáo viên, học theo lộ trình từng cấp độ.", meta: "", price: "", url: "#dang-ky", linkLabel: "Đặt học thử", image: "" },
            { name: "Luyện thi RoboSim", badge: "Học online", text: "Ôn luyện theo thể lệ cuộc thi, thực hành mô phỏng robot trên máy tính.", meta: "", price: "", url: "#dang-ky", linkLabel: "Đặt học thử", image: "" },
          ],
        }),
        sec("steps", "steps", { title: "Bắt đầu thế nào?", intro: "" }, {
          items: [
            { title: "Để lại thông tin", text: "Trung tâm gọi lại tư vấn trong giờ làm việc." },
            { title: "Học thử cùng giáo viên", text: "Bé trải nghiệm một buổi học thật, miễn phí." },
            { title: "Xếp lớp phù hợp", text: "Gia đình chọn lịch và cấp độ sau khi xem bé học." },
          ],
        }),
        sec("testimonials", "testimonials", { title: "Phụ huynh nói gì" }, { items: [] }, false),
        sec("cta", "cta", { title: "Cho con trải nghiệm một buổi học thử", text: "Miễn phí, không ràng buộc. Giữ chỗ chỉ mất một phút.", primaryLabel: "Đặt buổi học thử", primaryUrl: "#dang-ky", secondaryLabel: "", secondaryUrl: "" }, { points: [{ text: "Miễn phí" }, { text: "Không ràng buộc" }, { text: "Giáo viên tư vấn trực tiếp" }] }),
        sec("faq", "faq", { title: "Câu hỏi thường gặp" }, { items: FAQ_ITEMS }),
        sec("form", "form", { title: "Đặt buổi học thử miễn phí", subtitle: "Để lại thông tin, trung tâm sẽ gọi lại sớm trong giờ làm việc.", thankYou: "Cảm ơn bạn! Trung tâm sẽ gọi lại trong giờ làm việc." }),
        FOOTER(),
      ],
    }),
  },
  {
    key: "mot-man-hinh", label: "Gọn — ngắn, dễ đọc trên điện thoại", variant: "soft",
    desc: "Mở đầu, 3 lợi ích, form, vài câu hỏi. Hợp trang đích của quảng cáo Facebook / Zalo.",
    build: () => ({
      sections: [
        HEADER(),
        sec("hero", "hero", {
          eyebrow: "Dành cho bé từ lớp 1", title: "Con học robot, mê sáng tạo",
          subtitle: "Một buổi học thử miễn phí để xem con có hợp không.", primaryLabel: "Đặt buổi học thử", primaryUrl: "#dang-ky", secondaryLabel: "", secondaryUrl: "",
        }, { badges: [{ text: "Miễn phí" }, { text: "Lớp nhỏ" }] }),
        sec("features", "features", { title: "Con nhận được gì", intro: "" }, {
          items: [
            { title: "Tự tay làm robot", text: "Lắp ráp và lập trình, có sản phẩm mang về." },
            { title: "Tư duy và tự tin", text: "Học cách giải quyết vấn đề, trình bày ý tưởng." },
            { title: "Ba mẹ yên tâm", text: "Nhận xét và ảnh lớp học sau mỗi buổi." },
          ],
        }),
        sec("form", "form", { title: "Đặt buổi học thử miễn phí", subtitle: "Trung tâm gọi lại để chọn giờ phù hợp.", thankYou: "Cảm ơn bạn! Trung tâm sẽ gọi lại sớm." }),
        sec("faq", "faq", { title: "Ba mẹ hay hỏi" }, { items: FAQ_ITEMS.slice(0, 3) }),
        FOOTER(),
      ],
    }),
  },
  {
    key: "chien-dich-hoc-thu", label: "Chiến dịch — nổi bật, kêu gọi mạnh", variant: "bold",
    desc: "Băng màu đậm, lịch/mốc chiến dịch, dải kêu gọi và form. Hợp sự kiện, khai giảng, ưu đãi có thời hạn.",
    build: () => ({
      sections: [
        HEADER(),
        sec("hero", "hero", {
          eyebrow: "Sự kiện học thử", title: "Một buổi học robot cho bé — miễn phí",
          subtitle: "Ghi rõ thời gian, địa điểm và ưu đãi (nếu có) của chiến dịch này ở đây.", primaryLabel: "Giữ chỗ ngay", primaryUrl: "#dang-ky", secondaryLabel: "", secondaryUrl: "",
        }, { badges: [] }),
        sec("timeline", "timeline", { title: "Lịch sự kiện", intro: "" }, { items: [] }, false),
        sec("steps", "steps", { title: "Tham gia thế nào?", intro: "" }, {
          items: [
            { title: "Giữ chỗ", text: "Điền form, trung tâm xác nhận qua điện thoại." },
            { title: "Đến lớp", text: "Bé học thử cùng giáo viên, ba mẹ quan sát." },
            { title: "Nhận tư vấn", text: "Trao đổi lộ trình phù hợp với bé." },
          ],
        }),
        sec("cta", "cta", { title: "Số chỗ có hạn — giữ chỗ cho con hôm nay", text: "", primaryLabel: "Giữ chỗ ngay", primaryUrl: "#dang-ky", secondaryLabel: "", secondaryUrl: "" }, { points: [] }),
        sec("form", "form", { title: "Giữ chỗ học thử", subtitle: "", thankYou: "Cảm ơn bạn! Trung tâm sẽ gọi xác nhận sớm." }),
        FOOTER(),
      ],
    }),
  },
];

export function landingTemplateByKey(key: string | null | undefined): LandingTemplate | null {
  return LANDING_TEMPLATES.find((t) => t.key === key) ?? null;
}
