/**
 * TRANG CHỦ NGƯỜI DÙNG — bản chữ "kaizen" (cải tiến liên tục) dựa trên satarobo.vn hiện tại.
 *
 * Cách làm: giữ thông tin THẬT của trang cũ (cơ sở, hotline, chương trình, học thử 1-1, lớp tối đa 12 bé…), bỏ phần lặp
 * (20 thẻ phản hồi lặp 4 lần, hai danh sách chân trang), bỏ chữ giữ chỗ (0+, ≤0, 0.000.000đ) và các khẳng định
 * mâu thuẫn / chưa có nguồn (độc quyền, duy nhất, tư vấn 24/7, ban tổ chức cuộc thi, hạn hoàn tiền Sata8).
 *
 * Quyết định của chủ dự án (10/10/2026): giữ nguyên số liệu như trang cũ (1000+ học viên, 98%, 50+ giải, 4,9/5)
 * và KHÔNG nêu chính sách hoàn tiền trên trang chủ. Phản hồi phụ huynh để tắt cho tới khi có lời thật, được phép đăng.
 *
 * Mỗi lần cải tiến: sửa chữ trong Website → Landing page → "Trang chủ" rồi Xuất bản; hoặc sửa ở đây cho lần dựng sau.
 */
import { emptySection, type LandingDoc, type LandingSection, type SectionType } from "./model.js";

function sec(type: SectionType, id: string, data: Record<string, string> = {}, lists: Record<string, Record<string, string>[]> = {}, enabled = true): LandingSection {
  const s = emptySection(type, id);
  return { ...s, enabled, data: { ...s.data, ...data }, lists: { ...s.lists, ...lists } };
}

export const HOME_PAGE = {
  slug: "trang-chu",
  title: "Trang chủ Sata Robo",
  template: "trang-chu-satarobo",
  variant: "classic" as const,
  seoTitle: "Sata Robo — Lập trình Robot & AI cho bé tại Đà Nẵng",
  seoDescription: "Trung tâm STEM tại Đà Nẵng: lập trình robot cho bé lớp 1–8, lớp tối đa 12 học viên, luyện thi RoboSim. Đặt buổi học thử 1-1 miễn phí.",
  build(): LandingDoc {
    return {
      sections: [
        sec("header", "header", { phone: "0837 312 860", ctaLabel: "Học thử 1-1 miễn phí", ctaUrl: "#dang-ky" }, {
          nav: [{ label: "Vì sao chọn Sata Robo", href: "#cam-ket" }, { label: "Khoá học", href: "#khoa-hoc" }, { label: "Cách bắt đầu", href: "#quy-trinh" }, { label: "Hỏi đáp", href: "#hoi-dap" }],
        }),
        sec("hero", "hero", {
          eyebrow: "Trung tâm STEM · Robotics & AI tại Đà Nẵng",
          title: "Lập trình Robot cùng con, từ tuổi tiểu học",
          subtitle: "Lớp tối đa 12 bé, giáo viên kèm từng em. Con tự tay lắp ráp và lập trình robot thật; ba mẹ nhìn thấy con tiến bộ qua từng buổi học.",
          primaryLabel: "Đặt buổi học thử 1-1 miễn phí", primaryUrl: "#dang-ky",
          secondaryLabel: "Xem các khoá học", secondaryUrl: "#khoa-hoc",
        }, { badges: [{ text: "2 cơ sở tại Đà Nẵng và lớp Online" }, { text: "Lớp tối đa 12 học viên" }, { text: "Học thử 1-1 miễn phí" }] }),
        sec("stats", "stats", { title: "" }, {
          items: [
            { value: "1000+", label: "Học viên đã theo học" },
            { value: "98%", label: "Phụ huynh cho con học tiếp khoá sau" },
            { value: "50+", label: "Giải thưởng của học viên" },
            { value: "4,9/5", label: "Điểm đánh giá của phụ huynh" },
          ],
        }),
        sec("features", "features", { title: "Vì sao phụ huynh chọn Sata Robo", intro: "Bốn điều chúng tôi làm để con vừa vui, vừa thật sự học được." }, {
          items: [
            { title: "Lớp nhỏ, kèm từng em", text: "Mỗi lớp tối đa 12 học viên nên giáo viên nhìn thấy từng bé đang vướng ở đâu và hướng dẫn kịp thời." },
            { title: "Học thử 1-1 trước khi quyết định", text: "Bé làm bài kiểm tra đầu vào 45 phút rồi học 1-1 cùng giáo viên 90 phút. Ba mẹ xem con học thật, rồi mới chọn lộ trình." },
            { title: "Có sản phẩm, có buổi trình bày", text: "Bé lắp ráp và lập trình robot thật. Cuối mỗi 12 buổi, bé thuyết trình sản phẩm của mình trước phụ huynh." },
            { title: "Lộ trình từ lớp 1 đến lớp 8", text: "Mỗi bé học đúng cấp độ của mình; các gói lớp 3–8 có thêm phần AI. Bé muốn thi đấu có lớp luyện thi RoboSim." },
          ],
        }),
        sec("programs", "programs", { title: "Các khoá học", intro: "Học tại trung tâm hoặc học online. Giáo viên sẽ gợi ý khoá phù hợp sau buổi học thử." }, {
          items: [
            { name: "Lập trình Robot chuyên sâu", badge: "Tại trung tâm", text: "Lắp ráp và lập trình robot theo lộ trình, từ làm quen đến nâng cao. Học cùng giáo viên trong lớp nhỏ.", meta: "Lớp 1–8", price: "", url: "#dang-ky", linkLabel: "Đặt học thử", image: "" },
            { name: "Luyện thi cuộc thi Robotics", badge: "Tại trung tâm", text: "Ôn luyện bài bản cho cuộc thi Sáng tạo Robotics 2026, thực hành trên RoboSim cùng giáo viên.", meta: "Lớp 3–8", price: "", url: "#dang-ky", linkLabel: "Đặt học thử", image: "" },
            { name: "Luyện thi RoboSim online", badge: "Học online", text: "Tự học linh hoạt trên nền tảng SataWorld, có hướng dẫn giải đề vòng loại 2026.", meta: "Lớp 3–8", price: "", url: "#dang-ky", linkLabel: "Tư vấn khoá online", image: "" },
          ],
        }),
        sec("steps", "steps", { title: "Bắt đầu thật đơn giản", intro: "Bốn bước, ba mẹ không cần chuẩn bị gì thêm." }, {
          items: [
            { title: "Để lại thông tin hoặc gọi hotline", text: "Trung tâm gọi lại tư vấn trong giờ làm việc và hẹn giờ phù hợp." },
            { title: "Kiểm tra đầu vào 45 phút", text: "Giáo viên tìm hiểu bé đã biết gì để xếp đúng cấp độ." },
            { title: "Học 1-1 với giáo viên 90 phút", text: "Bé trải nghiệm một buổi học thật; ba mẹ quan sát và trao đổi." },
            { title: "Chọn lớp và lịch học", text: "Gia đình chọn cơ sở, khung giờ và khoá học sau khi xem bé học." },
          ],
        }),
        sec("testimonials", "testimonials", { title: "Phụ huynh nói gì" }, { items: [] }, false),
        sec("cta", "cta", {
          title: "Cho con một buổi học thử 1-1, miễn phí",
          text: "Ba mẹ xem con học thật, rồi quyết định. Chỉ mất một phút để giữ chỗ.",
          primaryLabel: "Đặt buổi học thử", primaryUrl: "#dang-ky", secondaryLabel: "Gọi 0837 312 860", secondaryUrl: "tel:0837312860",
        }, { points: [{ text: "Miễn phí" }, { text: "Học 1-1 với giáo viên" }, { text: "Hai cơ sở tại Đà Nẵng" }] }),
        sec("faq", "faq", { title: "Câu hỏi ba mẹ hay hỏi" }, {
          items: [
            { q: "Con mấy tuổi thì học được?", a: "Chương trình dành cho học sinh từ lớp 1 đến lớp 8 (khoảng 6–14 tuổi). Sau buổi học thử, giáo viên sẽ xếp bé vào cấp độ phù hợp." },
            { q: "Buổi học thử gồm những gì, có mất phí không?", a: "Miễn phí. Bé làm bài kiểm tra đầu vào 45 phút, sau đó học 1-1 với giáo viên 90 phút. Ba mẹ có thể quan sát và trao đổi cùng giáo viên." },
            { q: "Học phí bao nhiêu?", a: "Học phí tuỳ khoá và số buổi, nên trung tâm gửi bảng học phí chi tiết khi tư vấn. Khoá 48 buổi có thể trả góp 0% qua VPBank, Sacombank hoặc Home Credit." },
            { q: "Con lớp mấy thì học gói nào?", a: "Sata3 dành cho lớp 1–2; Sata4 đến Sata7 dành cho lớp 3–8 và có thêm phần AI; Sata1–Sata2 là các khoá luyện thi ngắn hạn. Giáo viên sẽ tư vấn gói đúng với bé." },
            { q: "Bé có thể thi đấu robot không?", a: "Có. Trung tâm có lớp luyện thi cho học sinh lớp 3–8 và khoá luyện thi RoboSim online, kèm hướng dẫn giải đề vòng loại 2026." },
            { q: "Trung tâm ở đâu?", a: "Cơ sở 1: 211 Nguyễn Hữu Thọ, Đà Nẵng. Cơ sở 2: 114 Hoàng Diệu, Đà Nẵng. Ngoài ra có khoá học online." },
            { q: "Làm sao biết con học thế nào?", a: "Phụ huynh nhận nhận xét sau buổi học và học bạ theo mốc; cuối mỗi 12 buổi bé thuyết trình sản phẩm trước ba mẹ." },
          ],
        }),
        sec("form", "form", {
          title: "Đặt buổi học thử 1-1 miễn phí",
          subtitle: "Để lại thông tin, trung tâm sẽ gọi lại tư vấn trong giờ làm việc.",
          thankYou: "Cảm ơn ba mẹ! Trung tâm sẽ gọi lại trong giờ làm việc để hẹn buổi học thử.",
        }),
        sec("footer", "footer", {
          tagline: "Học lập trình robot vui, hiểu bài, tự tin sáng tạo — tại Đà Nẵng và online.",
          email: "thongtin@satarobo.vn", phone: "0837 312 860",
          legal: "Công ty Cổ phần Công nghệ Giáo dục Sata Robo · Mã số doanh nghiệp 0402301783",
          copyright: "© 2026 Sata Robo",
        }, {
          addresses: [{ label: "Cơ sở 1", text: "211 Nguyễn Hữu Thọ, Đà Nẵng" }, { label: "Cơ sở 2", text: "114 Hoàng Diệu, Đà Nẵng" }],
          links: [{ label: "Chính sách bảo mật", href: "https://satarobo.vn/chinh-sach-bao-mat" }],
        }),
      ],
    };
  },
};
