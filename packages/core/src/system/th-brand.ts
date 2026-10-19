/**
 * THÔNG TIN THƯƠNG HIỆU TH STEAM ACADEMY (bộ nhận diện đã duyệt — skill th-steam-brand-identity).
 * Một nguồn duy nhất cho tên, tagline, liên hệ, màu và đường dẫn logo dùng ở website, chân trang, mẫu tin nhắn, dữ liệu nạp.
 * Màu KHÔNG được tự ý đổi; màu giao diện thực tế vẫn do Cài đặt hệ thống → Nhận diện thương hiệu quyết định.
 */
export const TH_BRAND = {
  name: "TH STEAM Academy",
  wordmark: "TH STEAM ACADEMY",
  short: "TH STEAM",
  legalName: "Trung tâm Đào tạo Tin học AI & Công nghệ TH STEAM",
  tagline: "IGNITING FUTURE INNOVATION",
  taglineVi: "Thắp lửa đổi mới cho tương lai",
  method: "Phương pháp thực chiến \"1-Chạm\"",
  values: ["Innovation (Đổi mới sáng tạo)", "Interdisciplinary (Tích hợp liên môn)", "Integrity & Excellence (Chính trực & Đỉnh cao)"],
  hotline: "0971 29 30 31",
  hotlineTel: "0971293031",
  website: "thsteam.edu.vn",
  websiteUrl: "https://thsteam.edu.vn",
  fanpage: "TH STEAM ACADEMY",
  audience: "Học sinh 6–17 tuổi",
  colors: {
    blue: "#1D4ED8", blueDark: "#1E40AF", emerald: "#10B981", emeraldDark: "#059669", gold: "#F59E0B", amber: "#D97706",
    navy: "#0F172A", white: "#FFFFFF", slate: "#F8FAFC", text2: "#475569", wordmark: "#14215A", taglineGold: "#D4920F",
  },
  /** Tệp logo đi kèm ứng dụng (apps/web/public) — chữ đã chuyển nét */
  logo: {
    symbol: "/thsteam/symbol.svg",
    horizontal: "/thsteam/logo-ngang.svg",
    horizontalOnDark: "/thsteam/logo-ngang-trang.svg",
    vertical: "/thsteam/logo-dung.svg",
    verticalOnDark: "/thsteam/logo-dung-trang.svg",
    appIcon: "/thsteam/app-icon.svg",
  },
  /** Nền giấy chứng nhận mặc định (A4 ngang) */
  certificateBackground: "builtin/th-steam-mac-dinh.svg",
  /** Đoạn giới thiệu ngắn (website, fanpage, hồ sơ năng lực) — nguyên văn bộ nhận diện */
  about: "Logo TH STEAM Academy là hành trình của mỗi học viên: từ nền tảng công nghệ vững chắc, qua con đường khám phá khoa học không giới hạn, bứt phá vươn tới ngôi sao thành công. Cùng lời hứa Igniting Future Innovation, TH STEAM Academy thắp lửa đam mê công nghệ cho thế hệ trẻ Việt Nam từ 6 đến 17 tuổi.",
} as const;
