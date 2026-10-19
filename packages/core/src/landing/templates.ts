/**
 * MẪU LANDING — điểm khởi đầu để quản trị chọn rồi sửa chữ / ảnh / thứ tự khối.
 *
 * Nội dung mẫu cố ý KHÔNG có con số thành tích, giá, phần thưởng hay lời của phụ huynh: những thứ đó phải do trung tâm
 * nhập số THẬT (khối trống tự ẩn). Chỉ có câu chữ mô tả chung, sửa thoải mái.
 */
import { SITE_TEMPLATES } from "../site/demo.js";
import { COMMON_FAQ, trackCards } from "../site/thsteam-content.js";
import { TH_BRAND } from "../system/th-brand.js";
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

const HEADER = (extraNav: Record<string, string>[] = []) => sec("header", "header", { phone: TH_BRAND.hotline, ctaLabel: "Học trải nghiệm 1:1", ctaUrl: "#dang-ky" }, { nav: extraNav });
const FOOTER = () => sec("footer", "footer", { tagline: `${TH_BRAND.tagline} — ${TH_BRAND.taglineVi}.`, phone: TH_BRAND.hotline, legal: TH_BRAND.legalName, copyright: `© 2026 ${TH_BRAND.name}` }, {
  addresses: [{ label: "Hình thức học", text: "Online qua ClassIn" }],
  links: [{ label: "Điều khoản đăng ký học", href: "/chinh-sach/dieu-khoan" }, { label: "Chính sách bảo mật", href: "/chinh-sach/bao-mat" }],
});

const FAQ_ITEMS = COMMON_FAQ.slice(0, 5);

export const LANDING_TEMPLATES: readonly LandingTemplate[] = [
  {
    key: "phu-huynh-tin-cay", label: "Đầy đủ — thuyết phục phụ huynh", variant: "classic",
    desc: "Trang dài: mở đầu, cam kết, chương trình, quy trình, phản hồi, hỏi đáp, form. Hợp trang chủ và quảng cáo thương hiệu.",
    build: () => ({
      sections: [
        HEADER([{ label: "Cam kết", href: "#cam-ket" }, { label: "Khoá học", href: "#khoa-hoc" }, { label: "Hỏi đáp", href: "#hoi-dap" }]),
        sec("hero", "hero", {
          eyebrow: "Học online qua ClassIn", title: "Con làm chủ công nghệ cùng giáo viên",
          subtitle: "Lớp nhỏ 6–8 học sinh, giáo viên dạy trực tiếp. Mỗi học phần con tự làm dự án và báo cáo trước bố mẹ.",
          primaryLabel: "Đăng ký học trải nghiệm 1:1", primaryUrl: "#dang-ky", secondaryLabel: "Xem chuyên ngành", secondaryUrl: "#khoa-hoc",
        }, { badges: [{ text: "Lớp nhóm 6–8 học sinh" }, { text: "Học trải nghiệm 1:1" }, { text: "Báo cáo sau mỗi học phần" }] }),
        sec("stats", "stats", { title: "" }, { items: [] }, false),
        sec("features", "features", { title: "Vì sao phụ huynh chọn chúng tôi", intro: "Những điều chúng tôi cam kết với mỗi gia đình." }, {
          items: [
            { title: "Lớp nhỏ, giáo viên theo sát", text: "Lớp 6–8 học sinh, giáo viên sửa bài cho từng bạn." },
            { title: "Học qua làm, ra sản phẩm", text: "Mỗi buổi con làm một sản phẩm; cuối học phần con tự làm dự án của mình." },
            { title: "Phụ huynh nắm tiến bộ của con", text: "Nhóm Zalo lớp, hồ sơ công nghệ và phiếu đánh giá sau mỗi học phần." },
            { title: "Lộ trình rõ ràng", text: "Mỗi năm học 3 học phần Basic → Advanced → Expert." },
          ],
        }),
        sec("programs", "programs", { title: "Chương trình học", intro: "Chọn hình thức phù hợp với con." }, {
          items: trackCards().map((c) => ({ ...c, url: "#dang-ky", linkLabel: "Đăng ký học trải nghiệm", image: "" })),
        }),
        sec("steps", "steps", { title: "Bắt đầu thế nào?", intro: "" }, {
          items: [
            { title: "Để lại thông tin", text: "Trung tâm liên hệ lại tư vấn trong giờ làm việc." },
            { title: "Học trải nghiệm 1:1", text: "Con học một buổi 1:1 cùng giáo viên qua ClassIn." },
            { title: "Xếp lớp phù hợp", text: "Gia đình chọn chương trình và lịch học sau buổi trải nghiệm." },
          ],
        }),
        sec("testimonials", "testimonials", { title: "Phụ huynh nói gì" }, { items: [] }, false),
        sec("cta", "cta", { title: "Cho con học trải nghiệm 1:1 cùng giáo viên", text: "Giữ chỗ chỉ mất một phút.", primaryLabel: "Đăng ký học trải nghiệm", primaryUrl: "#dang-ky", secondaryLabel: "", secondaryUrl: "" }, { points: [{ text: "Học online tại nhà" }, { text: "Giáo viên tư vấn trực tiếp" }] }),
        sec("faq", "faq", { title: "Câu hỏi thường gặp" }, { items: FAQ_ITEMS }),
        sec("form", "form", { title: "Đăng ký học trải nghiệm 1:1", subtitle: "Để lại thông tin, trung tâm sẽ liên hệ lại trong giờ làm việc.", thankYou: "Cảm ơn bạn! Trung tâm sẽ liên hệ lại trong giờ làm việc." }),
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
          eyebrow: "Dành cho học sinh 8–18 tuổi", title: "Con học công nghệ, mê sáng tạo",
          subtitle: "Một buổi học trải nghiệm 1:1 để xem con hợp chuyên ngành nào.", primaryLabel: "Đăng ký học trải nghiệm", primaryUrl: "#dang-ky", secondaryLabel: "", secondaryUrl: "",
        }, { badges: [{ text: "Học online" }, { text: "Lớp nhỏ" }] }),
        sec("features", "features", { title: "Con nhận được gì", intro: "" }, {
          items: [
            { title: "Tự tay làm sản phẩm", text: "Robot ảo, game, app, thiết kế 3D… sau mỗi buổi học." },
            { title: "Tư duy và tự tin", text: "Học cách giải quyết vấn đề, trình bày ý tưởng." },
            { title: "Ba mẹ yên tâm", text: "Ảnh, video sản phẩm và nhận xét trong nhóm Zalo lớp." },
          ],
        }),
        sec("form", "form", { title: "Đăng ký học trải nghiệm 1:1", subtitle: "Trung tâm liên hệ lại để chọn giờ phù hợp.", thankYou: "Cảm ơn bạn! Trung tâm sẽ liên hệ lại sớm." }),
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
          eyebrow: "Sự kiện học trải nghiệm", title: "Một buổi học công nghệ cho con",
          subtitle: "Ghi rõ thời gian, địa điểm và ưu đãi (nếu có) của chiến dịch này ở đây.", primaryLabel: "Giữ chỗ ngay", primaryUrl: "#dang-ky", secondaryLabel: "", secondaryUrl: "",
        }, { badges: [] }),
        sec("timeline", "timeline", { title: "Lịch sự kiện", intro: "" }, { items: [] }, false),
        sec("steps", "steps", { title: "Tham gia thế nào?", intro: "" }, {
          items: [
            { title: "Giữ chỗ", text: "Điền form, trung tâm xác nhận qua điện thoại." },
            { title: "Vào lớp ClassIn", text: "Con học cùng giáo viên, ba mẹ quan sát." },
            { title: "Nhận tư vấn", text: "Trao đổi lộ trình phù hợp với con." },
          ],
        }),
        sec("cta", "cta", { title: "Số chỗ có hạn — giữ chỗ cho con hôm nay", text: "", primaryLabel: "Giữ chỗ ngay", primaryUrl: "#dang-ky", secondaryLabel: "", secondaryUrl: "" }, { points: [] }),
        sec("form", "form", { title: "Giữ chỗ học trải nghiệm", subtitle: "", thankYou: "Cảm ơn bạn! Trung tâm sẽ gọi xác nhận sớm." }),
        FOOTER(),
      ],
    }),
  },
];

/** Mẫu trang con của website (khu "Cấu trúc website"): không hiện trong hộp "Tạo landing" nhưng dùng được khi tạo trang theo khoá mẫu */
const SITE_AS_TEMPLATES: readonly LandingTemplate[] = SITE_TEMPLATES.map((t) => ({ key: t.template, label: t.label, desc: t.desc, variant: t.variant, build: t.build }));

export function landingTemplateByKey(key: string | null | undefined): LandingTemplate | null {
  return LANDING_TEMPLATES.find((t) => t.key === key) ?? SITE_AS_TEMPLATES.find((t) => t.key === key) ?? null;
}
