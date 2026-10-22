/**
 * TRANG CHÍNH TH STEAM ACADEMY (một trang, docs/TRANG-CHINH.md) — mạch kể "nỗi lo → bối cảnh → giải pháp → bằng chứng → hành động".
 *
 * Nguyên tắc nội dung (đã chốt với trung tâm 21/10/2026):
 *  - Nói về NỖI LO của phụ huynh và GIÁ TRỊ con nhận được; không kể thông số kỹ thuật (số học phần, số buổi…) —
 *    chi tiết đó nằm ở trang Chương trình học (/khoa-hoc).
 *  - Nỗi lo phải đi kèm cách làm cụ thể phụ huynh tự kiểm chứng được (Tannenbaum et al. 2015, Psychological Bulletin:
 *    thông điệp gây lo chỉ hiệu quả, và hiệu quả gần gấp đôi, khi kèm thông điệp "bạn làm được").
 *  - MỌI con số đều có nguồn và liên kết, đã đọc trực tiếp (tra cứu 21/10/2026). Không dùng số chưa kiểm chứng
 *    ("thiếu 150–200 nghìn nhân lực CNTT", "tuổi có điện thoại trung bình là 9"…).
 *  - Luật Quảng cáo (Điều 8): không "nhất / số 1 / duy nhất", không hứa kết quả, không "miễn phí", không ảnh trẻ em giả.
 *    Ảnh: phần mềm thật (ghi nguồn) hoặc tranh minh hoạ vector của trung tâm; lời phụ huynh để TẮT cho tới khi có lời thật.
 *  - Đường dẫn `/?nganh=robotics|ai|do-hoa|lap-trinh` (quảng cáo): mở sẵn tab, đổi tiêu đề lớn, chọn sẵn chuyên ngành.
 *
 * Ảnh: tranh minh hoạ vector theo bộ nhận diện (tools/minh-hoa/art_trang_chu.py, tc-*.svg) và ảnh phần mềm thật có nguồn —
 *    ưu tiên giấy phép mở (Wikimedia Commons, Roblox Creator Docs CC BY 4.0, ảnh tạo bằng AI CC0 / phạm vi công cộng); ảnh của nhà sản xuất
 *    (WhalesBot, Autodesk, CreatiCode, Adobe, thể lệ cuộc thi) ghi nguồn và nên xin phép trước khi chạy quảng cáo lớn.
 * Mỗi lần cải tiến: sửa trong Website → Landing page → "Trang chủ" rồi Xuất bản; hoặc sửa ở đây cho lần dựng sau.
 */
import { emptySection, type LandingDoc, type LandingSection, type SectionType } from "./model.js";
import { TH_BRAND } from "../system/th-brand.js";
import { TH_TRACK_SHORT } from "../curriculum/thsteam.js";
import { PREPARE_TEXT, TEACHER, telHref } from "../site/thsteam-content.js";
import { DEFAULT_CHROME } from "../site/chrome.js";

function sec(type: SectionType, id: string, data: Record<string, string> = {}, lists: Record<string, Record<string, string>[]> = {}, enabled = true): LandingSection {
  const s = emptySection(type, id);
  return { ...s, enabled, data: { ...s.data, ...data }, lists: { ...s.lists, ...lists } };
}

const B = TH_BRAND.name;

/** Nguồn trích dẫn (đã mở và đọc trực tiếp) */
export const HOME_SOURCES = {
  tuoiTre2025: "https://tuoitre.vn/tre-em-nghien-dien-thoai-ky-1-de-tre-xai-dien-thoai-cho-do-quay-20250804101831812.htm",
  tuoiTreHungYen: "https://tuoitre.vn/tre-tieu-hoc-da-nghien-man-hinh-nhieu-noi-de-xuat-siet-dien-thoai-va-mang-xa-hoi-100260624091852104.htm",
  a05: "https://baovanhoa.vn/gia-dinh/khi-tre-em-song-hai-the-gioi-195150.html",
  commonSense: "https://www.commonsensemedia.org/about-us/news/press-releases/the-common-sense-census-media-use-by-tweens-and-teens-new-research",
  aap: "https://www.aap.org/en/patient-care/media-and-children/center-of-excellence-on-social-media-and-youth-mental-health/qa-portal/qa-portal-library/qa-portal-library-questions/screen-time-guidelines/",
  wef: "https://www.weforum.org/stories/2025/01/future-of-jobs-report-2025-jobs-of-the-future-and-the-skills-you-need-to-get-them/",
  microsoft: "https://vietnamnews.vn/economy/1719504/vietnamese-businesses-lead-global-shift-toward-ai-hiring.html",
  qd2422: "https://baovanhoa.vn/doi-song/giao-duc-ai-dai-tra-tu-nam-hoc-20262027-257694.html",
  tt02: "https://vneconomy.vn/bo-giao-duc-va-dao-tao-ban-hanh-khung-nang-luc-so-cho-nguoi-hoc.htm",
  decisionLab: "https://vneconomy.vn/techconnect/hoc-sinh-viet-nam-dang-di-nhanh-hon-cha-me-trong-ung-dung-ai.htm",
} as const;

/** Mã `?nganh=` của 4 chuyên ngành (tab trên trang chính) */
export const HOME_TRACK_KEYS = { ROBO: "robotics", AI: "ai", DOHOA: "do-hoa", CODE: "lap-trinh" } as const;

const S = HOME_SOURCES;

export const HOME_PAGE = {
  slug: "trang-chu",
  title: "Trang chủ TH STEAM Academy",
  template: "trang-chu-thsteam",
  variant: "vivid" as const,
  seoTitle: "Học Robotics, AI, lập trình online cho trẻ 8–18 tuổi | TH STEAM",
  seoDescription: "Robotics, AI, Đồ họa, Lập trình online qua ClassIn cho con 8–18 tuổi. Học trải nghiệm 1:1 không mất phí: con làm sản phẩm, thầy đánh giá và định hướng lộ trình.",
  seoImage: "/lp-anh/og-trang-chu.jpg",
  build(): LandingDoc {
    return {
      sections: [
        // Đầu / chân trang thật lấy từ khung chung của website (site/chrome.ts); hai khối này chỉ để trang đứng riêng được.
        sec("header", "header", { phone: "", ctaLabel: "Học trải nghiệm 1:1", ctaUrl: "#dang-ky" }, {
          nav: [{ label: "Vì sao nên học", href: "#noi-lo" }, { label: "Chuyên ngành", href: "#chuyen-nganh" }, { label: "Buổi học", href: "#quy-trinh" }, { label: "Giảng viên", href: "#giang-vien" }, { label: "Hỏi đáp", href: "#hoi-dap" }],
        }),

        // 1. MỞ ĐẦU — gọi đúng nỗi lo, hứa một chuyển đổi cụ thể, form ngay màn hình đầu
        sec("leadHero", "mo-dau", {
          eyebrow: "Lớp công nghệ online cho con 8–18 tuổi",
          title: "Biến giờ con ngồi trước màn hình thành giờ con *tạo ra công nghệ*",
          subtitle: "Khoá học Robotics, Trí tuệ nhân tạo, Thiết kế đồ họa và Lập trình online. Giáo viên dạy trực tiếp qua ClassIn, lớp nhỏ, con tự tay làm ra sản phẩm và tự tin giới thiệu nó trước bố mẹ.",
          formTitle: "Đặt lịch học trải nghiệm 1:1 cho con",
          formNote: "Con làm sản phẩm cùng thầy; thầy nhận xét và gợi ý lộ trình riêng cho con. Không mất phí.",
          interest: "",
          thankYou: `Cảm ơn ba mẹ! ${B} sẽ liên hệ lại trong giờ làm việc để hẹn buổi học trải nghiệm cho con.`,
        }, {
          points: [
            { text: "Con làm ra sản phẩm thật: robot ảo, game, video AI, mô hình 3D, trang web" },
            { text: "Bố mẹ tận mắt xem con trình bày và nhận đánh giá năng lực" },
            { text: "Buổi trải nghiệm 1:1: thầy đánh giá và định hướng lộ trình cho con" },
          ],
          showcase: [
            { image: "/lp-anh/that/robosim-robot-lap-ghep.webp", imageAlt: "Robot lắp ghép có cảm biến chạy trên sa bàn thi đấu trong phần mềm RoboSim", title: "Robot lắp ghép, lập trình", tool: "RoboSim", credit: "WhalesBot", creditUrl: "https://www.whalesbot.ai/", fit: "", pos: "" },
            { image: "/lp-anh/that/sp-ai-video.webp", imageAlt: "Minh hoạ video kể chuyện ngắn dựng từ tranh tạo bằng AI", title: "Video kể chuyện bằng AI", tool: "Công cụ AI tạo ảnh, video", credit: "Wikimedia Commons (ảnh AI, CC0)", creditUrl: "https://commons.wikimedia.org/wiki/File:%27Greenwood_Estates_Vista_City%27_by_Midjourney.jpg", fit: "", pos: "" },
            { image: "/lp-anh/that/creaticode-robot-sao-hoa.webp", imageAlt: "Robot thám hiểm sao Hỏa có tấm pin mặt trời, lập trình trong thế giới 3D của CreatiCode", title: "Robot thám hiểm sao Hỏa", tool: "CreatiCode 3D", credit: "CreatiCode", creditUrl: "https://www.creaticode.com/", fit: "", pos: "" },
            { image: "/lp-anh/that/tinkercad-mo-hinh-3d.webp", imageAlt: "Mô hình 3D khinh khí cầu, trực thăng, xe đua, mô tô, chú ngựa dựng trong Tinkercad", title: "Thiết kế đồ họa", tool: "Tinkercad", credit: "Autodesk Tinkercad", creditUrl: "https://www.tinkercad.com/", fit: "", pos: "80% 20%" },
            { image: "/lp-anh/that/roblox-thanh-pho-dem.webp", imageAlt: "Thành phố cảng về đêm dựng bằng Roblox Studio", title: "Thế giới game 3D", tool: "Roblox Studio", credit: "Roblox Creator Docs (CC BY 4.0)", creditUrl: "https://github.com/Roblox/creator-docs", fit: "", pos: "" },
          ],
        }),

        // 2. NỖI LO — số liệu có nguồn, nền tối để dừng mắt
        sec("insights", "noi-lo", {
          eyebrow: "Điều nhiều bố mẹ đang lo",
          title: "Mỗi ngày con ở trên màn hình nhiều giờ. Nhưng *con đang làm gì* ở đó?",
          intro: "Cấm hẳn thì khó, buông thì không yên. Những con số dưới đây cho thấy vấn đề không chỉ nằm ở số giờ.",
          closing: "",
          tone: "toi",
        }, {
          items: [
            { value: "89%", label: "trẻ em lên mạng mỗi ngày, trung bình 5–7 giờ", text: "Số liệu của Cục Trẻ em, được báo chí dẫn lại.", source: "Tuổi Trẻ, 04/08/2025", sourceUrl: S.tuoiTre2025 },
            { value: "60%", label: "thời gian trẻ dùng mạng xã hội là để giải trí, chỉ 25% để học", text: "Khảo sát tại Hưng Yên; lãnh đạo Sở GD&ĐT gọi đây là mức đáng báo động.", source: "Tuổi Trẻ, 24/06/2026", sourceUrl: S.tuoiTreHungYen },
            { value: "53%", label: "trẻ được hỏi đã gặp nội dung độc hại trên mạng", text: "Khảo sát của Bộ Công an với 2.775 trẻ ở 16 tỉnh, thành: 100% từng gặp ít nhất một rủi ro trên mạng.", source: "Báo Văn Hóa, 05/01/2026", sourceUrl: S.a05 },
            { value: "2–3%", label: "thời gian dùng màn hình của trẻ dành cho việc sáng tạo", text: "Phần còn lại chủ yếu là xem video, chơi game và mạng xã hội (khảo sát trẻ 8–18 tuổi tại Mỹ).", source: "Common Sense Media, 2019", sourceUrl: S.commonSense },
          ],
        }),

        // 3. BỐI CẢNH — thế giới con lớn lên (lo lắng thứ hai: tương lai), nền sáng
        sec("insights", "tuong-lai", {
          eyebrow: "Thế giới con sắp bước vào",
          title: "Khi con lớn lên, hiểu công nghệ sẽ là *kỹ năng nền tảng*",
          intro: "Không phải để con nào cũng thành kỹ sư. Mà để dù làm nghề gì, con cũng làm chủ được công cụ của thời mình.",
          tone: "",
        }, {
          items: [
            { value: "39%", label: "kỹ năng cốt lõi của người lao động sẽ thay đổi đến năm 2030", text: "Tăng nhanh nhất: AI và dữ liệu, hiểu biết công nghệ, tư duy sáng tạo, sự tò mò và học suốt đời.", source: "Diễn đàn Kinh tế Thế giới, Future of Jobs 2025", sourceUrl: S.wef },
            { value: "91%", label: "lãnh đạo doanh nghiệp Việt Nam cân nhắc tuyển vị trí chuyên về AI", text: "Cao hơn mức 78% của thế giới.", source: "Microsoft Work Trend Index 2025, qua Việt Nam News", sourceUrl: S.microsoft },
            { value: "12 tiết", label: "học về AI mỗi năm cho học sinh phổ thông, từ năm học 2026–2027", text: "Khung nội dung giáo dục trí tuệ nhân tạo của Bộ GD&ĐT (QĐ 2422/QĐ-BGDĐT).", source: "Báo Văn Hóa, 20/08/2026", sourceUrl: S.qd2422 },
          ],
        }),

        // 4. GIẢI PHÁP — đổi cách con dùng máy (thông điệp "bố mẹ làm được")
        sec("contrast", "sang-tao", {
          eyebrow: "Cùng một chiếc máy tính",
          title: "Chơi game và *làm ra game* — hai đứa trẻ rất khác nhau",
          intro: `Ở ${B}, thời gian con ngồi trước máy là thời gian con tự tay làm ra một thứ gì đó, sửa nó cho đến khi chạy, rồi đứng lên giới thiệu nó.`,
          leftTitle: "Khi con chỉ dùng công nghệ",
          rightTitle: "Khi con tạo ra công nghệ",
        }, {
          left: [
            { text: "Lướt hết video này sang video khác" },
            { text: "Chơi game người khác làm sẵn" },
            { text: "Nhờ AI làm bài hộ, chép lại đáp án" },
            { text: "Gặp lỗi là bỏ, chờ người lớn sửa giúp" },
          ],
          right: [
            { text: "Lập trình robot giải nhiệm vụ trên sa bàn" },
            { text: "Tự thiết kế và làm game của riêng mình" },
            { text: "Dùng AI làm trợ lý, rồi tự kiểm chứng kết quả" },
            { text: "Tự tìm lỗi, sửa đến khi chương trình chạy" },
          ],
        }),

        // 5. CHUYÊN NGÀNH — tab, mỗi tab nói "hợp với bạn nhỏ nào" và "con làm được gì"
        sec("tracks", "chuyen-nganh", {
          eyebrow: "4 chuyên ngành cho con 8–18 tuổi",
          title: "Mỗi bạn nhỏ một thế mạnh. Chọn *con đường hợp với con*",
          intro: "Chưa biết con hợp hướng nào? Buổi học trải nghiệm 1:1 giúp giáo viên nhận ra con thích gì, giỏi gì để gợi ý chuyên ngành phù hợp.",
          ctaLabel: "Đặt lịch học trải nghiệm để được tư vấn lộ trình", ctaUrl: "#dang-ky",
        }, {
          items: [
            {
              key: HOME_TRACK_KEYS.ROBO, icon: "robot", tab: "Robotics AI", name: "Lập trình Robotics AI", ages: "Tiểu học · 8–10 tuổi",
              hook: "Cho bạn nhỏ mê xe cộ, máy móc, thích thử rồi sửa.",
              text: "Con lập trình robot ảo làm nhiệm vụ: thu gom bưu kiện, cứu hộ trên bản đồ, du hành không gian. Robot chạy sai, con phải tự tìm ra vì sao — đó chính là lúc tư duy logic lớn lên.",
              outcomes: "Chia một nhiệm vụ lớn thành các bước nhỏ\nDùng cảm biến, vòng lặp, điều kiện để điều khiển robot\nTự tìm lỗi, tối ưu đường đi và thời gian",
              tools: "",
              image: "/lp-anh/that/robovr-ban-do-thanh-pho.webp", imageAlt: "Bản đồ thành phố trong phần mềm lập trình robot ảo RoboVR", credit: "Ảnh phần mềm: WhalesBot (whalesbot.ai)", creditUrl: "https://www.whalesbot.ai/",
              headline: "Con học lập trình Robotics AI online — robot chạy được nhờ chính con", interest: TH_TRACK_SHORT.ROBO,
            },
            {
              key: HOME_TRACK_KEYS.AI, icon: "ai", tab: "Trí tuệ nhân tạo", name: "Trí tuệ nhân tạo AI", ages: "Tiểu học · THCS · 8–14 tuổi",
              hook: "Cho bạn nhỏ thích kể chuyện, vẽ, làm video — và muốn dùng AI đúng cách.",
              text: "Con hiểu AI là gì, rồi dùng các công cụ AI phổ biến để làm ra sản phẩm của mình: tranh và truyện tranh, poster, bài hát, video ngắn, trang web giới thiệu. Con tự nghĩ ý tưởng, viết yêu cầu cho AI, chọn lọc và chỉnh sửa kết quả — AI giúp con làm nhanh hơn, không làm thay con.",
              outcomes: "Tạo tranh, poster, video ngắn và trang web bằng công cụ AI\nViết yêu cầu (prompt) rõ ý: nhân vật, bối cảnh, màu sắc, cảm xúc\nHiểu AI hoạt động ra sao, biết AI có thể sai, dùng AI an toàn, trung thực",
              tools: "",
              image: "/lp-anh/that/sp-ai-bo-san-pham.webp", imageAlt: "Minh hoạ sản phẩm làm bằng công cụ AI: video kể chuyện, poster khoa học, trang web giới thiệu", credit: "Minh hoạ: tranh tạo bằng AI (Midjourney, DALL·E 3, Imagen) — Wikimedia Commons, CC0 / phạm vi công cộng", creditUrl: "https://commons.wikimedia.org/wiki/Category:Images_generated_by_Midjourney",
              headline: "Con học Trí tuệ nhân tạo AI online — dùng AI thông minh, an toàn, trung thực", interest: TH_TRACK_SHORT.AI,
            },
            {
              key: HOME_TRACK_KEYS.DOHOA, icon: "co-ve", tab: "Đồ họa AI", name: "Thiết kế đồ họa AI", ages: "Tiểu học · THCS · 8–14 tuổi",
              hook: "Cho bạn nhỏ thích vẽ, thích tưởng tượng và làm đẹp.",
              text: "Tiểu học, con dựng mô hình 3D: ngôi nhà mơ ước, thành phố xanh của em. THCS, con thiết kế poster, bìa sách, ảnh ghép với Photoshop và công cụ AI tạo ảnh. Con học cách biến ý tưởng trong đầu thành thứ người khác nhìn thấy được.",
              outcomes: "Dựng mô hình 3D, căn chỉnh khối chính xác\nThiết kế poster, bìa sách có bố cục, màu sắc rõ ràng\nDùng AI tạo ảnh có chọn lọc, giữ dấu ấn riêng",
              tools: "",
              image: "/lp-anh/that/tinkercad-banh-rang.webp", imageAlt: "Mô hình bánh răng 3D trong phần mềm Tinkercad", credit: "Ảnh phần mềm: Autodesk Tinkercad (tinkercad.com)", creditUrl: "https://www.tinkercad.com/",
              headline: "Con học Thiết kế đồ họa AI online — từ mô hình 3D đến poster đầu tay", interest: TH_TRACK_SHORT.DOHOA,
            },
            {
              key: HOME_TRACK_KEYS.CODE, icon: "code", tab: "Lập trình", name: "Lập trình & phát triển ứng dụng AI", ages: "Tiểu học → THPT · 8–18 tuổi",
              hook: "Cho bạn nhỏ mê game và hay hỏi “cái này làm thế nào?”.",
              text: "Đi từ kéo thả đến code thật: Scratch và CreatiCode AI ở tiểu học; game 3D Roblox và app điện thoại ở THCS; Python, lập trình web, WordPress ở THCS–THPT. Mỗi chặng con làm ra game, ứng dụng, website của chính mình.",
              outcomes: "Làm game, app điện thoại có AI, website hoàn chỉnh\nViết code Python, HTML, CSS, JavaScript\nĐọc lỗi, sửa lỗi, làm việc theo dự án",
              tools: "",
              image: "/lp-anh/that/web-code-ra-trang.webp", imageAlt: "Lập trình web: viết mã HTML trong VS Code bên trái, trang web hoàn chỉnh hiện ra trong trình duyệt bên phải", credit: "Ảnh: Bootstrap docs (MIT) · MDN Web Docs (CC BY-SA 2.5)", creditUrl: "https://developer.mozilla.org/",
              headline: "Con học lập trình online — từ chơi game đến tự làm game, app, website", interest: TH_TRACK_SHORT.CODE,
            },
          ],
        }),

        // 6. GIÁ TRỊ — con thay đổi gì (tiêu chí đánh giá thật của trung tâm, nói "hướng tới", không hứa)
        sec("change", "con-thay-doi", {
          eyebrow: "Sau một năm học",
          title: "Điều bố mẹ sẽ thấy ở con, *không chỉ là điểm số*",
          intro: "Mỗi học sinh được đánh giá theo 6 năng lực và 3 phẩm chất, thang Tốt / Đạt / Cần cố gắng như ở trường. Đây là những thay đổi chương trình hướng tới:",
          beforeLabel: "Trước khi học", afterLabel: "Sau năm học",
          note: "",
        }, {
          items: [
            { area: "Tư duy công nghệ", before: "Làm theo hướng dẫn từng bước", after: "Tự chia bài toán thành các bước, lập kế hoạch giải" },
            { area: "Tư duy phản biện", before: "Chấp nhận đáp án đầu tiên", after: "Tự tìm lỗi, so sánh cách giải, kiểm chứng trước khi tin" },
            { area: "Tự tin, trình bày", before: "Ngại nói, sợ sai", after: "Giới thiệu sản phẩm, trả lời câu hỏi trước bố mẹ" },
            { area: "Tự chủ, hành vi số", before: "Dùng máy tính chủ yếu để giải trí", after: "Dùng máy tính và AI để học, để sáng tạo" },
            { area: "Trách nhiệm", before: "Bỏ dở khi gặp khó", after: "Kiên trì hoàn thành dự án đúng hạn" },
            { area: "Trung thực", before: "Ngại thừa nhận lỗi", after: "Tự làm sản phẩm của mình, dám nhận lỗi" },
          ],
        }),

        // 7. VÌ SAO YÊN TÂM — cách học (đặc điểm thật, không so sánh đối thủ)
        sec("features", "cam-ket", {
          title: "Vì sao bố mẹ có thể *yên tâm*",
          intro: "Một lớp học online tốt không nằm ở phần mềm, mà ở cách giáo viên theo sát con.",
          image: "/lp-anh/that/cover-minh-hoa-creaticode.webp", imageAlt: "Minh hoạ lớp lập trình online qua ClassIn: giáo viên dạy trực tiếp, học sinh cùng làm trên CreatiCode",
        }, {
          items: [
            { title: "Giáo viên dạy trực tiếp, không phải video quay sẵn", text: "Mỗi buổi là một lớp học thật qua ClassIn: giáo viên giảng, làm mẫu, giao việc và sửa bài cho từng bạn.", icon: "man-hinh" },
            { title: "Lớp nhỏ 6–8 bạn", text: "Đủ ít để giáo viên theo sát từng bạn, đủ đông để con có bạn cùng làm, cùng trình bày. Cần kèm riêng thì có lớp 1:1.", icon: "nhom" },
            { title: "Bố mẹ tận mắt thấy con tiến bộ", text: "Định kỳ con báo cáo dự án trực tuyến trước phụ huynh; gia đình nhận phiếu đánh giá năng lực và video sản phẩm của con.", icon: "mat" },
            { title: "Bám chương trình của Bộ GD&ĐT", text: "Theo GDPT 2018 môn Tin học, khung năng lực số (Thông tư 02/2025) và khung nội dung giáo dục AI áp dụng từ năm học 2026–2027.", icon: "chuan" },
          ],
        }),

        // 8. MỘT BUỔI HỌC — giúp phụ huynh hình dung lớp online
        sec("steps", "buoi-hoc", {
          title: "Một buổi học online của con *diễn ra thế nào?*",
          intro: "Ít ngồi nghe, nhiều tự làm: phần lớn thời gian con thực hành và sáng tạo trên máy của mình, giáo viên đi cùng từng bước.",
        }, {
          items: [
            { title: "Khởi động", text: "Một câu chuyện, một tình huống để con tò mò về bài học.", icon: "tia-sang" },
            { title: "Khám phá", text: "Giáo viên giới thiệu kiến thức mới và làm mẫu trên phần mềm.", icon: "la-ban" },
            { title: "Thực hành", text: "Con tự làm trên máy của mình, giáo viên theo dõi và gỡ rối.", icon: "code" },
            { title: "Thử thách", text: "Con sáng tạo thêm, nâng cấp sản phẩm theo ý mình.", icon: "cup" },
            { title: "Chia sẻ", text: "Con giới thiệu sản phẩm, nghe nhận xét của thầy cô và bạn bè.", icon: "chia-se" },
          ],
        }),

        // 9. BẰNG CHỨNG — loại sản phẩm con làm ra (ảnh phần mềm thật, ghi nguồn)
        sec("gallery", "san-pham", { title: "Những thứ con sẽ tự tay làm ra" }, {
          items: [
            { image: "/lp-anh/that/sp-robovr-duong-dua.webp", tag: "Robotics AI", caption: "Xe robot tự lái trên đường đua tương lai", credit: "Ảnh: WhalesBot RoboVR", creditUrl: "https://www.whalesbot.ai/3dvirtual" },
            { image: "/lp-anh/that/robovr-xe-tu-lai.webp", tag: "Robotics AI", caption: "Robot giao hàng chạy theo bản đồ thành phố", credit: "Ảnh: WhalesBot RoboVR", creditUrl: "https://www.whalesbot.ai/3dvirtual" },
            { image: "/lp-anh/that/sp-ai-poster.webp", tag: "Trí tuệ nhân tạo", caption: "Poster khoa học: tranh tạo bằng AI, chữ và bố cục con tự làm", credit: "Minh hoạ; tranh AI: DALL·E 3, Wikimedia Commons (phạm vi công cộng)", creditUrl: "https://commons.wikimedia.org/wiki/File:A_city_on_Mars_under_a_glass_dome_with_forests,_fields,_lakes,_houses.jpg" },
            { image: "/lp-anh/that/sp-ai-web.webp", tag: "Trí tuệ nhân tạo", caption: "Trang web giới thiệu làm bằng công cụ web AI", credit: "Minh hoạ; tranh AI: Imagen, Wikimedia Commons (phạm vi công cộng)", creditUrl: "https://commons.wikimedia.org/wiki/File:Illuminated_Valley_in_the_Afternoon_(Imagen_4.0).webp" },
            { image: "/lp-anh/that/sp-tinkercad-nhan-vat.webp", tag: "Thiết kế đồ họa", caption: "Nhân vật 3D tự dựng", credit: "Ảnh: Autodesk Tinkercad", creditUrl: "https://www.tinkercad.com/" },
            { image: "/lp-anh/that/photoshop-generative-fill-ong.webp", tag: "Thiết kế đồ họa", caption: "Ảnh sáng tạo cùng AI trong Photoshop", credit: "Ảnh: Adobe Photoshop", creditUrl: "https://www.adobe.com/products/photoshop.html" },
            { image: "/lp-anh/that/sp-scratch-game.webp", tag: "Lập trình", caption: "Game phi hành gia nhảy bậc bằng Scratch", credit: "Ảnh: Scratch (MIT)", creditUrl: "https://scratch.mit.edu/" },
            { image: "/lp-anh/that/roblox-lau-dai-phep-thuat.webp", tag: "Lập trình", caption: "Thế giới game 3D lâu đài phép thuật", credit: "Ảnh: Roblox Creator Docs, CC BY 4.0", creditUrl: "https://github.com/Roblox/creator-docs" },
          ],
        }),

        // 10. NGƯỜI DẠY CON
        sec("teacher", "giang-vien", {
          title: "Người trực tiếp đứng lớp cùng con",
          name: TEACHER.name, role: TEACHER.role, photo: "/lp-anh/that/thay-phan-thanh-toai.webp",
          bio: "Thầy tin rằng một bạn nhỏ ở bất kỳ đâu trên đất nước cũng xứng đáng được học công nghệ bài bản như ở thành phố lớn. Vì thế thầy xây dựng TH STEAM thành lớp học online: chỉ cần một chiếc máy tính, con được học trực tiếp cùng thầy, tự tay làm ra sản phẩm và tự tin bước vào thế giới số.",
          quote: TEACHER.motto, certImage: "/lp-anh/that/chung-nhan-stem-org.webp", certCaption: "Chứng nhận STEM.org Certified Educational Instructor",
        }, {
          points: [
            { title: "6 năm kinh nghiệm", text: "Giảng dạy và phát triển chương trình đào tạo công nghệ số (EdTech)." },
            { title: "Giáo viên đạt chuẩn STEM.org", text: "Chứng nhận quốc tế STEM.org Certified Educational Instructor." },
            { title: "Huấn luyện viên đội tuyển", text: "Dẫn dắt học sinh thi đấu Robotics, Tin học trẻ, KHKT, HKICO." },
          ],
        }),

        sec("testimonials", "phan-hoi", { title: "Phụ huynh nói gì" }, { items: [] }, false),

        // 11. HÀNH ĐỘNG — giá trị buổi học trải nghiệm 1:1: đánh giá + định hướng (không so sánh giá ảo, không nêu số tiền)
        sec("trial", "hoc-thu", {
          eyebrow: "Buổi học trải nghiệm 1:1",
          title: "Một buổi học để hiểu con — và biết *con nên bắt đầu từ đâu*",
          intro: "Con học thật cùng thầy và tự tay làm ra sản phẩm đầu tay; thầy quan sát cách con nghĩ, cách con làm để đánh giá, rồi cùng bố mẹ vạch lộ trình phát triển công nghệ phù hợp với con.",
          gainsTitle: "Sau buổi học, *bố mẹ nhận được*",
          badge: "",
          note: "",
          photo: "/lp-anh/that/thay-phan-thanh-toai.webp", photoName: TEACHER.name, photoRole: "Trực tiếp đánh giá và định hướng cho con",
          primaryLabel: "Đặt lịch học trải nghiệm", primaryUrl: "#dang-ky", secondaryLabel: `Gọi ${TH_BRAND.hotline}`, secondaryUrl: telHref,
        }, {
          steps: [
            { who: "Bố mẹ", title: "Đăng ký", text: "Để lại họ tên, số điện thoại và lớp của con — chưa tới một phút." },
            { who: "Trung tâm", title: "Tư vấn, hẹn lịch", text: "Gọi lại trong giờ làm việc, hỏi về sở thích của con và chọn giờ học hợp với gia đình." },
            { who: "Con và thầy", title: "Học cùng thầy, làm sản phẩm", text: "Học 1:1 online; con tự làm một sản phẩm nhỏ theo sở thích: game, robot ảo hay tranh AI." },
            { who: "Thầy cố vấn", title: "Đánh giá và định hướng", text: "Thầy nhận xét điểm mạnh, điều con cần rèn và gợi ý chuyên ngành, cấp độ, lộ trình cho con." },
          ],
          gains: [
            { title: "Sản phẩm đầu tay của con", text: "Con mang về, giới thiệu với cả nhà — thấy ngay con làm được gì.", icon: "cup" },
            { title: "Nhận xét năng lực của con", text: "Tư duy, thao tác máy tính, sự tập trung và tự tin, theo khung đánh giá của chương trình.", icon: "chuan" },
            { title: "Lộ trình riêng cho con", text: "Nên học chuyên ngành nào, bắt đầu ở cấp độ nào, học trong bao lâu.", icon: "la-ban" },
            { title: "Giải đáp mọi băn khoăn", text: "Học phí, lịch học, cách bố mẹ theo dõi con — hỏi trực tiếp người dạy.", icon: "chia-se" },
          ],
        }),

        // 12. HỎI ĐÁP — trả lời thẳng những băn khoăn thật
        sec("faq", "faq", { title: "Bố mẹ thường hỏi" }, {
          items: [
            { q: "Buổi học trải nghiệm diễn ra thế nào, có mất phí không?", a: "Bố mẹ không phải trả phí cho buổi này. Sau khi đăng ký, trung tâm gọi lại để hẹn giờ; con học 1:1 online cùng thầy và tự làm một sản phẩm nhỏ. Cuối buổi, thầy nhận xét điểm mạnh, điều con cần rèn và gợi ý chuyên ngành, lộ trình phù hợp. Gia đình tự quyết định có học tiếp hay không." },
            { q: "Học phí thế nào?", a: `Học phí giống nhau ở cả 4 chuyên ngành, có lớp nhóm và kèm 1:1, đăng ký 2 năm học được ưu đãi hơn. Sau buổi học trải nghiệm, giáo viên gửi bố mẹ lộ trình và học phí phù hợp với con; cần biết trước, bố mẹ gọi ${TH_BRAND.hotline}.` },
            { q: "Học thêm máy tính có làm con nghiện màn hình hơn không?", a: "Buổi học có mục tiêu và sản phẩm rõ ràng, giáo viên dẫn dắt từ đầu đến cuối — khác hẳn việc lướt mạng không giới hạn. Con được rèn thói quen tự chủ và dùng máy tính an toàn; đây là một tiêu chí được đánh giá định kỳ. Ở nhà, bố mẹ vẫn nên cùng con đặt giới hạn thời gian dùng thiết bị." },
            { q: "Con bao nhiêu tuổi thì học được?", a: "Từ 8 đến 18 tuổi. Tiểu học (8–10 tuổi) học được cả 4 chuyên ngành; THCS có AI, Photoshop, Roblox, App Inventor, Python và lập trình web; THPT học lập trình web full-stack và WordPress." },
            { q: "Học online con có tập trung được không?", a: "Lớp chỉ 6–8 bạn, bật camera và micro; giáo viên gọi tên, giao việc và xem sản phẩm của từng bạn trong buổi. Phần lớn thời gian con tự tay làm sản phẩm nên ít khi phải ngồi nghe suông." },
            { q: "Dùng AI có làm con lười suy nghĩ không?", a: "Đó là lo lắng chính đáng mà nhiều phụ huynh chia sẻ. Ở lớp, con dùng AI như một trợ lý: tự đặt câu hỏi, so sánh, kiểm chứng câu trả lời, rồi tự trình bày cách mình làm. Con phải hiểu sản phẩm của mình thì mới trả lời được câu hỏi của bố mẹ trong buổi báo cáo." },
            { q: "Con chưa biết gì về máy tính có học được không?", a: "Được. Chương trình bắt đầu từ thao tác cơ bản và lập trình kéo thả. Buổi học trải nghiệm 1:1 giúp giáo viên đánh giá để xếp con vào chặng phù hợp." },
            { q: "Bố mẹ theo dõi con học thế nào?", a: "Qua nhóm Zalo lớp (lịch học, ảnh và video sản phẩm, nhận xét của giáo viên), hệ thống học tập để xem lại bài và chuyên cần, và hồ sơ công nghệ lưu mọi dự án của con. Định kỳ con báo cáo dự án trực tuyến trước phụ huynh, gia đình nhận phiếu đánh giá 6 năng lực, 3 phẩm chất." },
            { q: "Cần chuẩn bị gì để học?", a: PREPARE_TEXT },
            { q: "Con nghỉ học có được học bù không?", a: "Báo nghỉ trước ít nhất 24 giờ qua Zalo lớp hoặc hotline thì được học bù, tối đa 3 buổi mỗi năm học. Nghỉ không báo trước thì không học bù. Trung tâm hủy buổi học thì bù đủ." },
          ],
        }),

        sec("form", "form", {
          title: "Đặt lịch buổi học trải nghiệm *1:1 cho con*",
          subtitle: "Để lại thông tin, trung tâm gọi lại trong giờ làm việc để hẹn giờ học phù hợp với gia đình.",
          badge: "Không mất phí · Học online tại nhà",
          callLabel: `Cần tư vấn ngay? Gọi ${TH_BRAND.hotline}`, callUrl: telHref,
          thankYou: `Cảm ơn ba mẹ! ${B} sẽ liên hệ lại trong giờ làm việc để hẹn buổi học trải nghiệm cho con.`,
        }, {
          points: [
            { text: "Con học 1:1 cùng thầy, tự tay làm sản phẩm đầu tay" },
            { text: "Thầy nhận xét điểm mạnh, điều con cần rèn" },
            { text: "Bố mẹ nhận gợi ý chuyên ngành và lộ trình riêng cho con" },
          ],
        }),

        // Chân trang: trên website được thay bằng khung chung (site/chrome.ts DEFAULT_CHROME); giữ cùng nội dung
        sec("footer", "footer", {
          tagline: DEFAULT_CHROME.tagline, email: "", phone: TH_BRAND.hotline, legal: TH_BRAND.legalName, copyright: DEFAULT_CHROME.copyright,
        }, {
          addresses: DEFAULT_CHROME.addresses.map((x) => ({ ...x })),
          links: DEFAULT_CHROME.links.map((x) => ({ ...x })),
        }),
      ],
    };
  },
};

/**
 * Trang cũ đã GỘP vào trang chính → chuyển hướng vĩnh viễn (308) tới đúng phần; trang chuyên ngành mở sẵn tab.
 * Seed website (`syncThSteamWebsite`) lưu trữ các trang này nên chúng rời sơ đồ trang (sitemap).
 * Website chỉ còn MỘT trang chính: cả trang Chương trình học (/khoa-hoc) cũng gộp (21/10/2026). Giữ các trang chính sách
 * (form đăng ký cần liên kết chính sách bảo mật), tin tức, tuyển dụng, /dang-ky và landing quảng cáo /lp/….
 */
export const SITE_MERGED: readonly { slug: string; from: string; to: string }[] = [
  { slug: "gioi-thieu", from: "/gioi-thieu", to: "/#giang-vien" },
  { slug: "lien-he", from: "/lien-he", to: "/#dang-ky" },
  { slug: "khoa-hoc", from: "/khoa-hoc", to: "/#chuyen-nganh" },
  { slug: "khoa-hoc-robotics-ai", from: "/khoa-hoc/robotics-ai", to: `/?nganh=${HOME_TRACK_KEYS.ROBO}#chuyen-nganh` },
  { slug: "khoa-hoc-tri-tue-nhan-tao-ai", from: "/khoa-hoc/tri-tue-nhan-tao-ai", to: `/?nganh=${HOME_TRACK_KEYS.AI}#chuyen-nganh` },
  { slug: "khoa-hoc-thiet-ke-do-hoa-ai", from: "/khoa-hoc/thiet-ke-do-hoa-ai", to: `/?nganh=${HOME_TRACK_KEYS.DOHOA}#chuyen-nganh` },
  { slug: "khoa-hoc-lap-trinh-ung-dung-ai", from: "/khoa-hoc/lap-trinh-ung-dung-ai", to: `/?nganh=${HOME_TRACK_KEYS.CODE}#chuyen-nganh` },
];

/** Mã `?nganh=` hợp lệ → mã đó; còn lại → "" (không nhận chuỗi lạ từ đường dẫn) */
export function homeFocus(v: string | null | undefined): string {
  const k = (v ?? "").trim().toLowerCase();
  return (Object.values(HOME_TRACK_KEYS) as string[]).includes(k) ? k : "";
}
