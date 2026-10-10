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
 * Bố cục (10/10/2026): theo thứ tự các phần của trang đích edtech.teky.edu.vn — hero → số liệu → vì sao chọn → khoá học → ưu đãi học thử →
 * giá trị cho gia đình → hành trang cho con → kêu gọi → lộ trình theo lớp → cách bắt đầu → hệ sinh thái → phản hồi phụ huynh → đội ngũ → học viên
 * → hỏi đáp → form. CHỈ học cấu trúc, không chép chữ và không chép các khẳng định của Teky (số 1, chứng chỉ quốc tế, ưu đãi theo tuần…).
 * Ba phần chưa có dữ liệu thật (phản hồi, đội ngũ, học viên tiêu biểu) là chữ mẫu có "[DEMO]"; hệ thống cảnh báo khi xuất bản còn chữ này.
 * Hệ thống chỉ có một form mỗi trang nên các nút "Học thử" ở nhiều phần đều cuộn tới form cuối trang.
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
          secondaryLabel: "Đăng ký tư vấn", secondaryUrl: "#dang-ky",
        }, { badges: [{ text: "2 cơ sở tại Đà Nẵng và lớp Online" }, { text: "Lớp tối đa 12 học viên" }, { text: "Học thử 1-1 miễn phí" }] }),
        sec("stats", "stats", { title: "" }, {
          items: [
            { value: "1000+", label: "Học viên đã theo học" },
            { value: "98%", label: "Phụ huynh cho con học tiếp khoá sau" },
            { value: "50+", label: "Giải thưởng của học viên" },
            { value: "4,9/5", label: "Điểm đánh giá của phụ huynh" },
          ],
        }),
        sec("features", "features", { title: "Vì sao phụ huynh chọn Sata Robo", intro: "Năm điều chúng tôi làm để con vừa vui, vừa thật sự học được." }, {
          items: [
            { title: "Lớp nhỏ, kèm từng em", text: "Mỗi lớp tối đa 12 học viên nên giáo viên nhìn thấy từng bé đang vướng ở đâu và hướng dẫn kịp thời." },
            { title: "Học thử 1-1 trước khi quyết định", text: "Bé làm bài kiểm tra đầu vào 45 phút rồi học 1-1 cùng giáo viên 90 phút. Ba mẹ xem con học thật, rồi mới chọn lộ trình." },
            { title: "Có sản phẩm, có buổi trình bày", text: "Bé lắp ráp và lập trình robot thật. Cuối mỗi 12 buổi, bé thuyết trình sản phẩm của mình trước phụ huynh." },
            { title: "Lộ trình từ lớp 1 đến lớp 8", text: "Mỗi bé học đúng cấp độ của mình; các gói lớp 3–8 có thêm phần AI." },
            { title: "Học tại trung tâm hoặc online", text: "Hai cơ sở tại Đà Nẵng và lớp online, để gia đình chọn hình thức hợp với lịch của bé." },
          ],
        }),
        sec("programs", "programs", { title: "Các khoá học", intro: "Học tại trung tâm hoặc học online. Giáo viên sẽ gợi ý khoá phù hợp sau buổi học thử." }, {
          items: [
            { name: "Lập trình Robot chuyên sâu", badge: "Tại trung tâm", text: "Lắp ráp và lập trình robot theo lộ trình, từ làm quen đến nâng cao. Học cùng giáo viên trong lớp nhỏ.", meta: "Lớp 1–8", price: "", url: "#dang-ky", linkLabel: "Đặt học thử", image: "" },
            { name: "Luyện thi cuộc thi Robotics", badge: "Tại trung tâm", text: "Ôn luyện bài bản cho cuộc thi Sáng tạo Robotics 2026, thực hành trên RoboSim cùng giáo viên.", meta: "Lớp 3–8", price: "", url: "#dang-ky", linkLabel: "Đặt học thử", image: "" },
            { name: "Luyện thi RoboSim online", badge: "Học online", text: "Tự học linh hoạt trên nền tảng SataWorld, có hướng dẫn giải đề vòng loại 2026.", meta: "Lớp 3–8", price: "", url: "#dang-ky", linkLabel: "Tư vấn khoá online", image: "" },
          ],
        }),
        sec("cta", "uu-dai", {
          title: "Một suất học thử 1-1 miễn phí cho con",
          text: "Con làm bài kiểm tra đầu vào rồi học 1-1 với giáo viên; ba mẹ ngồi xem con học thật, chưa cần quyết định gì.",
          primaryLabel: "Đặt suất học thử", primaryUrl: "#dang-ky", secondaryLabel: "Gọi 0837 312 860", secondaryUrl: "tel:0837312860",
        }, { points: [{ text: "Miễn phí" }, { text: "Kiểm tra đầu vào 45 phút" }, { text: "Học 1-1 với giáo viên 90 phút" }] }),
        sec("features", "gia-tri", { title: "Gia đình nhận được gì", intro: "Ngoài giờ học trên lớp, ba mẹ luôn biết con đang học đến đâu." }, {
          items: [
            { title: "Chọn hình thức học linh hoạt", text: "Học tại một trong hai cơ sở hoặc học online, theo lịch phù hợp với gia đình." },
            { title: "Đúng cấp độ của từng bé", text: "Kiểm tra đầu vào để xếp lớp, không để bé học quá dễ hay quá khó." },
            { title: "Thực hành robot thật", text: "Mỗi buổi bé tự tay lắp ráp, lập trình và thử robot của mình." },
            { title: "Nhận xét sau buổi học", text: "Phụ huynh nhận xét của giáo viên sau từng buổi và học bạ theo mốc." },
            { title: "Giáo viên đồng hành", text: "Lớp nhỏ để giáo viên có thời gian trao đổi riêng với từng bé và từng gia đình." },
          ],
        }),
        sec("features", "hanh-trang", { title: "Hành trang con mang theo", intro: "Robot chỉ là phương tiện; điều ở lại với con là cách nghĩ và làm việc." }, {
          items: [
            { title: "Tư duy logic", text: "Chia bài toán lớn thành các bước nhỏ và kiểm tra từng bước." },
            { title: "Kỹ năng lập trình", text: "Từ làm quen đến viết chương trình điều khiển robot; lớp 3–8 có thêm phần AI." },
            { title: "Tự tin trình bày", text: "Mỗi 12 buổi, bé giới thiệu sản phẩm của mình trước phụ huynh." },
            { title: "Trải nghiệm thi đấu", text: "Bé muốn thử sức có lớp luyện thi RoboSim và cuộc thi Sáng tạo Robotics 2026." },
          ],
        }),
        sec("cta", "ket-luan", {
          title: "Cho con bước vào thế giới robot",
          text: "Để lại thông tin, trung tâm gọi lại tư vấn và hẹn buổi học thử trong giờ làm việc.",
          primaryLabel: "Đăng ký ngay", primaryUrl: "#dang-ky",
        }, { points: [{ text: "Hai cơ sở tại Đà Nẵng" }, { text: "Có lớp online" }] }),
        sec("timeline", "lo-trinh", { title: "Lộ trình theo cấp lớp", intro: "Giáo viên xếp bé vào gói phù hợp sau buổi học thử." }, {
          items: [
            { when: "Lớp 1–2", what: "Gói Sata3: bắt đầu làm quen với robot và lập trình", where: "" },
            { when: "Lớp 3–8", what: "Gói Sata4 đến Sata7: nâng dần cấp độ, có thêm phần AI", where: "" },
            { when: "Luyện thi", what: "Gói Sata1–Sata2 ngắn hạn; RoboSim online có hướng dẫn giải đề vòng loại 2026", where: "" },
            { when: "Mỗi 12 buổi", what: "Bé thuyết trình sản phẩm của mình trước phụ huynh", where: "" },
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
        sec("features", "he-sinh-thai", { title: "Nơi con học và ba mẹ theo dõi", intro: "Học ở lớp, luyện ở nhà, theo dõi trên cổng phụ huynh." }, {
          items: [
            { title: "Lớp tại hai cơ sở", text: "211 Nguyễn Hữu Thọ và 114 Hoàng Diệu, Đà Nẵng; lớp tối đa 12 bé." },
            { title: "Lớp online trên SataWorld", text: "Tự học linh hoạt, có hướng dẫn giải đề vòng loại 2026." },
            { title: "Luyện thi trên RoboSim", text: "Thực hành cùng giáo viên cho cuộc thi Sáng tạo Robotics 2026." },
            { title: "Cổng phụ huynh", text: "Xem nhận xét sau buổi học và học bạ theo mốc của con." },
          ],
        }),
        // ---- Ba phần dưới đây là CHỮ MẪU: thay bằng nội dung thật (đã được đồng ý đăng) rồi bỏ chữ [DEMO] ----
        sec("testimonials", "phan-hoi", { title: "[DEMO] Phụ huynh nói gì" }, {
          items: [
            { quote: "[DEMO] Thay bằng một phản hồi thật của phụ huynh, đã được đồng ý cho đăng.", name: "Phụ huynh [DEMO] 1", meta: "Con học lớp …" },
            { quote: "[DEMO] Thay bằng một phản hồi thật của phụ huynh, đã được đồng ý cho đăng.", name: "Phụ huynh [DEMO] 2", meta: "Con học lớp …" },
            { quote: "[DEMO] Thay bằng một phản hồi thật của phụ huynh, đã được đồng ý cho đăng.", name: "Phụ huynh [DEMO] 3", meta: "Con học lớp …" },
          ],
        }),
        sec("programs", "doi-ngu", { title: "[DEMO] Đội ngũ giáo viên", intro: "Thay bằng giáo viên thật: họ tên, trình độ, môn phụ trách (cần sự đồng ý của giáo viên)." }, {
          items: [
            { name: "[DEMO] Họ và tên giáo viên 1", badge: "Trình độ", text: "[DEMO] Một đến hai câu về kinh nghiệm giảng dạy.", meta: "Phụ trách: …", price: "", url: "", linkLabel: "", image: "" },
            { name: "[DEMO] Họ và tên giáo viên 2", badge: "Trình độ", text: "[DEMO] Một đến hai câu về kinh nghiệm giảng dạy.", meta: "Phụ trách: …", price: "", url: "", linkLabel: "", image: "" },
            { name: "[DEMO] Họ và tên giáo viên 3", badge: "Trình độ", text: "[DEMO] Một đến hai câu về kinh nghiệm giảng dạy.", meta: "Phụ trách: …", price: "", url: "", linkLabel: "", image: "" },
          ],
        }),
        sec("features", "hoc-vien", { title: "[DEMO] Học viên tiêu biểu", intro: "Thay bằng thành tích thật của học viên (cần phụ huynh đồng ý đăng tên và ảnh)." }, {
          items: [
            { title: "[DEMO] Tên học viên 1", text: "[DEMO] Giải thưởng / sản phẩm nổi bật." },
            { title: "[DEMO] Tên học viên 2", text: "[DEMO] Giải thưởng / sản phẩm nổi bật." },
            { title: "[DEMO] Tên học viên 3", text: "[DEMO] Giải thưởng / sản phẩm nổi bật." },
            { title: "[DEMO] Tên học viên 4", text: "[DEMO] Giải thưởng / sản phẩm nổi bật." },
          ],
        }),
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
