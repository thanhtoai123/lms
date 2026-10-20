/**
 * DỮ LIỆU CHUẨN TH STEAM — SINH TỰ ĐỘNG từ 8 bộ slide chương trình đã duyệt (19/10/2026), chữ giữ nguyên như trên slide.
 * Sửa nội dung: sửa ở bộ slide trước, rồi sinh lại file này. Đừng sửa tay số buổi, độ tuổi, tên cuộc thi.
 * Nguồn: xem `deckUrl` của từng chương trình. Kiểu dữ liệu và quy tắc ở ./thsteam.ts
 */
import type { ThCatalogData } from "./thsteam-types.js";

export const TH_CATALOG_DATA: ThCatalogData = {
  "tracks": [
    {
      "code": "ROBO",
      "name": "Lập trình Robotics AI",
      "tagline": "Con học lập trình robot ảo ngay tại nhà, cùng giáo viên dạy trực tiếp qua ClassIn.",
      "deckUrl": "https://claude.ai/artifact/Pbuw89mLF2zg1enJDMhmEF",
      "programs": [
        "ROBO-TH"
      ]
    },
    {
      "code": "AI",
      "name": "Trí tuệ nhân tạo AI",
      "tagline": "Con dùng AI để học, vẽ, làm nhạc, làm video và trang web, an toàn và có trách nhiệm.",
      "deckUrl": "https://claude.ai/artifact/QnjCd8vHtSH94WFSUyxNye",
      "programs": [
        "AI-TH",
        "AI-THCS"
      ]
    },
    {
      "code": "DOHOA",
      "name": "Thiết kế đồ họa AI",
      "tagline": "Con học dựng mô hình 3D và chỉnh sửa ảnh cùng công cụ AI, với giáo viên dạy trực tiếp qua ClassIn.",
      "deckUrl": "https://claude.ai/artifact/63D1QeU1TqmtVnwTBZvzd4",
      "programs": [
        "DOHOA-TH",
        "DOHOA-THCS"
      ]
    },
    {
      "code": "CODE",
      "name": "Lập trình & phát triển ứng dụng AI",
      "tagline": "Từ Scratch đến lập trình web: 8 năm học, 4 chặng theo cấp học.",
      "deckUrl": null,
      "programs": [
        "CODE-TH",
        "CODE-THCS1",
        "CODE-THCS2",
        "CODE-THPT"
      ]
    }
  ],
  "programs": [
    {
      "code": "ROBO-TH",
      "track": "ROBO",
      "level": "tieu-hoc",
      "ageFrom": 8,
      "ageTo": 10,
      "name": "RoboSim → RoboVR",
      "tagline": "Con học lập trình robot ảo ngay tại nhà, cùng giáo viên dạy trực tiếp qua ClassIn.",
      "deckUrl": "https://claude.ai/artifact/Pbuw89mLF2zg1enJDMhmEF",
      "years": [
        {
          "no": 1,
          "ageFrom": 8,
          "ageTo": 9,
          "title": "Lập trình robot ảo với RoboSim",
          "software": "RoboSim của Zmrobo",
          "tools": "Phần mềm mô phỏng robot, dùng để học và thi vòng loại Cuộc thi Sáng tạo Robotics toàn quốc.",
          "highlights": [
            "Con tự thiết kế robot 2 bánh và gắn cảm biến trong phần mềm.",
            "Lập trình robot làm nhiệm vụ trên sa bàn ảo có vạch dò đường."
          ],
          "featuredProjects": [
            "xe robot hậu cần thu gom bưu kiện, giao hàng"
          ],
          "modules": [
            {
              "no": 1,
              "name": "Làm quen robot ảo",
              "difficulty": "basic",
              "learn": "Ra lệnh cho robot theo từng bước, lặp lại, hẹn giờ",
              "product": "Đèn giao thông · Robot đi hình vuông",
              "canDo": "Viết chương trình đúng thứ tự"
            },
            {
              "no": 2,
              "name": "Robot biết cảm nhận",
              "difficulty": "advanced",
              "learn": "Gắn “giác quan” cho robot: đo khoảng cách, nhận màu, dò vạch",
              "product": "Robot tránh vật cản · Robot nhận màu",
              "canDo": "Dạy robot tự quyết định: “nếu… thì…”"
            },
            {
              "no": 3,
              "name": "Nhiệm vụ trên sa bàn",
              "difficulty": "expert",
              "learn": "Thiết kế robot, chia nhiệm vụ lớn thành các bước nhỏ",
              "product": "Sa bàn “Hậu cần thông minh”",
              "canDo": "Tự hoàn thành sa bàn nhiều nhiệm vụ"
            }
          ],
          "note": "Thuật ngữ chuyên môn (ghi chú slide): lệnh tuần tự, vòng lặp, hẹn giờ; cảm biến siêu âm, cảm biến màu, cảm biến dò vạch; cấu trúc điều kiện và biến số; thiết kế robot 2 bánh, tối ưu điểm và thời gian. Nội dung tham chiếu khóa RoboSim Cơ bản của Việt Robot và Thể lệ Cuộc thi Sáng tạo Robotics 2026 (robot 2 bánh lái, cảm biến không giới hạn, chủ đề Hậu cần thông minh)."
        },
        {
          "no": 2,
          "ageFrom": 9,
          "ageTo": 10,
          "title": "Robot trong thế giới 3D với RoboVR",
          "software": "RoboVR của WhalesBot",
          "tools": "Phần mềm robot ảo 3D, giao diện tiếng Anh, dùng để thi hạng mục Robot ảo 3D của ENJOY AI.",
          "highlights": [
            "Con chọn robot, lập trình và chạy thử trên nhiều bản đồ 3D.",
            "Dùng cảm biến nhận diện làn đường, biển báo; theo dõi điểm và thời gian."
          ],
          "featuredProjects": [
            "robot làm nhiệm vụ trên bản đồ Hurricane Rescue, Space Tour"
          ],
          "modules": [
            {
              "no": 1,
              "name": "Làm quen thế giới 3D",
              "difficulty": "basic",
              "learn": "Dùng phần mềm 3D tiếng Anh, điều khiển robot chính xác",
              "product": "Khám phá Whalesville Park · Đường đua tính giờ",
              "canDo": "Lái robot 3D đúng đường, đúng giờ"
            },
            {
              "no": 2,
              "name": "Robot nhận diện",
              "difficulty": "advanced",
              "learn": "Robot “nhìn” làn đường, biển báo, đèn tín hiệu",
              "product": "Robot đi đúng làn · Dừng đúng biển báo",
              "canDo": "Robot tự lái theo luật giao thông"
            },
            {
              "no": 3,
              "name": "Nhiệm vụ bản đồ lớn",
              "difficulty": "expert",
              "learn": "Lên chiến lược nhiều bước, tối ưu điểm và thời gian",
              "product": "Hurricane Rescue (cứu hộ) · Space Tour",
              "canDo": "Giải trọn nhiệm vụ như đề thi thật"
            }
          ],
          "note": "Thuật ngữ chuyên môn (ghi chú slide): cảm biến Road Recognition, Sign Recognition trong RoboVR; điều kiện, biến số; tối ưu điểm và thời gian theo cách chấm tự động của phần mềm. Hurricane Rescue là chủ đề thi Robot ảo 3D mùa 2026: thu gom hộp cứu thương, tránh đá và xe tải, tuân thủ đèn giao thông, về đích."
        }
      ],
      "contests": [
        {
          "key": "STR",
          "short": "Sáng tạo Robotics",
          "full": "Cuộc thi Sáng tạo Robotics (toàn quốc) — bảng R1 tiểu học",
          "sessions": 15,
          "afterYear": 1,
          "eligibility": "Dành cho học sinh đã học xong Năm 1 · bảng R1 tiểu học",
          "syllabus": [
            "Buổi 1–4: nắm thể lệ, sa bàn và cách tính điểm.",
            "Buổi 5–12: luyện từng nhiệm vụ theo đề mùa thi.",
            "Buổi 13–15: thi thử 180 phút đúng thể lệ."
          ],
          "reference": "Tham khảo mùa 2026: vòng loại online ngày 26/7",
          "notes": "Vòng loại online (trên RoboSim). Tham khảo mùa 2026: vòng loại online ngày 26/7. Quyền lợi (Sáng tạo Robotics · TW Đoàn · bảng R1 tiểu học): Giải Nhất, Nhì, Ba: huy chương và Bằng khen Trung ương Đoàn; Mọi đội vào chung kết: chứng nhận Vàng, Bạc, Đồng theo điểm; Giải Nhất, Nhì, Ba được xét chọn dự WRC tại Trung Quốc. Lệ phí dự thi do BTC thu riêng (tham khảo mùa 2026: vòng loại 500.000đ/đội)."
        },
        {
          "key": "EAI",
          "short": "ENJOY AI",
          "full": "ENJOY AI hạng mục Robot ảo 3D (Virtual Robot Online)",
          "sessions": 15,
          "afterYear": 2,
          "eligibility": "Dành cho học sinh đã học xong Năm 2 · từ lớp 4",
          "syllabus": [
            "Buổi 1–4: làm chủ bản đồ và luật thi của mùa giải.",
            "Buổi 5–12: luyện nhiệm vụ, chiến thuật ghi điểm.",
            "Buổi 13–15: thi thử 120 phút trực tuyến."
          ],
          "reference": "Tham khảo mùa 2026: thi online ngày 14/6 và 27/9",
          "notes": "Vòng online (trên RoboVR). Tham khảo mùa 2026: thi online ngày 14/6 và 27/9. Quyền lợi (ENJOY AI · Robot ảo 3D · từ lớp 4): Sân chơi hơn 1 triệu thí sinh, 61 quốc gia và vùng lãnh thổ mỗi năm; Đội đoạt giải nhận chứng nhận của Viện Nghiên cứu Thiết kế Trường học (Bộ GD&ĐT); Cơ hội vào Vòng chung kết quốc tế tại Trung Quốc. Lệ phí dự thi do BTC thu riêng (tham khảo mùa 2026: 300.000đ/thí sinh)."
        }
      ],
      "contestNote": null,
      "growth": [
        {
          "criterion": "Tư duy công nghệ",
          "before": "Làm theo hướng dẫn",
          "after1": "Chia bài toán thành các bước",
          "after2": "Lập chiến lược, tối ưu điểm và thời gian"
        },
        {
          "criterion": "Tư duy phản biện",
          "before": "Chấp nhận một đáp án",
          "after1": "Tự tìm lỗi khi robot chạy sai",
          "after2": "So sánh cách giải, giải thích lựa chọn"
        },
        {
          "criterion": "Kỹ năng vi tính",
          "before": "Thao tác còn lúng túng",
          "after1": "Dùng thành thạo phần mềm, học online",
          "after2": "Cài đặt, quản lý tệp, làm chủ phần mềm 3D"
        },
        {
          "criterion": "Tiếng Anh chuyên ngành",
          "before": "Chưa biết thuật ngữ",
          "after1": "Nhận biết sensor, motor, line",
          "after2": "Dùng giao diện tiếng Anh, đọc hiểu đề"
        },
        {
          "criterion": "Tự tin, trình bày",
          "before": "Ngại nói, ngại sai",
          "after1": "Giới thiệu sản phẩm trước lớp",
          "after2": "Báo cáo dự án trước phụ huynh"
        },
        {
          "criterion": "Tự chủ, hành vi số",
          "before": "Dùng máy tính để giải trí",
          "after1": "Tập trung, kiên trì sửa lỗi",
          "after2": "Dùng máy tính để sáng tạo"
        },
        {
          "criterion": "Chăm chỉ",
          "before": "Học khi được nhắc",
          "after1": "Đúng giờ, làm bài tập đầy đủ",
          "after2": "Tự giác học và luyện thêm"
        },
        {
          "criterion": "Trách nhiệm",
          "before": "Bỏ dở khi gặp khó",
          "after1": "Hoàn thành dự án đúng hạn",
          "after2": "Chủ động hỗ trợ bạn trong nhóm"
        },
        {
          "criterion": "Trung thực",
          "before": "Ngại thừa nhận lỗi",
          "after1": "Tự làm sản phẩm của mình",
          "after2": "Dám nhận lỗi, tôn trọng bài của bạn"
        }
      ],
      "competencies": [
        {
          "name": "Tư duy công nghệ",
          "group": "Tư duy",
          "desc": "Chia nhỏ vấn đề, tìm quy luật, viết thuật toán cho robot.",
          "ref": "GDPT 2018 · Tin học: giải quyết vấn đề với CNTT"
        },
        {
          "name": "Tư duy phản biện",
          "group": "Tư duy",
          "desc": "Tìm lỗi, so sánh cách giải, hỏi “vì sao robot chạy sai?”.",
          "ref": "Năng lực chung: giải quyết vấn đề và sáng tạo"
        },
        {
          "name": "Kỹ năng vi tính",
          "group": "Kỹ năng số",
          "desc": "Thao tác máy tính, cài phần mềm, quản lý tệp, học online.",
          "ref": "Khung năng lực số · Thông tư 02/2025"
        },
        {
          "name": "Tiếng Anh chuyên ngành",
          "group": "Kỹ năng số",
          "desc": "Đọc hiểu thuật ngữ: sensor, motor, map, mission.",
          "ref": "Giao diện tiếng Anh của phần mềm RoboVR"
        },
        {
          "name": "Tự tin, trình bày",
          "group": "Bản lĩnh",
          "desc": "Báo cáo dự án sau mỗi học phần, tự tin trả lời câu hỏi.",
          "ref": "Năng lực chung: giao tiếp và hợp tác"
        },
        {
          "name": "Tự chủ, hành vi số",
          "group": "Bản lĩnh",
          "desc": "Tập trung, kiên trì, dùng máy tính an toàn để sáng tạo.",
          "ref": "Năng lực chung: tự chủ và tự học"
        },
        {
          "name": "Chăm chỉ",
          "group": "Phẩm chất",
          "desc": "Đúng giờ, làm bài tập đầy đủ",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trách nhiệm",
          "group": "Phẩm chất",
          "desc": "Hoàn thành dự án, giữ nề nếp lớp",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trung thực",
          "group": "Phẩm chất",
          "desc": "Tự làm sản phẩm, dám nhận lỗi",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        }
      ]
    },
    {
      "code": "AI-TH",
      "track": "AI",
      "level": "tieu-hoc",
      "ageFrom": 8,
      "ageTo": 10,
      "name": "AI for kids",
      "tagline": "Con dùng AI để học, vẽ, làm nhạc, làm video và trang web, an toàn và có trách nhiệm.",
      "deckUrl": "https://claude.ai/artifact/QnjCd8vHtSH94WFSUyxNye",
      "years": [
        {
          "no": 1,
          "ageFrom": 8,
          "ageTo": 10,
          "title": "Sáng tạo cùng AI với giáo viên",
          "software": "Bộ công cụ AI phổ biến",
          "tools": "Chạy trên trình duyệt, giáo viên hướng dẫn từng bước qua ClassIn.",
          "highlights": [
            "Con hỏi đáp, kể chuyện cùng AI và học cách giữ an toàn thông tin.",
            "Con tả ý tưởng để AI vẽ tranh, đọc truyện, làm bài hát."
          ],
          "featuredProjects": [
            "video kể chuyện",
            "trang web giới thiệu bản thân"
          ],
          "modules": [
            {
              "no": 1,
              "name": "Trò chuyện cùng AI",
              "difficulty": "basic",
              "learn": "AI là gì, hỏi AI rõ ràng, giữ an toàn thông tin",
              "product": "Truyện tranh AI 6 khung",
              "canDo": "Đặt câu hỏi rõ, biết AI có thể sai"
            },
            {
              "no": 2,
              "name": "Tranh và nhạc AI",
              "difficulty": "advanced",
              "learn": "Tả ý tưởng để AI vẽ tranh, đọc truyện, làm bài hát",
              "product": "Bài hát và thiệp của em",
              "canDo": "Viết prompt có chủ thể, màu sắc, cảm xúc"
            },
            {
              "no": 3,
              "name": "Video và web của em",
              "difficulty": "expert",
              "learn": "Ghép tranh thành video, làm trang web đầu tiên",
              "product": "Video 1 phút · Trang web giới thiệu",
              "canDo": "Kể chuyện theo từng bước, tự tin trình bày"
            }
          ],
          "note": "Bám yêu cầu tiểu học của QĐ 2422/QĐ-BGDĐT: trải nghiệm AI có hướng dẫn, an toàn, tôn trọng bản quyền, mô tả quy trình theo các bước. An toàn theo độ tuổi: ChatGPT (từ 13 tuổi; 13–18 cần phụ huynh đồng ý) và Suno (từ 13 tuổi) do giáo viên thao tác trên màn hình chung, con đưa ý tưởng và viết prompt; Gemini dùng qua tài khoản Google có Family Link do phụ huynh bật; Canva dùng qua lớp do giáo viên mời, cần phụ huynh đồng ý với trẻ dưới 13 tuổi."
        }
      ],
      "contests": [],
      "contestNote": "Lộ trình thi đấu (tự chọn) chỉ dành cho AI for teen: Cuộc thi Sáng tạo trẻ quốc gia trong lĩnh vực AI bắt đầu từ Bảng A – THCS, chưa có bảng tiểu học. Học xong AI for kids, khi lên lớp 6 con học tiếp AI for teen.",
      "growth": [
        {
          "criterion": "Tư duy công nghệ",
          "before": "Làm theo hướng dẫn",
          "after1": "Mô tả ý tưởng thành các bước cho AI",
          "after2": "Thiết kế giải pháp AI cho vấn đề thật"
        },
        {
          "criterion": "Tư duy phản biện",
          "before": "Tin mọi câu AI trả lời",
          "after1": "Biết AI có thể sai, biết hỏi lại",
          "after2": "Kiểm chứng nguồn, nhận ra thiên lệch"
        },
        {
          "criterion": "Kỹ năng vi tính",
          "before": "Thao tác còn lúng túng",
          "after1": "Dùng thành thạo phần mềm, học online",
          "after2": "Làm chủ công cụ ảnh, nhạc, video, web"
        },
        {
          "criterion": "Tiếng Anh chuyên ngành",
          "before": "Chưa biết thuật ngữ",
          "after1": "Nhận biết prompt, chatbot, AI",
          "after2": "Viết prompt tiếng Anh đơn giản"
        },
        {
          "criterion": "Tự tin, trình bày",
          "before": "Ngại nói, ngại sai",
          "after1": "Giới thiệu sản phẩm trước lớp",
          "after2": "Báo cáo dự án trước phụ huynh"
        },
        {
          "criterion": "Tự chủ, hành vi số",
          "before": "Dùng máy tính để giải trí",
          "after1": "Tập trung, kiên trì sửa lỗi",
          "after2": "Dùng AI an toàn, có trách nhiệm"
        },
        {
          "criterion": "Chăm chỉ",
          "before": "Học khi được nhắc",
          "after1": "Đúng giờ, làm bài tập đầy đủ",
          "after2": "Tự giác học và luyện thêm"
        },
        {
          "criterion": "Trách nhiệm",
          "before": "Bỏ dở khi gặp khó",
          "after1": "Hoàn thành dự án đúng hạn",
          "after2": "Chủ động hỗ trợ bạn trong nhóm"
        },
        {
          "criterion": "Trung thực",
          "before": "Ngại thừa nhận lỗi",
          "after1": "Tự làm sản phẩm của mình",
          "after2": "Dám nhận lỗi, tôn trọng bài của bạn"
        }
      ],
      "competencies": [
        {
          "name": "Tư duy công nghệ",
          "group": "Tư duy",
          "desc": "Chia việc thành các bước, viết prompt rõ ràng cho AI.",
          "ref": "GDPT 2018 · Tin học: giải quyết vấn đề với CNTT"
        },
        {
          "name": "Tư duy phản biện",
          "group": "Tư duy",
          "desc": "Kiểm chứng câu trả lời, hỏi “AI nói đúng không?”.",
          "ref": "Năng lực chung: giải quyết vấn đề và sáng tạo"
        },
        {
          "name": "Kỹ năng vi tính",
          "group": "Kỹ năng số",
          "desc": "Thao tác máy tính, quản lý tệp ảnh, nhạc, video; học online.",
          "ref": "Khung năng lực số · Thông tư 02/2025"
        },
        {
          "name": "Tiếng Anh chuyên ngành",
          "group": "Kỹ năng số",
          "desc": "Đọc hiểu thuật ngữ: prompt, chatbot, data, model.",
          "ref": "Giao diện tiếng Anh của Suno, ChatGPT, Canva"
        },
        {
          "name": "Tự tin, trình bày",
          "group": "Bản lĩnh",
          "desc": "Báo cáo dự án sau mỗi học phần, tự tin trả lời câu hỏi.",
          "ref": "Năng lực chung: giao tiếp và hợp tác"
        },
        {
          "name": "Tự chủ, hành vi số",
          "group": "Bản lĩnh",
          "desc": "Dùng AI an toàn, trung thực, tôn trọng bản quyền.",
          "ref": "QĐ 2422 · mạch Đạo đức AI"
        },
        {
          "name": "Chăm chỉ",
          "group": "Phẩm chất",
          "desc": "Đúng giờ, làm bài tập đầy đủ",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trách nhiệm",
          "group": "Phẩm chất",
          "desc": "Hoàn thành dự án, giữ nề nếp lớp",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trung thực",
          "group": "Phẩm chất",
          "desc": "Tự làm sản phẩm, dám nhận lỗi",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        }
      ]
    },
    {
      "code": "AI-THCS",
      "track": "AI",
      "level": "thcs",
      "ageFrom": 11,
      "ageTo": 14,
      "name": "AI for teen",
      "tagline": "Con dùng AI để học, vẽ, làm nhạc, làm video và trang web, an toàn và có trách nhiệm.",
      "deckUrl": "https://claude.ai/artifact/QnjCd8vHtSH94WFSUyxNye",
      "years": [
        {
          "no": 1,
          "ageFrom": 11,
          "ageTo": 14,
          "title": "Làm chủ AI để học và sáng tạo",
          "software": "Bộ công cụ AI phổ biến",
          "tools": "Chạy trên trình duyệt, con tự thực hành dưới sự hướng dẫn của giáo viên.",
          "highlights": [
            "Con dùng AI hỗ trợ học tập: lập dàn ý, ôn bài, kiểm chứng thông tin.",
            "Con làm nhạc, video từ ảnh và prompt, cắt ghép thành phim ngắn."
          ],
          "featuredProjects": [
            "dự án AI giải quyết vấn đề kèm landing page"
          ],
          "modules": [
            {
              "no": 1,
              "name": "Trợ lý AI học tập",
              "difficulty": "basic",
              "learn": "Viết prompt có vai trò, nhiệm vụ, định dạng; kiểm chứng",
              "product": "Bộ prompt học tập · Poster, infographic",
              "canDo": "Dùng AI hỗ trợ học, không làm bài hộ"
            },
            {
              "no": 2,
              "name": "Nội dung số AI",
              "difficulty": "advanced",
              "learn": "Làm nhạc, video từ ảnh và prompt, dựng phim",
              "product": "Phim ngắn 2–3 phút có nhạc AI",
              "canDo": "Viết kịch bản, phân cảnh, làm chủ công cụ"
            },
            {
              "no": 3,
              "name": "Dự án AI và web",
              "difficulty": "expert",
              "learn": "AI học từ dữ liệu ra sao; làm landing page",
              "product": "Dự án AI · Landing page · Video demo",
              "canDo": "Giải quyết vấn đề thật, thuyết trình phản biện"
            }
          ],
          "note": "Bám yêu cầu THCS của QĐ 2422/QĐ-BGDĐT: dùng công cụ AI trực quan để tạo sản phẩm số; hiểu dữ liệu, thuật toán, mô hình; nhận diện rủi ro, thiên lệch dữ liệu, quyền riêng tư. Độ tuổi: ChatGPT từ 13 tuổi, 13–18 tuổi cần phụ huynh đồng ý; Suno từ 13 tuổi; CapCut 13+; Gemini cho dưới 13 tuổi qua Family Link. Học sinh 11–12 tuổi dùng công cụ từ 13 tuổi qua màn hình chung của giáo viên. Công cụ cụ thể có thể thay đổi theo cập nhật của nhà cung cấp."
        }
      ],
      "contests": [
        {
          "key": "STAI",
          "short": "Sáng tạo trẻ AI",
          "full": "Cuộc thi Sáng tạo trẻ quốc gia trong lĩnh vực AI (Bảng A – THCS)",
          "sessions": 15,
          "afterYear": 1,
          "eligibility": "Dành cho học sinh đã học xong AI for teen · Bảng A THCS",
          "syllabus": [
            "Buổi 1–4: nắm thể lệ, chọn vấn đề cần giải quyết.",
            "Buổi 5–12: làm sản phẩm AI và hồ sơ dự thi.",
            "Buổi 13–15: thi thử thuyết trình, phản biện."
          ],
          "reference": "Tham khảo mùa 2026: chung kết 20–22/11 tại Hà Nội",
          "notes": "Tham khảo mùa 2026: chung kết 20–22/11 tại Hà Nội. Hồ sơ dự thi Bảng A: Đội tối đa 3 học sinh và 1 giáo viên hướng dẫn; Hồ sơ: file PDF tối đa 8 trang; Video: thuyết trình 5 phút, demo 3 phút; Lịch sử câu lệnh: kê khai trung thực AI đã dùng; Nộp hồ sơ trực tuyến tại ai.tainangviet.vn. Giải thưởng — Vòng khu vực · mỗi bảng: 50 giải: 5 Nhất, 10 Nhì, 15 Ba, 20 Khuyến khích; Thí sinh đạt giải nhận giấy chứng nhận điện tử; Được tham gia huấn luyện chuyên đề của BTC. Vòng chung kết · mỗi bảng: 15 giải: 1 Nhất, 2 Nhì, 5 Ba, 7 Khuyến khích; Nhất, Nhì, Ba: Bằng khen của BCH Trung ương Đoàn; Mọi thí sinh vào chung kết nhận giấy chứng nhận. Đối tượng cuộc thi 12–22 tuổi (ghi chú slide). Kế hoạch – Thể lệ 2026 không nêu lệ phí đăng ký."
        }
      ],
      "contestNote": null,
      "growth": [
        {
          "criterion": "Tư duy công nghệ",
          "before": "Làm theo hướng dẫn",
          "after1": "Mô tả ý tưởng thành các bước cho AI",
          "after2": "Thiết kế giải pháp AI cho vấn đề thật"
        },
        {
          "criterion": "Tư duy phản biện",
          "before": "Tin mọi câu AI trả lời",
          "after1": "Biết AI có thể sai, biết hỏi lại",
          "after2": "Kiểm chứng nguồn, nhận ra thiên lệch"
        },
        {
          "criterion": "Kỹ năng vi tính",
          "before": "Thao tác còn lúng túng",
          "after1": "Dùng thành thạo phần mềm, học online",
          "after2": "Làm chủ công cụ ảnh, nhạc, video, web"
        },
        {
          "criterion": "Tiếng Anh chuyên ngành",
          "before": "Chưa biết thuật ngữ",
          "after1": "Nhận biết prompt, chatbot, AI",
          "after2": "Viết prompt tiếng Anh đơn giản"
        },
        {
          "criterion": "Tự tin, trình bày",
          "before": "Ngại nói, ngại sai",
          "after1": "Giới thiệu sản phẩm trước lớp",
          "after2": "Báo cáo dự án trước phụ huynh"
        },
        {
          "criterion": "Tự chủ, hành vi số",
          "before": "Dùng máy tính để giải trí",
          "after1": "Tập trung, kiên trì sửa lỗi",
          "after2": "Dùng AI an toàn, có trách nhiệm"
        },
        {
          "criterion": "Chăm chỉ",
          "before": "Học khi được nhắc",
          "after1": "Đúng giờ, làm bài tập đầy đủ",
          "after2": "Tự giác học và luyện thêm"
        },
        {
          "criterion": "Trách nhiệm",
          "before": "Bỏ dở khi gặp khó",
          "after1": "Hoàn thành dự án đúng hạn",
          "after2": "Chủ động hỗ trợ bạn trong nhóm"
        },
        {
          "criterion": "Trung thực",
          "before": "Ngại thừa nhận lỗi",
          "after1": "Tự làm sản phẩm của mình",
          "after2": "Dám nhận lỗi, tôn trọng bài của bạn"
        }
      ],
      "competencies": [
        {
          "name": "Tư duy công nghệ",
          "group": "Tư duy",
          "desc": "Chia việc thành các bước, viết prompt rõ ràng cho AI.",
          "ref": "GDPT 2018 · Tin học: giải quyết vấn đề với CNTT"
        },
        {
          "name": "Tư duy phản biện",
          "group": "Tư duy",
          "desc": "Kiểm chứng câu trả lời, hỏi “AI nói đúng không?”.",
          "ref": "Năng lực chung: giải quyết vấn đề và sáng tạo"
        },
        {
          "name": "Kỹ năng vi tính",
          "group": "Kỹ năng số",
          "desc": "Thao tác máy tính, quản lý tệp ảnh, nhạc, video; học online.",
          "ref": "Khung năng lực số · Thông tư 02/2025"
        },
        {
          "name": "Tiếng Anh chuyên ngành",
          "group": "Kỹ năng số",
          "desc": "Đọc hiểu thuật ngữ: prompt, chatbot, data, model.",
          "ref": "Giao diện tiếng Anh của Suno, ChatGPT, Canva"
        },
        {
          "name": "Tự tin, trình bày",
          "group": "Bản lĩnh",
          "desc": "Báo cáo dự án sau mỗi học phần, tự tin trả lời câu hỏi.",
          "ref": "Năng lực chung: giao tiếp và hợp tác"
        },
        {
          "name": "Tự chủ, hành vi số",
          "group": "Bản lĩnh",
          "desc": "Dùng AI an toàn, trung thực, tôn trọng bản quyền.",
          "ref": "QĐ 2422 · mạch Đạo đức AI"
        },
        {
          "name": "Chăm chỉ",
          "group": "Phẩm chất",
          "desc": "Đúng giờ, làm bài tập đầy đủ",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trách nhiệm",
          "group": "Phẩm chất",
          "desc": "Hoàn thành dự án, giữ nề nếp lớp",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trung thực",
          "group": "Phẩm chất",
          "desc": "Tự làm sản phẩm, dám nhận lỗi",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        }
      ]
    },
    {
      "code": "DOHOA-TH",
      "track": "DOHOA",
      "level": "tieu-hoc",
      "ageFrom": 8,
      "ageTo": 10,
      "name": "Tinkercad · thiết kế 3D",
      "tagline": "Con học dựng mô hình 3D và chỉnh sửa ảnh cùng công cụ AI, với giáo viên dạy trực tiếp qua ClassIn.",
      "deckUrl": "https://claude.ai/artifact/63D1QeU1TqmtVnwTBZvzd4",
      "years": [
        {
          "no": 1,
          "ageFrom": 8,
          "ageTo": 10,
          "title": "Thiết kế mô hình 3D với Tinkercad",
          "software": "Tinkercad của Autodesk",
          "tools": "Phần mềm thiết kế 3D miễn phí, chạy ngay trên trình duyệt, không cần cài đặt.",
          "highlights": [
            "Con ghép, khoét, xoay các khối hình để dựng mô hình 3D.",
            "Cùng giáo viên dùng AI tạo ảnh để tìm ý tưởng, rồi tự dựng mô hình."
          ],
          "featuredProjects": [
            "ngôi nhà mơ ước",
            "thành phố xanh của em"
          ],
          "modules": [
            {
              "no": 1,
              "name": "Làm quen thế giới 3D",
              "difficulty": "basic",
              "learn": "Kéo, xoay, ghép khối hình; đổi màu và kích thước",
              "product": "Móc khóa tên con · Ngôi nhà nhỏ",
              "canDo": "Tự dựng mô hình từ khối cơ bản"
            },
            {
              "no": 2,
              "name": "Thiết kế đồ vật",
              "difficulty": "advanced",
              "learn": "Khoét lỗ, nhóm khối, căn thẳng hàng, đo đúng kích thước",
              "product": "Hộp bút · Chiếc cốc · Đồ chơi",
              "canDo": "Thiết kế đồ vật đúng kích thước"
            },
            {
              "no": 3,
              "name": "Sáng tạo cùng AI",
              "difficulty": "expert",
              "learn": "Tạo hình bằng khối lệnh, dùng AI tìm ý tưởng thiết kế",
              "product": "Mô hình “Thành phố xanh của em”",
              "canDo": "Đi từ ý tưởng đến mô hình hoàn chỉnh"
            }
          ],
          "note": "Tinkercad (tinkercad.com) là ứng dụng thiết kế 3D trên trình duyệt của Autodesk, có thêm Codeblocks để lập trình tạo hình 3D bằng khối lệnh. Trẻ dưới 13 tuổi dùng tài khoản được phụ huynh chấp thuận hoặc tham gia lớp học do giáo viên tạo. Công cụ AI tạo ảnh do giáo viên thao tác bằng tài khoản giáo viên trong giờ học; học sinh tiểu học không tự lập tài khoản AI."
        }
      ],
      "contests": [],
      "contestNote": "Sau năm Tinkercad: Sản phẩm 3D vào hồ sơ công nghệ; lên THCS học tiếp Photoshop. Nhóm tiểu học hiện chưa có cuộc thi thiết kế 3D chính thức phù hợp nên chưa mở khóa luyện thi.",
      "growth": [
        {
          "criterion": "Tư duy công nghệ",
          "before": "Làm theo hướng dẫn",
          "after1": "Dựng mô hình 3D từ ý tưởng",
          "after2": "Lên bố cục, thiết kế có mục đích"
        },
        {
          "criterion": "Tư duy phản biện",
          "before": "Chấp nhận một đáp án",
          "after1": "Tự sửa khi mô hình chưa cân đối",
          "after2": "Nhận xét thiết kế, nhận biết ảnh AI"
        },
        {
          "criterion": "Kỹ năng vi tính",
          "before": "Thao tác còn lúng túng",
          "after1": "Dùng thành thạo phần mềm, học online",
          "after2": "Làm chủ Photoshop, phím tắt, quản lý tệp"
        },
        {
          "criterion": "Tiếng Anh chuyên ngành",
          "before": "Chưa biết thuật ngữ",
          "after1": "Nhận biết shape, hole, group",
          "after2": "Dùng giao diện tiếng Anh: layer, mask"
        },
        {
          "criterion": "Tự tin, trình bày",
          "before": "Ngại nói, ngại sai",
          "after1": "Giới thiệu sản phẩm trước lớp",
          "after2": "Báo cáo dự án trước phụ huynh"
        },
        {
          "criterion": "Tự chủ, hành vi số",
          "before": "Dùng máy tính để giải trí",
          "after1": "Tập trung, kiên trì sửa lỗi",
          "after2": "Dùng AI đúng mục đích, có trách nhiệm"
        },
        {
          "criterion": "Chăm chỉ",
          "before": "Học khi được nhắc",
          "after1": "Đúng giờ, làm bài tập đầy đủ",
          "after2": "Tự giác học và luyện thêm"
        },
        {
          "criterion": "Trách nhiệm",
          "before": "Bỏ dở khi gặp khó",
          "after1": "Hoàn thành dự án đúng hạn",
          "after2": "Chủ động hỗ trợ bạn trong nhóm"
        },
        {
          "criterion": "Trung thực",
          "before": "Ngại thừa nhận lỗi",
          "after1": "Tự làm sản phẩm của mình",
          "after2": "Dám nhận lỗi, tôn trọng bài của bạn"
        }
      ],
      "competencies": [
        {
          "name": "Tư duy công nghệ",
          "group": "Tư duy",
          "desc": "Biến ý tưởng thành bản thiết kế qua từng bước rõ ràng.",
          "ref": "GDPT 2018 · Tin học: giải quyết vấn đề với CNTT"
        },
        {
          "name": "Tư duy phản biện",
          "group": "Tư duy",
          "desc": "Nhận xét bố cục, màu sắc; phân biệt ảnh thật và ảnh AI.",
          "ref": "Năng lực chung: giải quyết vấn đề và sáng tạo"
        },
        {
          "name": "Kỹ năng vi tính",
          "group": "Kỹ năng số",
          "desc": "Dùng chuột, phím tắt, quản lý tệp, làm chủ phần mềm.",
          "ref": "Khung năng lực số · Thông tư 02/2025"
        },
        {
          "name": "Tiếng Anh chuyên ngành",
          "group": "Kỹ năng số",
          "desc": "Đọc hiểu thuật ngữ: layer, mask, crop, shape, group.",
          "ref": "Giao diện tiếng Anh của Tinkercad, Photoshop"
        },
        {
          "name": "Tự tin, trình bày",
          "group": "Bản lĩnh",
          "desc": "Báo cáo dự án sau mỗi học phần, tự tin trả lời câu hỏi.",
          "ref": "Năng lực chung: giao tiếp và hợp tác"
        },
        {
          "name": "Tự chủ, hành vi số",
          "group": "Bản lĩnh",
          "desc": "Dùng AI có trách nhiệm, tôn trọng bản quyền hình ảnh.",
          "ref": "Năng lực chung: tự chủ và tự học"
        },
        {
          "name": "Chăm chỉ",
          "group": "Phẩm chất",
          "desc": "Đúng giờ, làm bài tập đầy đủ",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trách nhiệm",
          "group": "Phẩm chất",
          "desc": "Hoàn thành dự án, giữ nề nếp lớp",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trung thực",
          "group": "Phẩm chất",
          "desc": "Tự làm sản phẩm, dám nhận lỗi",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        }
      ]
    },
    {
      "code": "DOHOA-THCS",
      "track": "DOHOA",
      "level": "thcs",
      "ageFrom": 11,
      "ageTo": 14,
      "name": "Photoshop · ảnh và AI",
      "tagline": "Con học dựng mô hình 3D và chỉnh sửa ảnh cùng công cụ AI, với giáo viên dạy trực tiếp qua ClassIn.",
      "deckUrl": "https://claude.ai/artifact/63D1QeU1TqmtVnwTBZvzd4",
      "years": [
        {
          "no": 1,
          "ageFrom": 11,
          "ageTo": 14,
          "title": "Thiết kế đồ họa với Photoshop và AI",
          "software": "Adobe Photoshop",
          "tools": "Phần mềm chỉnh sửa ảnh chuyên nghiệp, tích hợp AI tạo sinh Adobe Firefly.",
          "highlights": [
            "Con cắt, chỉnh màu, ghép ảnh bằng lớp (layer) và mặt nạ (mask).",
            "Dùng AI xóa vật thể, thêm chi tiết, mở rộng khung ảnh bằng câu mô tả."
          ],
          "featuredProjects": [
            "poster sự kiện trường",
            "bìa sách",
            "ảnh ghép sáng tạo"
          ],
          "modules": [
            {
              "no": 1,
              "name": "Làm quen chỉnh sửa ảnh",
              "difficulty": "basic",
              "learn": "Cắt ảnh, chỉnh sáng và màu; làm việc với lớp và chữ",
              "product": "Ảnh đại diện · Thiệp chúc mừng",
              "canDo": "Chỉnh ảnh đẹp, đúng kích thước"
            },
            {
              "no": 2,
              "name": "Ghép ảnh sáng tạo",
              "difficulty": "advanced",
              "learn": "Tạo vùng chọn, mặt nạ; ghép nhiều ảnh, hiệu ứng chữ",
              "product": "Ảnh ghép siêu thực · Bìa sách",
              "canDo": "Ghép ảnh tự nhiên, có ý tưởng"
            },
            {
              "no": 3,
              "name": "Thiết kế cùng AI",
              "difficulty": "expert",
              "learn": "Dùng AI xóa, thêm, mở rộng ảnh; bố cục poster",
              "product": "Poster chủ đề · Bộ ấn phẩm sự kiện",
              "canDo": "Tự thiết kế poster hoàn chỉnh theo chủ đề"
            }
          ],
          "note": "Nội dung năm học bám theo chuẩn kỹ năng của chứng chỉ Adobe Certified Professional (ACP) Photoshop. Tài khoản Adobe yêu cầu người dùng từ 13 tuổi; một số tính năng AI tạo sinh có thể bị giới hạn với tài khoản cá nhân của người chưa đủ 18 tuổi, vì vậy tài khoản học tập do trung tâm hoặc phụ huynh quản lý."
        }
      ],
      "contests": [
        {
          "key": "ACP",
          "short": "ACP Photoshop",
          "full": "Cuộc thi Vô địch Thiết kế đồ họa thế giới ACP (ACP World Championship) — Bảng C",
          "sessions": 15,
          "afterYear": 1,
          "eligibility": "Dành cho học sinh đã học xong năm Photoshop; Bảng C: Học sinh THCS, THPT dưới 18 tuổi; Mùa 2026: sinh từ 01/08/2013 trở về trước; Đăng ký qua trường, hoặc thí sinh tự do có chứng chỉ ACP",
          "syllabus": [
            "Buổi 1–4: nắm thể lệ, cấu trúc bài thi ACP và cách tính điểm.",
            "Buổi 5–12: luyện đề ACP Photoshop, thực hành từng dạng câu hỏi.",
            "Buổi 13–15: thi thử vòng loại, thiết kế poster theo chủ đề có giới hạn thời gian."
          ],
          "reference": "Tham khảo mùa 2026: vòng loại 29/3, chung kết quốc gia 19/4",
          "notes": "Tham khảo mùa 2026: vòng loại 29/3, chung kết quốc gia 19/4. 3 vòng thi: 1) Vòng loại quốc gia: thi trên máy tính tại Hà Nội, Đà Nẵng, TP.HCM; 2) Chung kết quốc gia: thiết kế poster trong 8 giờ; 3) Chung kết thế giới: tại Hoa Kỳ. Quyền lợi thí sinh · mùa 2026: Từ 700/1000 điểm vòng loại: chứng chỉ ACP giá trị toàn cầu; Ban tổ chức hỗ trợ 50% phí bài thi vòng loại; Vòng chung kết quốc gia do ban tổ chức tài trợ. Giải thưởng Bảng C · THCS, THPT: Giải Nhất: 40 triệu đồng, dự chung kết thế giới tại Hoa Kỳ; Giải Nhì, Ba, Khuyến khích: chứng nhận và tiền thưởng; Thế giới: huy chương, giải đến 8.000 USD. Khóa luyện thi tập trung Photoshop; trung tâm tư vấn thêm nếu học sinh muốn thi phần Illustrator."
        }
      ],
      "contestNote": null,
      "growth": [
        {
          "criterion": "Tư duy công nghệ",
          "before": "Làm theo hướng dẫn",
          "after1": "Dựng mô hình 3D từ ý tưởng",
          "after2": "Lên bố cục, thiết kế có mục đích"
        },
        {
          "criterion": "Tư duy phản biện",
          "before": "Chấp nhận một đáp án",
          "after1": "Tự sửa khi mô hình chưa cân đối",
          "after2": "Nhận xét thiết kế, nhận biết ảnh AI"
        },
        {
          "criterion": "Kỹ năng vi tính",
          "before": "Thao tác còn lúng túng",
          "after1": "Dùng thành thạo phần mềm, học online",
          "after2": "Làm chủ Photoshop, phím tắt, quản lý tệp"
        },
        {
          "criterion": "Tiếng Anh chuyên ngành",
          "before": "Chưa biết thuật ngữ",
          "after1": "Nhận biết shape, hole, group",
          "after2": "Dùng giao diện tiếng Anh: layer, mask"
        },
        {
          "criterion": "Tự tin, trình bày",
          "before": "Ngại nói, ngại sai",
          "after1": "Giới thiệu sản phẩm trước lớp",
          "after2": "Báo cáo dự án trước phụ huynh"
        },
        {
          "criterion": "Tự chủ, hành vi số",
          "before": "Dùng máy tính để giải trí",
          "after1": "Tập trung, kiên trì sửa lỗi",
          "after2": "Dùng AI đúng mục đích, có trách nhiệm"
        },
        {
          "criterion": "Chăm chỉ",
          "before": "Học khi được nhắc",
          "after1": "Đúng giờ, làm bài tập đầy đủ",
          "after2": "Tự giác học và luyện thêm"
        },
        {
          "criterion": "Trách nhiệm",
          "before": "Bỏ dở khi gặp khó",
          "after1": "Hoàn thành dự án đúng hạn",
          "after2": "Chủ động hỗ trợ bạn trong nhóm"
        },
        {
          "criterion": "Trung thực",
          "before": "Ngại thừa nhận lỗi",
          "after1": "Tự làm sản phẩm của mình",
          "after2": "Dám nhận lỗi, tôn trọng bài của bạn"
        }
      ],
      "competencies": [
        {
          "name": "Tư duy công nghệ",
          "group": "Tư duy",
          "desc": "Biến ý tưởng thành bản thiết kế qua từng bước rõ ràng.",
          "ref": "GDPT 2018 · Tin học: giải quyết vấn đề với CNTT"
        },
        {
          "name": "Tư duy phản biện",
          "group": "Tư duy",
          "desc": "Nhận xét bố cục, màu sắc; phân biệt ảnh thật và ảnh AI.",
          "ref": "Năng lực chung: giải quyết vấn đề và sáng tạo"
        },
        {
          "name": "Kỹ năng vi tính",
          "group": "Kỹ năng số",
          "desc": "Dùng chuột, phím tắt, quản lý tệp, làm chủ phần mềm.",
          "ref": "Khung năng lực số · Thông tư 02/2025"
        },
        {
          "name": "Tiếng Anh chuyên ngành",
          "group": "Kỹ năng số",
          "desc": "Đọc hiểu thuật ngữ: layer, mask, crop, shape, group.",
          "ref": "Giao diện tiếng Anh của Tinkercad, Photoshop"
        },
        {
          "name": "Tự tin, trình bày",
          "group": "Bản lĩnh",
          "desc": "Báo cáo dự án sau mỗi học phần, tự tin trả lời câu hỏi.",
          "ref": "Năng lực chung: giao tiếp và hợp tác"
        },
        {
          "name": "Tự chủ, hành vi số",
          "group": "Bản lĩnh",
          "desc": "Dùng AI có trách nhiệm, tôn trọng bản quyền hình ảnh.",
          "ref": "Năng lực chung: tự chủ và tự học"
        },
        {
          "name": "Chăm chỉ",
          "group": "Phẩm chất",
          "desc": "Đúng giờ, làm bài tập đầy đủ",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trách nhiệm",
          "group": "Phẩm chất",
          "desc": "Hoàn thành dự án, giữ nề nếp lớp",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trung thực",
          "group": "Phẩm chất",
          "desc": "Tự làm sản phẩm, dám nhận lỗi",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        }
      ]
    },
    {
      "code": "CODE-TH",
      "track": "CODE",
      "level": "tieu-hoc",
      "ageFrom": 8,
      "ageTo": 10,
      "name": "Scratch → CreatiCode AI",
      "tagline": "Con học lập trình kéo thả với Scratch, rồi làm game và ứng dụng AI cùng giáo viên qua ClassIn.",
      "deckUrl": "https://claude.ai/artifact/BryEmuex4TY6ygo7C9xNFf",
      "years": [
        {
          "no": 1,
          "ageFrom": 8,
          "ageTo": 9,
          "title": "Lập trình kéo thả với Scratch",
          "software": "Scratch",
          "tools": "Phần mềm lập trình kéo thả của MIT, miễn phí, có giao diện tiếng Việt, dành cho trẻ 8–16 tuổi.",
          "highlights": [
            "Con ghép khối lệnh để nhân vật chuyển động, nói chuyện, đổi trang phục.",
            "Thêm âm thanh, phông nền; dùng điều kiện và biến để làm game.",
            "Dự án tiêu biểu: Game phiêu lưu, Dự án tự chọn cuối năm."
          ],
          "featuredProjects": [
            "Game phiêu lưu",
            "Dự án tự chọn cuối năm"
          ],
          "modules": [
            {
              "no": 1,
              "name": "Hoạt hình kể chuyện",
              "difficulty": "basic",
              "learn": "Khối chuyển động, hiển thị, âm thanh; sự kiện, lặp lại",
              "product": "Tên chữ chuyển động · Kể chuyện hoạt hình",
              "canDo": "Làm hoạt hình có lời thoại, âm thanh"
            },
            {
              "no": 2,
              "name": "Game đầu tay",
              "difficulty": "advanced",
              "learn": "“Nếu… thì…”, cảm biến va chạm, biến đếm điểm",
              "product": "Game rượt đuổi · Game bóng Pong",
              "canDo": "Làm game có luật chơi, tính điểm"
            },
            {
              "no": 3,
              "name": "Game nhiều màn",
              "difficulty": "expert",
              "learn": "Nhiều phông nền theo màn, bản sao, danh sách, khối tự tạo",
              "product": "Game phiêu lưu · Dự án tự chọn cuối năm",
              "canDo": "Tự thiết kế game hoàn chỉnh"
            }
          ],
          "note": null
        },
        {
          "no": 2,
          "ageFrom": 9,
          "ageTo": 10,
          "title": "Lập trình AI và 3D với CreatiCode",
          "software": "CreatiCode AI",
          "tools": "Nền tảng xây trên Scratch 3.0, thêm khối AI (chatbot, giọng nói, nhận diện bàn tay, tư thế) và thế giới 3D.",
          "highlights": [
            "Con dùng khối chatbot, đọc to văn bản, nghe giọng nói để làm nhân vật AI.",
            "Dựng cảnh 3D, cho AI nhận diện bàn tay, cơ thể qua camera.",
            "Dự án tiêu biểu: Đếm ngón tay bằng AI, Game thể dục AI."
          ],
          "featuredProjects": [
            "Đếm ngón tay bằng AI",
            "Game thể dục AI"
          ],
          "modules": [
            {
              "no": 1,
              "name": "Trợ lý AI của em",
              "difficulty": "basic",
              "learn": "Khối chatbot, chữ thành giọng nói, nghe giọng nói; hỏi AI rõ ràng",
              "product": "Hỏi AI mọi điều · Nhân vật AI biết trò chuyện",
              "canDo": "Tạo nhân vật AI biết trò chuyện"
            },
            {
              "no": 2,
              "name": "Thế giới 3D",
              "difficulty": "advanced",
              "learn": "Tạo cảnh 3D, vật thể, camera, ánh sáng, chuyển động",
              "product": "Trái Đất xoay 3D · Hệ Mặt Trời chuyển động",
              "canDo": "Dựng thế giới 3D tương tác"
            },
            {
              "no": 3,
              "name": "AI nhìn và hiểu",
              "difficulty": "expert",
              "learn": "Nhận diện bàn tay, tư thế cơ thể qua camera; ghép AI vào game",
              "product": "Đếm ngón tay bằng AI · Game thể dục AI",
              "canDo": "Ghép AI vào game của mình"
            }
          ],
          "note": null
        }
      ],
      "contests": [
        {
          "key": "THT",
          "short": "Tin học trẻ",
          "full": "Hội thi Tin học trẻ toàn quốc (Bảng A – Tiểu học)",
          "sessions": 30,
          "afterYear": 1,
          "eligibility": "Sau Năm 1 · bảng A tiểu học",
          "syllabus": [
            "Buổi 1–8: nắm thể lệ, cách chấm và các dạng đề.",
            "Buổi 9–24: luyện đề theo từng dạng bài toán.",
            "Buổi 25–30: thi thử 90 phút trực tuyến."
          ],
          "reference": "Tham khảo mùa 2026: vòng loại online 29/3 và 26/4",
          "notes": "Sau Năm 1 · bảng A tiểu học. Thi cá nhân: giải bài toán bằng Scratch (hoặc Python), máy chấm điểm. Buổi 1–8: nắm thể lệ, cách chấm và các dạng đề. Buổi 9–24: luyện đề theo từng dạng bài toán. Buổi 25–30: thi thử 90 phút trực tuyến. Tham khảo mùa 2026: vòng loại online 29/3 và 26/4."
        },
        {
          "key": "HKICO",
          "short": "HKICO",
          "full": "HKICO – Olympic tư duy máy tính quốc tế Hồng Kông (Hong Kong International Computational Olympiad)",
          "sessions": 30,
          "afterYear": 2,
          "eligibility": "Sau Năm 2 · Olympic quốc tế",
          "syllabus": [
            "Buổi 1–8: làm quen đề tiếng Anh, cách tính điểm.",
            "Buổi 9–24: luyện đọc chương trình, logic, quy luật.",
            "Buổi 25–30: thi thử 60 phút như vòng loại."
          ],
          "reference": "Tham khảo mùa 2026: vòng loại online 1/2, quốc gia 19/4",
          "notes": "Sau Năm 2 · Olympic quốc tế. Trắc nghiệm tư duy máy tính bằng tiếng Anh, thi Scratch hoặc Blockly theo lớp. Buổi 1–8: làm quen đề tiếng Anh, cách tính điểm. Buổi 9–24: luyện đọc chương trình, logic, quy luật. Buổi 25–30: thi thử 60 phút như vòng loại. Tham khảo mùa 2026: vòng loại online 1/2, quốc gia 19/4."
        }
      ],
      "contestNote": null,
      "growth": [
        {
          "criterion": "Tư duy công nghệ",
          "before": "Làm theo hướng dẫn",
          "after1": "Chia bài toán thành các bước",
          "after2": "Tự lên ý tưởng, ghép AI vào game"
        },
        {
          "criterion": "Tư duy phản biện",
          "before": "Chấp nhận một đáp án",
          "after1": "Tự tìm lỗi khi game chạy sai",
          "after2": "Biết AI cũng có lúc trả lời sai"
        },
        {
          "criterion": "Kỹ năng vi tính",
          "before": "Thao tác còn lúng túng",
          "after1": "Kéo thả, lưu và mở dự án",
          "after2": "Dùng camera, micro để làm dự án"
        },
        {
          "criterion": "Tiếng Anh chuyên ngành",
          "before": "Chưa biết thuật ngữ",
          "after1": "Nhận biết sprite, loop, if",
          "after2": "Đọc hiểu khối lệnh tiếng Anh"
        },
        {
          "criterion": "Tự tin, trình bày",
          "before": "Ngại nói, ngại sai",
          "after1": "Giới thiệu game trước lớp",
          "after2": "Báo cáo dự án trước phụ huynh"
        },
        {
          "criterion": "Tự chủ, hành vi số",
          "before": "Dùng máy tính để giải trí",
          "after1": "Tập trung, kiên trì sửa lỗi",
          "after2": "Dùng AI an toàn, đúng mục đích"
        },
        {
          "criterion": "Chăm chỉ",
          "before": "Học khi được nhắc",
          "after1": "Đúng giờ, làm bài tập đầy đủ",
          "after2": "Tự giác học và luyện thêm"
        },
        {
          "criterion": "Trách nhiệm",
          "before": "Bỏ dở khi gặp khó",
          "after1": "Hoàn thành dự án đúng hạn",
          "after2": "Chủ động hỗ trợ bạn trong nhóm"
        },
        {
          "criterion": "Trung thực",
          "before": "Ngại thừa nhận lỗi",
          "after1": "Tự làm sản phẩm của mình",
          "after2": "Dám nhận lỗi, tôn trọng bài của bạn"
        }
      ],
      "competencies": [
        {
          "name": "Tư duy công nghệ",
          "group": "Tư duy",
          "desc": "Chia nhỏ vấn đề, tìm quy luật, viết thuật toán cho sản phẩm.",
          "ref": "GDPT 2018 · Tin học: giải quyết vấn đề với CNTT"
        },
        {
          "name": "Tư duy phản biện",
          "group": "Tư duy",
          "desc": "Tìm lỗi, so sánh cách giải, kiểm chứng câu trả lời của AI.",
          "ref": "Năng lực chung: giải quyết vấn đề và sáng tạo"
        },
        {
          "name": "Kỹ năng vi tính",
          "group": "Kỹ năng số",
          "desc": "Gõ phím, quản lý tệp, cài đặt phần mềm, học online.",
          "ref": "Khung năng lực số · Thông tư 02/2025"
        },
        {
          "name": "Tiếng Anh chuyên ngành",
          "group": "Kỹ năng số",
          "desc": "Đọc hiểu thuật ngữ, câu lệnh tiếng Anh trong phần mềm.",
          "ref": "Giao diện và câu lệnh lập trình bằng tiếng Anh"
        },
        {
          "name": "Tự tin, trình bày",
          "group": "Bản lĩnh",
          "desc": "Giới thiệu sản phẩm của mình, tự tin trả lời câu hỏi.",
          "ref": "Năng lực chung: giao tiếp và hợp tác"
        },
        {
          "name": "Tự chủ, hành vi số",
          "group": "Bản lĩnh",
          "desc": "Kiên trì sửa lỗi; dùng AI an toàn, có trách nhiệm.",
          "ref": "Năng lực chung: tự chủ và tự học"
        },
        {
          "name": "Chăm chỉ",
          "group": "Phẩm chất",
          "desc": "Đúng giờ, làm bài tập đầy đủ",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trách nhiệm",
          "group": "Phẩm chất",
          "desc": "Hoàn thành dự án, giữ nề nếp lớp",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trung thực",
          "group": "Phẩm chất",
          "desc": "Tự làm bài, nói rõ phần AI hỗ trợ",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        }
      ]
    },
    {
      "code": "CODE-THCS1",
      "track": "CODE",
      "level": "thcs",
      "ageFrom": 11,
      "ageTo": 13,
      "name": "Roblox Lua → App Inventor",
      "tagline": "Con làm game 3D với Roblox Lua và ứng dụng điện thoại có AI với App Inventor, học cùng giáo viên qua ClassIn.",
      "deckUrl": "https://claude.ai/artifact/SWecFgqfDYtXqQQFKAjqEZ",
      "years": [
        {
          "no": 1,
          "ageFrom": 11,
          "ageTo": 12,
          "title": "Làm game 3D với Roblox Studio",
          "software": "Roblox Lua",
          "tools": "Phần mềm làm game 3D miễn phí của Roblox cho Windows, Mac. Con viết code bằng Luau, ngôn ngữ phát triển từ Lua.",
          "highlights": [
            "Con dựng màn chơi 3D bằng khối, mô hình trong Roblox Studio.",
            "Viết script Luau: biến, hàm, sự kiện, lệnh if, vòng lặp.",
            "Dự án tiêu biểu: Game phiêu lưu, Đấu trường nhiều vòng."
          ],
          "featuredProjects": [
            "Game phiêu lưu",
            "Đấu trường nhiều vòng"
          ],
          "modules": [
            {
              "no": 1,
              "name": "Làm quen Roblox Studio",
              "difficulty": "basic",
              "learn": "Giao diện Studio, khối 3D, biến, hàm, sự kiện, lệnh if",
              "product": "Bẫy chạm là thua · Vật phẩm tăng sức",
              "canDo": "Dựng màn chơi có bẫy và luật"
            },
            {
              "no": 2,
              "name": "Game nhảy nền thu xu",
              "difficulty": "advanced",
              "learn": "Vòng lặp, bảng dữ liệu, thu xu, bảng điểm, nâng cấp",
              "product": "Cầu hẹn giờ · Game nhảy nền thu xu",
              "canDo": "Làm game có điểm và nâng cấp"
            },
            {
              "no": 3,
              "name": "Game nhiều người chơi",
              "difficulty": "expert",
              "learn": "Module script, sự kiện, mảng người chơi, vòng ván",
              "product": "Game phiêu lưu · Đấu trường nhiều vòng",
              "canDo": "Tự làm game nhiều người chơi"
            }
          ],
          "note": null
        },
        {
          "no": 2,
          "ageFrom": 12,
          "ageTo": 13,
          "title": "Làm app điện thoại với App Inventor",
          "software": "App Inventor",
          "tools": "Công cụ làm app điện thoại miễn phí của MIT: thiết kế màn hình kéo thả, lập trình bằng khối lệnh.",
          "highlights": [
            "Thiết kế màn hình app, chạy thử ngay trên điện thoại qua MIT AI2 Companion.",
            "Dùng cảm biến, lưu dữ liệu, bản đồ; thêm chatbot và nhận diện ảnh.",
            "Dự án tiêu biểu: App hỏi đáp ChatGPT, Trò ú òa PICaboo."
          ],
          "featuredProjects": [
            "App hỏi đáp ChatGPT",
            "Trò ú òa PICaboo"
          ],
          "modules": [
            {
              "no": 1,
              "name": "App đầu tay",
              "difficulty": "basic",
              "learn": "Thiết kế màn hình, nút, âm thanh, vẽ, sự kiện",
              "product": "Mèo kêu meo HelloPurr · Tô màu PaintPot",
              "canDo": "Làm app chạy trên điện thoại"
            },
            {
              "no": 2,
              "name": "App dữ liệu & bản đồ",
              "difficulty": "advanced",
              "learn": "Biến, danh sách, lưu dữ liệu, cảm biến vị trí",
              "product": "Đố vui QuizMe · Tìm xe Where's My Car?",
              "canDo": "Làm app nhớ dữ liệu, dùng GPS"
            },
            {
              "no": 3,
              "name": "App có AI",
              "difficulty": "expert",
              "learn": "Chatbot, dạy máy phân loại ảnh, đạo đức AI",
              "product": "App hỏi đáp ChatGPT · Trò ú òa PICaboo",
              "canDo": "Đưa AI vào app của mình"
            }
          ],
          "note": null
        }
      ],
      "contests": [
        {
          "key": "KHKT",
          "short": "KHKT",
          "full": "Cuộc thi nghiên cứu khoa học, kỹ thuật cấp quốc gia (KHKT, lớp 8–12)",
          "sessions": 30,
          "afterYear": 2,
          "eligibility": "Sau Năm 2 · học sinh từ lớp 8 · cá nhân hoặc nhóm 2 bạn",
          "syllabus": [
            "Buổi 1–8: thể lệ, chọn vấn đề, viết kế hoạch nghiên cứu.",
            "Buổi 9–24: làm sản phẩm, thử nghiệm, ghi sổ nghiên cứu.",
            "Buổi 25–30: hoàn thiện hồ sơ, poster, tập trả lời giám khảo."
          ],
          "reference": "Tham khảo mùa 2025–2026: vòng quốc gia 20–22/3/2026",
          "notes": "Sau Năm 2 · học sinh từ lớp 8 · cá nhân hoặc nhóm 2 bạn. Con chọn một vấn đề thực tế, nghiên cứu và làm sản phẩm phần mềm để giải quyết. Buổi 1–8: thể lệ, chọn vấn đề, viết kế hoạch nghiên cứu. Buổi 9–24: làm sản phẩm, thử nghiệm, ghi sổ nghiên cứu. Buổi 25–30: hoàn thiện hồ sơ, poster, tập trả lời giám khảo. Tham khảo mùa 2025–2026: vòng quốc gia 20–22/3/2026."
        }
      ],
      "contestNote": null,
      "growth": [
        {
          "criterion": "Tư duy công nghệ",
          "before": "Chơi game người khác làm",
          "after1": "Tự viết code điều khiển game",
          "after2": "Thiết kế app giải quyết việc thật"
        },
        {
          "criterion": "Tư duy phản biện",
          "before": "Tin ngay mọi câu trả lời",
          "after1": "Tự tìm lỗi khi game chạy sai",
          "after2": "Kiểm chứng kết quả của AI"
        },
        {
          "criterion": "Kỹ năng vi tính",
          "before": "Thao tác còn lúng túng",
          "after1": "Gõ code, dùng phần mềm 3D",
          "after2": "Cài app lên điện thoại, lưu dự án"
        },
        {
          "criterion": "Tiếng Anh chuyên ngành",
          "before": "Chưa biết thuật ngữ",
          "after1": "Đọc hiểu if, for, function",
          "after2": "Nhận biết button, label, list"
        },
        {
          "criterion": "Tự tin, trình bày",
          "before": "Ngại nói, ngại sai",
          "after1": "Giới thiệu game trước lớp",
          "after2": "Báo cáo dự án trước phụ huynh"
        },
        {
          "criterion": "Tự chủ, hành vi số",
          "before": "Dùng máy tính để giải trí",
          "after1": "Chơi game có kiểm soát, biết sáng tạo",
          "after2": "Dùng AI an toàn, có trách nhiệm"
        },
        {
          "criterion": "Chăm chỉ",
          "before": "Học khi được nhắc",
          "after1": "Đúng giờ, làm bài tập đầy đủ",
          "after2": "Tự giác học và luyện thêm"
        },
        {
          "criterion": "Trách nhiệm",
          "before": "Bỏ dở khi gặp khó",
          "after1": "Hoàn thành dự án đúng hạn",
          "after2": "Chủ động hỗ trợ bạn trong nhóm"
        },
        {
          "criterion": "Trung thực",
          "before": "Chép bài, nhờ AI làm hộ",
          "after1": "Tự làm sản phẩm của mình",
          "after2": "Nói rõ phần nào có AI hỗ trợ"
        }
      ],
      "competencies": [
        {
          "name": "Tư duy công nghệ",
          "group": "Tư duy",
          "desc": "Chia nhỏ vấn đề, tìm quy luật, viết thuật toán cho sản phẩm.",
          "ref": "GDPT 2018 · Tin học: giải quyết vấn đề với CNTT"
        },
        {
          "name": "Tư duy phản biện",
          "group": "Tư duy",
          "desc": "Tìm lỗi, so sánh cách giải, kiểm chứng câu trả lời của AI.",
          "ref": "Năng lực chung: giải quyết vấn đề và sáng tạo"
        },
        {
          "name": "Kỹ năng vi tính",
          "group": "Kỹ năng số",
          "desc": "Gõ phím, quản lý tệp, cài đặt phần mềm, học online.",
          "ref": "Khung năng lực số · Thông tư 02/2025"
        },
        {
          "name": "Tiếng Anh chuyên ngành",
          "group": "Kỹ năng số",
          "desc": "Đọc hiểu thuật ngữ, câu lệnh tiếng Anh trong phần mềm.",
          "ref": "Giao diện và câu lệnh lập trình bằng tiếng Anh"
        },
        {
          "name": "Tự tin, trình bày",
          "group": "Bản lĩnh",
          "desc": "Giới thiệu sản phẩm của mình, tự tin trả lời câu hỏi.",
          "ref": "Năng lực chung: giao tiếp và hợp tác"
        },
        {
          "name": "Tự chủ, hành vi số",
          "group": "Bản lĩnh",
          "desc": "Kiên trì sửa lỗi; dùng AI an toàn, có trách nhiệm.",
          "ref": "Năng lực chung: tự chủ và tự học"
        },
        {
          "name": "Chăm chỉ",
          "group": "Phẩm chất",
          "desc": "Đúng giờ, làm bài tập đầy đủ",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trách nhiệm",
          "group": "Phẩm chất",
          "desc": "Hoàn thành dự án, giữ nề nếp lớp",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trung thực",
          "group": "Phẩm chất",
          "desc": "Tự làm bài, nói rõ phần AI hỗ trợ",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        }
      ]
    },
    {
      "code": "CODE-THCS2",
      "track": "CODE",
      "level": "thcs",
      "ageFrom": 13,
      "ageTo": 15,
      "name": "Python → Lập trình web",
      "tagline": "Con viết code Python, làm phần mềm và game, rồi thiết kế website với HTML, CSS, JavaScript.",
      "deckUrl": "https://claude.ai/artifact/EQUCQCNpgApwVWKcfKr3HV",
      "years": [
        {
          "no": 1,
          "ageFrom": 13,
          "ageTo": 14,
          "title": "Lập trình Python: phần mềm và game",
          "software": "Python",
          "tools": "Python là ngôn ngữ con sẽ học ở lớp 10. Thonny là phần mềm viết Python miễn phí cho người mới.",
          "highlights": [
            "Con gõ lệnh Python, vẽ bằng turtle, chạy từng bước để hiểu chương trình.",
            "Làm phần mềm có cửa sổ, nút bấm bằng Tkinter; làm game bằng Pygame Zero.",
            "Dự án tiêu biểu: Game bấm trúng alien, Game Flappy Bird."
          ],
          "featuredProjects": [
            "Game bấm trúng alien",
            "Game Flappy Bird"
          ],
          "modules": [
            {
              "no": 1,
              "name": "Python nền tảng",
              "difficulty": "basic",
              "learn": "Biến, if, vòng lặp, hàm, danh sách; vẽ bằng turtle",
              "product": "Vẽ ngôi sao bằng turtle · Dãy số Fibonacci",
              "canDo": "Viết chương trình Python cơ bản"
            },
            {
              "no": 2,
              "name": "Phần mềm Tkinter",
              "difficulty": "advanced",
              "learn": "Cửa sổ, nhãn, nút bấm, ô nhập, bố cục lưới",
              "product": "App đổi feet ra mét · Máy tính bỏ túi",
              "canDo": "Làm phần mềm có giao diện"
            },
            {
              "no": 3,
              "name": "Game Pygame Zero",
              "difficulty": "expert",
              "learn": "Nhân vật, chuột/phím, va chạm, âm thanh, điểm số",
              "product": "Game bấm trúng alien · Game Flappy Bird",
              "canDo": "Tự làm game 2D hoàn chỉnh"
            }
          ],
          "note": null
        },
        {
          "no": 2,
          "ageFrom": 14,
          "ageTo": 15,
          "title": "Thiết kế và lập trình website",
          "software": "Lập trình web",
          "tools": "HTML dựng nội dung, CSS làm đẹp, JavaScript tạo tương tác. Con viết code trong VS Code, phác thảo giao diện bằng Figma.",
          "highlights": [
            "Con dựng trang web: chữ, ảnh, liên kết, bảng, biểu mẫu.",
            "Phác thảo giao diện trên Figma, rồi dựng bằng CSS cho cả máy tính và điện thoại.",
            "Dự án tiêu biểu: Game đoán số, Game bóng nảy (canvas)."
          ],
          "featuredProjects": [
            "Game đoán số",
            "Game bóng nảy (canvas)"
          ],
          "modules": [
            {
              "no": 1,
              "name": "HTML nền tảng",
              "difficulty": "basic",
              "learn": "Cấu trúc trang, chữ, liên kết, ảnh, bảng, biểu mẫu",
              "product": "Trang về côn trùng · Bảng dữ liệu hành tinh",
              "canDo": "Tự dựng một trang web"
            },
            {
              "no": 2,
              "name": "CSS và thiết kế Figma",
              "difficulty": "advanced",
              "learn": "Phông chữ, màu, Flexbox, Grid, web cho điện thoại",
              "product": "Trang chủ trường học · Bố cục mobile-first",
              "canDo": "Thiết kế rồi dựng web đẹp"
            },
            {
              "no": 3,
              "name": "JavaScript",
              "difficulty": "expert",
              "learn": "Biến, điều kiện, hàm, sự kiện, DOM, đối tượng",
              "product": "Game đoán số · Game bóng nảy (canvas)",
              "canDo": "Làm web biết tương tác"
            }
          ],
          "note": null
        }
      ],
      "contests": [
        {
          "key": "HKICO",
          "short": "HKICO",
          "full": "HKICO – Olympic tư duy máy tính quốc tế Hồng Kông (Hong Kong International Computational Olympiad)",
          "sessions": 30,
          "afterYear": 1,
          "eligibility": "Sau Năm 1 · lớp 8 trở lên thi Python",
          "syllabus": [
            "Buổi 1–8: làm quen đề tiếng Anh, cách tính điểm.",
            "Buổi 9–24: luyện đọc code Python, logic, quy luật.",
            "Buổi 25–30: thi thử 60 phút như vòng loại."
          ],
          "reference": "Tham khảo mùa 2026: vòng loại online 1/2, quốc gia 19/4",
          "notes": "Sau Năm 1 · lớp 8 trở lên thi Python. Trắc nghiệm tư duy máy tính bằng tiếng Anh: đọc code, logic, thuật toán. Buổi 1–8: làm quen đề tiếng Anh, cách tính điểm. Buổi 9–24: luyện đọc code Python, logic, quy luật. Buổi 25–30: thi thử 60 phút như vòng loại. Tham khảo mùa 2026: vòng loại online 1/2, quốc gia 19/4."
        },
        {
          "key": "KHKT",
          "short": "KHKT",
          "full": "Cuộc thi nghiên cứu khoa học, kỹ thuật cấp quốc gia (KHKT, lớp 8–12)",
          "sessions": 30,
          "afterYear": 2,
          "eligibility": "Sau Năm 2 · lớp 8–12 · cá nhân hoặc nhóm 2 bạn",
          "syllabus": [
            "Buổi 1–8: thể lệ, chọn vấn đề, kế hoạch nghiên cứu.",
            "Buổi 9–24: làm sản phẩm, thử nghiệm, ghi sổ nghiên cứu.",
            "Buổi 25–30: hồ sơ, poster, tập trả lời giám khảo."
          ],
          "reference": "Tham khảo mùa 2025–2026: vòng quốc gia 20–22/3/2026",
          "notes": "Sau Năm 2 · lớp 8–12 · cá nhân hoặc nhóm 2 bạn. Con chọn vấn đề thực tế, làm sản phẩm phần mềm hoặc website để giải quyết. Buổi 1–8: thể lệ, chọn vấn đề, kế hoạch nghiên cứu. Buổi 9–24: làm sản phẩm, thử nghiệm, ghi sổ nghiên cứu. Buổi 25–30: hồ sơ, poster, tập trả lời giám khảo. Tham khảo mùa 2025–2026: vòng quốc gia 20–22/3/2026."
        }
      ],
      "contestNote": null,
      "growth": [
        {
          "criterion": "Tư duy công nghệ",
          "before": "Dùng phần mềm người khác làm",
          "after1": "Viết thuật toán bằng Python",
          "after2": "Thiết kế và dựng website hoàn chỉnh"
        },
        {
          "criterion": "Tư duy phản biện",
          "before": "Tin ngay mọi câu trả lời",
          "after1": "Tự tìm lỗi, chạy từng bước",
          "after2": "Kiểm chứng kết quả của AI"
        },
        {
          "criterion": "Kỹ năng vi tính",
          "before": "Gõ phím chậm",
          "after1": "Gõ code nhanh, quản lý tệp",
          "after2": "Dùng VS Code, trình duyệt thành thạo"
        },
        {
          "criterion": "Tiếng Anh chuyên ngành",
          "before": "Chưa biết thuật ngữ",
          "after1": "Đọc hiểu print, if, for, def",
          "after2": "Đọc tài liệu web tiếng Anh"
        },
        {
          "criterion": "Tự tin, trình bày",
          "before": "Ngại nói, ngại sai",
          "after1": "Giới thiệu phần mềm trước lớp",
          "after2": "Báo cáo dự án trước phụ huynh"
        },
        {
          "criterion": "Tự chủ, hành vi số",
          "before": "Dùng máy tính để giải trí",
          "after1": "Tập trung, kiên trì sửa lỗi",
          "after2": "Dùng AI an toàn, có trách nhiệm"
        },
        {
          "criterion": "Chăm chỉ",
          "before": "Học khi được nhắc",
          "after1": "Đúng giờ, làm bài tập đầy đủ",
          "after2": "Tự giác học và luyện thêm"
        },
        {
          "criterion": "Trách nhiệm",
          "before": "Bỏ dở khi gặp khó",
          "after1": "Hoàn thành dự án đúng hạn",
          "after2": "Chủ động hỗ trợ bạn trong nhóm"
        },
        {
          "criterion": "Trung thực",
          "before": "Chép bài, nhờ AI làm hộ",
          "after1": "Tự làm sản phẩm của mình",
          "after2": "Nói rõ phần nào có AI hỗ trợ"
        }
      ],
      "competencies": [
        {
          "name": "Tư duy công nghệ",
          "group": "Tư duy",
          "desc": "Chia nhỏ vấn đề, tìm quy luật, viết thuật toán cho sản phẩm.",
          "ref": "GDPT 2018 · Tin học: giải quyết vấn đề với CNTT"
        },
        {
          "name": "Tư duy phản biện",
          "group": "Tư duy",
          "desc": "Tìm lỗi, so sánh cách giải, kiểm chứng câu trả lời của AI.",
          "ref": "Năng lực chung: giải quyết vấn đề và sáng tạo"
        },
        {
          "name": "Kỹ năng vi tính",
          "group": "Kỹ năng số",
          "desc": "Gõ phím, quản lý tệp, cài đặt phần mềm, học online.",
          "ref": "Khung năng lực số · Thông tư 02/2025"
        },
        {
          "name": "Tiếng Anh chuyên ngành",
          "group": "Kỹ năng số",
          "desc": "Đọc hiểu thuật ngữ, câu lệnh tiếng Anh trong phần mềm.",
          "ref": "Giao diện và câu lệnh lập trình bằng tiếng Anh"
        },
        {
          "name": "Tự tin, trình bày",
          "group": "Bản lĩnh",
          "desc": "Giới thiệu sản phẩm của mình, tự tin trả lời câu hỏi.",
          "ref": "Năng lực chung: giao tiếp và hợp tác"
        },
        {
          "name": "Tự chủ, hành vi số",
          "group": "Bản lĩnh",
          "desc": "Kiên trì sửa lỗi; dùng AI an toàn, có trách nhiệm.",
          "ref": "Năng lực chung: tự chủ và tự học"
        },
        {
          "name": "Chăm chỉ",
          "group": "Phẩm chất",
          "desc": "Đúng giờ, làm bài tập đầy đủ",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trách nhiệm",
          "group": "Phẩm chất",
          "desc": "Hoàn thành dự án, giữ nề nếp lớp",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trung thực",
          "group": "Phẩm chất",
          "desc": "Tự làm bài, nói rõ phần AI hỗ trợ",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        }
      ]
    },
    {
      "code": "CODE-THPT",
      "track": "CODE",
      "level": "thpt",
      "ageFrom": 15,
      "ageTo": 18,
      "name": "Web full-stack → WordPress",
      "tagline": "Con lập trình website hoàn chỉnh từ giao diện đến cơ sở dữ liệu, rồi làm chủ WordPress.",
      "deckUrl": "https://claude.ai/artifact/B9Mxd1xttKekr7HbeGdSWD",
      "years": [
        {
          "no": 1,
          "ageFrom": 15,
          "ageTo": 16,
          "title": "Lập trình website từ giao diện đến dữ liệu",
          "software": "Web full-stack",
          "tools": "Con làm cả giao diện website (HTML, CSS, JavaScript, Bootstrap) và phần lưu dữ liệu (SQLite, Django viết bằng Python).",
          "highlights": [
            "Dựng giao diện bằng HTML, CSS; làm đẹp nhanh với lưới và thành phần Bootstrap.",
            "Lưu dữ liệu bằng SQLite, viết trang web động và trang quản trị với Django.",
            "Dự án tiêu biểu: Ứng dụng bình chọn, Web thư viện."
          ],
          "featuredProjects": [
            "Ứng dụng bình chọn",
            "Web thư viện"
          ],
          "modules": [
            {
              "no": 1,
              "name": "HTML & CSS nền tảng",
              "difficulty": "basic",
              "learn": "Cấu trúc trang, biểu mẫu, bố cục, web trên điện thoại",
              "product": "Trang tiểu sử · Trang chủ trường học",
              "canDo": "Tự dựng website tĩnh"
            },
            {
              "no": 2,
              "name": "JavaScript & Bootstrap",
              "difficulty": "advanced",
              "learn": "Biến, hàm, sự kiện; lưới và thành phần Bootstrap",
              "product": "Truyện vui ngẫu nhiên · Thư viện ảnh",
              "canDo": "Làm web đẹp, có tương tác"
            },
            {
              "no": 3,
              "name": "SQLite & Django",
              "difficulty": "expert",
              "learn": "Mô hình dữ liệu, SQLite, trang quản trị, biểu mẫu",
              "product": "Ứng dụng bình chọn · Web thư viện",
              "canDo": "Làm website có lưu dữ liệu"
            }
          ],
          "note": null
        },
        {
          "no": 2,
          "ageFrom": 16,
          "ageTo": 18,
          "title": "Làm chủ website với WordPress",
          "software": "WordPress",
          "tools": "Phần mềm làm website mã nguồn mở. Theo W3Techs, 39,6% website trên thế giới dùng WordPress (10/2026).",
          "highlights": [
            "Dựng website bằng trình soạn thảo khối, chọn giao diện, gắn plugin.",
            "Làm cửa hàng trực tuyến; bảo mật, sao lưu, tối ưu tìm kiếm (SEO).",
            "Dự án tiêu biểu: Block theme riêng, Block tùy chỉnh."
          ],
          "featuredProjects": [
            "Block theme riêng",
            "Block tùy chỉnh"
          ],
          "modules": [
            {
              "no": 1,
              "name": "WordPress nền tảng",
              "difficulty": "basic",
              "learn": "Giao diện, bài viết và trang, trình soạn khối, menu",
              "product": "Blog cá nhân · Website có logo, menu",
              "canDo": "Tự dựng website hoàn chỉnh"
            },
            {
              "no": 2,
              "name": "Website chuyên nghiệp",
              "difficulty": "advanced",
              "learn": "Lên kế hoạch, Site Editor, plugin, cửa hàng online",
              "product": "Website doanh nghiệp 4 trang · Cửa hàng nhỏ",
              "canDo": "Làm website cho người dùng thật"
            },
            {
              "no": 3,
              "name": "Tùy biến & vận hành",
              "difficulty": "expert",
              "learn": "Tự viết theme, block riêng, bảo mật, sao lưu, SEO",
              "product": "Block theme riêng · Block tùy chỉnh",
              "canDo": "Vận hành website như người làm nghề"
            }
          ],
          "note": null
        }
      ],
      "contests": [
        {
          "key": "TNTHPT",
          "short": "Tốt nghiệp THPT môn Tin học",
          "full": "Kỳ thi tốt nghiệp THPT môn Tin học",
          "sessions": 30,
          "afterYear": 2,
          "eligibility": "Sau Năm 2 · học sinh lớp 12 · 30 buổi",
          "syllabus": [
            "Buổi 1–8: cấu trúc đề, cách tính điểm, phần chung.",
            "Buổi 9–24: ôn theo chủ đề: cơ sở dữ liệu, web, lập trình.",
            "Buổi 25–30: thi thử 50 phút, chữa đề chi tiết."
          ],
          "reference": "Tham khảo năm 2026: thi Tin học ngày 12/6; năm 2027 dự kiến 11–12/6",
          "notes": "Sau Năm 2 · học sinh lớp 12 · 30 buổi. Đề gồm 24 câu trắc nghiệm và 6 câu đúng/sai, làm trong 50 phút. Con chọn phần riêng Khoa học máy tính hoặc Tin học ứng dụng. Buổi 1–8: cấu trúc đề, cách tính điểm, phần chung. Buổi 9–24: ôn theo chủ đề: cơ sở dữ liệu, web, lập trình. Buổi 25–30: thi thử 50 phút, chữa đề chi tiết. Tham khảo năm 2026: thi Tin học ngày 12/6; năm 2027 dự kiến 11–12/6."
        }
      ],
      "contestNote": null,
      "growth": [
        {
          "criterion": "Tư duy công nghệ",
          "before": "Biết lý thuyết rời rạc",
          "after1": "Làm website có lưu dữ liệu",
          "after2": "Vận hành website cho người dùng thật"
        },
        {
          "criterion": "Tư duy phản biện",
          "before": "Tin ngay mọi câu trả lời",
          "after1": "Tự tìm lỗi, đọc thông báo lỗi",
          "after2": "Đánh giá, kiểm chứng code do AI gợi ý"
        },
        {
          "criterion": "Kỹ năng vi tính",
          "before": "Dùng máy tính cơ bản",
          "after1": "Dùng VS Code, dòng lệnh, Git cơ bản",
          "after2": "Quản trị website, sao lưu, bảo mật"
        },
        {
          "criterion": "Tiếng Anh chuyên ngành",
          "before": "Ngại tài liệu tiếng Anh",
          "after1": "Đọc tài liệu kỹ thuật tiếng Anh",
          "after2": "Tự tra cứu, học công nghệ mới"
        },
        {
          "criterion": "Tự tin, trình bày",
          "before": "Ngại nói, ngại sai",
          "after1": "Báo cáo dự án trước phụ huynh",
          "after2": "Trình bày sản phẩm như người làm nghề"
        },
        {
          "criterion": "Tự chủ, hành vi số",
          "before": "Dùng mạng xã hội để giải trí",
          "after1": "Quản lý thời gian học, làm dự án",
          "after2": "Dùng AI, Internet có trách nhiệm"
        },
        {
          "criterion": "Chăm chỉ",
          "before": "Học khi được nhắc",
          "after1": "Đúng giờ, làm bài tập đầy đủ",
          "after2": "Tự giác học và luyện thêm"
        },
        {
          "criterion": "Trách nhiệm",
          "before": "Bỏ dở khi gặp khó",
          "after1": "Hoàn thành dự án đúng hạn",
          "after2": "Chủ động hỗ trợ bạn trong nhóm"
        },
        {
          "criterion": "Trung thực",
          "before": "Chép code trên mạng",
          "after1": "Tự làm, ghi nguồn khi tham khảo",
          "after2": "Nói rõ phần nào có AI hỗ trợ"
        }
      ],
      "competencies": [
        {
          "name": "Tư duy công nghệ",
          "group": "Tư duy",
          "desc": "Chia nhỏ vấn đề, tìm quy luật, viết thuật toán cho sản phẩm.",
          "ref": "GDPT 2018 · Tin học: giải quyết vấn đề với CNTT"
        },
        {
          "name": "Tư duy phản biện",
          "group": "Tư duy",
          "desc": "Tìm lỗi, so sánh cách giải, kiểm chứng câu trả lời của AI.",
          "ref": "Năng lực chung: giải quyết vấn đề và sáng tạo"
        },
        {
          "name": "Kỹ năng vi tính",
          "group": "Kỹ năng số",
          "desc": "Gõ phím, quản lý tệp, cài đặt phần mềm, học online.",
          "ref": "Khung năng lực số · Thông tư 02/2025"
        },
        {
          "name": "Tiếng Anh chuyên ngành",
          "group": "Kỹ năng số",
          "desc": "Đọc hiểu thuật ngữ, câu lệnh tiếng Anh trong phần mềm.",
          "ref": "Giao diện và câu lệnh lập trình bằng tiếng Anh"
        },
        {
          "name": "Tự tin, trình bày",
          "group": "Bản lĩnh",
          "desc": "Giới thiệu sản phẩm của mình, tự tin trả lời câu hỏi.",
          "ref": "Năng lực chung: giao tiếp và hợp tác"
        },
        {
          "name": "Tự chủ, hành vi số",
          "group": "Bản lĩnh",
          "desc": "Kiên trì sửa lỗi; dùng AI an toàn, có trách nhiệm.",
          "ref": "Năng lực chung: tự chủ và tự học"
        },
        {
          "name": "Chăm chỉ",
          "group": "Phẩm chất",
          "desc": "Đúng giờ, làm bài tập đầy đủ",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trách nhiệm",
          "group": "Phẩm chất",
          "desc": "Hoàn thành dự án, giữ nề nếp lớp",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        },
        {
          "name": "Trung thực",
          "group": "Phẩm chất",
          "desc": "Tự làm bài, nói rõ phần AI hỗ trợ",
          "ref": "GDPT 2018 · phẩm chất chủ yếu"
        }
      ]
    }
  ],
  "standard": {
    "standards": "Chuẩn đào tạo — “Bám sát chương trình giáo dục mới”. (1) GDPT 2018 · Môn Tin học — Học trước, sâu hơn chương trình ở trường: Ở tiểu học, môn Tin học dạy tuần tự, lặp, rẽ nhánh. Con thực hành các kiến thức này qua robot. (2) Thông tư 02/2025/TT-BGDĐT — Năng lực số cho học sinh: Bộ GD&ĐT xác định 6 miền năng lực số, trong đó có giải quyết vấn đề và ứng dụng AI. (3) Quyết định 2422/QĐ-BGDĐT — AI vào trường từ năm học 2026–2027: Học sinh phổ thông học AI 12 tiết mỗi năm. Chương trình giúp con làm quen sớm, nắm chắc hơn. Căn cứ (ghi chú slide): Chương trình GDPT 2018 môn Tin học (Thông tư 32/2018/TT-BGDĐT); Thông tư 02/2025/TT-BGDĐT về Khung năng lực số cho người học (6 miền, 24 năng lực thành phần); Quyết định 2422/QĐ-BGDĐT ngày 18/8/2026 về khung nội dung giáo dục trí tuệ nhân tạo, nội dung cốt lõi 12 tiết/lớp/năm từ năm học 2026–2027.",
    "online": "Con học online như thế nào? Học trực tiếp cùng giáo viên: Giáo viên dạy trực tiếp qua ClassIn trong mỗi buổi học. Lớp nhỏ 6–8 học sinh: Giáo viên theo sát, sửa bài cho từng bạn. 90 phút/buổi, 1 buổi/tuần: Mỗi năm học 45 buổi. Robot ảo trên máy tính: Không cần mua bộ robot, học ngay tại nhà. Cần chuẩn bị: Máy tính có camera, tai nghe có micro; Internet ổn định; Ưu tiên máy tính cấu hình tốt. (Ghi chú: cấu hình khuyến nghị của WhalesBot cho RoboVR: Windows 10 64-bit, Intel Core i3 thế hệ 10 trở lên, RAM 8 GB, card đồ họa NVIDIA GTX 1060 hoặc AMD RX 580 trở lên, SSD còn trống 100 GB.)",
    "moduleStructure": "Mỗi học phần 15 buổi (15 tuần), kết thúc bằng dự án do con tự làm. Buổi 1–4 và 6–12: Dự án sáng tạo 1–11 — Mỗi buổi con học một kiến thức mới và làm một sản phẩm. Buổi 5: Ôn tập & kiểm tra — Củng cố kiến thức, kiểm tra giữa học phần, hoàn thiện sản phẩm cùng giáo viên. Buổi 13: Dự án cuối khoá — Con tự lên ý tưởng và xây dựng dự án. Buổi 14: Demo cuối khoá — Con hoàn thiện và trình diễn dự án. Buổi 15: Báo cáo cuối khoá — Con báo cáo dự án trước phụ huynh, nhận phiếu đánh giá (mốc học bạ).",
    "sessionStructure": "Ít lý thuyết, nhiều thực hành: phần lớn thời gian con tự lập trình robot. 10’ Khởi động: Câu chuyện, tình huống mở đầu bài học. 15’ Khám phá: Giáo viên giới thiệu kiến thức mới, làm mẫu trên phần mềm. 30’ Thực hành: Con lập trình robot ảo theo hướng dẫn. 25’ Thử thách: Con tự sáng tạo, nâng cấp robot của mình. 10’ Chia sẻ: Con trình bày, nghe nhận xét. (Tiến trình mẫu của một buổi 90 phút. Thời lượng từng phần có thể linh hoạt theo nội dung bài.)",
    "parents": "Đồng hành cùng phụ huynh — “Bố mẹ biết con học gì, tiến bộ ra sao”. Nhóm Zalo lớp học: Lịch học, thông báo của lớp; Ảnh, video sản phẩm sau mỗi buổi; Nhận xét ngắn của giáo viên. Hệ thống LMS: Bài học và bài tập theo tuần; Xem lại video buổi học; Theo dõi chuyên cần, bài tập. Hồ sơ công nghệ: Lưu mọi dự án, video demo của con; Phiếu đánh giá năng lực, phẩm chất; Chứng nhận học phần, thành tích thi. Buổi báo cáo học phần: Buổi 15 của mỗi học phần; Con trình bày dự án trước phụ huynh; Đánh giá và định hướng tiếp theo. (Ghi chú: nhóm Zalo riêng của từng lớp; LMS gồm bài học, bài tập, video buổi học — ClassIn hỗ trợ ghi hình lớp học, hệ thống bài tập và phiếu nhận xét sau buổi; hồ sơ công nghệ (portfolio) lưu toàn bộ sản phẩm, video demo, phiếu đánh giá và chứng nhận của con trong suốt lộ trình; buổi báo cáo cuối mỗi học phần (buổi 15) có phụ huynh tham dự trực tuyến.)",
    "reportSession": "Buổi báo cáo · buổi 15 mỗi học phần — “Cứ 15 buổi, bố mẹ thấy rõ con tiến bộ”. 1. Con trình bày: Ý tưởng, cách làm, khó khăn đã vượt qua. (Rèn trình bày) 2. Vận hành robot: Chạy dự án trực tiếp trên phần mềm. (Rèn tư duy) 3. Hỏi – đáp: Bố mẹ, bạn bè đặt câu hỏi, con trả lời. (Rèn phản biện) 4. Nhận xét: Giáo viên đánh giá và gợi ý bước tiếp theo. (Định hướng học tiếp) Sau buổi báo cáo, phụ huynh nhận: Phiếu đánh giá (6 năng lực, 3 phẩm chất · mức Tốt, Đạt, Cần cố gắng); Video báo cáo của con (Lưu vào hồ sơ công nghệ để so sánh qua từng học phần); Chứng nhận học phần (Ghi cấp độ Basic, Advanced hoặc Expert con đã hoàn thành). Buổi báo cáo diễn ra trực tuyến trên ClassIn ở buổi 15 của mỗi học phần, phụ huynh được mời tham dự.",
    "teacher": "Giảng viên đào tạo — “Người đồng hành cùng con”. Thầy Phan Thành Toại — Nhà sáng lập TH STEAM Academy. 6 năm kinh nghiệm: Giảng dạy và phát triển chương trình đào tạo công nghệ số (EdTech). Giáo viên đạt chuẩn STEM.org: Chứng nhận quốc tế STEM.org Certified Educational Instructor (STEM ID #193769485, ngày 10/9/2026). Huấn luyện viên đội tuyển: Dẫn dắt học sinh thi đấu và đạt nhiều thành tích — Robotics, Tin học trẻ, KHKT, HKICO. Triết lý đào tạo: “Dạy bằng sự tận tâm và trách nhiệm, để mỗi học sinh tự tin làm chủ công nghệ.”",
    "terms": "Điều khoản đăng ký học · 1/2 — Học phí, chương trình và quy chuẩn lớp học. 1. Học phí: Con học trải nghiệm 1:1 trước khi đăng ký; Đóng trọn học phí ít nhất 3 ngày trước khai giảng để được xếp lớp; Ưu đãi theo bảng học phí; lệ phí dự thi do ban tổ chức thu riêng. 2. Chương trình đăng ký: Phiếu đăng ký ghi rõ gói học, cấp độ, lịch học và giáo viên phụ trách; Lịch cố định 1 buổi/tuần, 90 phút/buổi; Đổi lịch hoặc chuyển lớp 1 lần mỗi học phần, khi lớp còn chỗ. 3. Quy chuẩn lớp học online: Vào ClassIn đúng giờ, bật camera và micro; Máy tính, internet đáp ứng yêu cầu của khóa học; Tôn trọng thầy cô, bạn bè; tự làm sản phẩm của mình; Không quay video, chụp ảnh chia sẻ buổi học ra bên ngoài. Quy trình đăng ký: 1) Học trải nghiệm 1:1 → 2) Tư vấn lộ trình phù hợp → 3) Ký phiếu, đóng học phí → 4) Vào lớp khai giảng. Điều khoản đăng ký học · 2/2 — Học bù, bảo lưu, hoàn phí và phản ánh. 4. Nghỉ học và học bù: Báo nghỉ trước ít nhất 24 giờ qua Zalo lớp hoặc hotline; Được học bù tối đa 3 buổi mỗi năm học; Nghỉ không báo trước: không học bù; Trung tâm hủy buổi học: bù đủ 100%. 5. Bảo lưu và chuyển nhượng: Bảo lưu tối đa 6 tháng, 1 lần mỗi năm học, báo trước 7 ngày; Học phí bảo lưu giữ nguyên giá trị; Chuyển nhượng 1 lần các buổi chưa học cho học sinh khác. 6. Hoàn học phí: Hoàn 100% phần chưa học nếu trung tâm không mở được lớp; Hoàn trong 14 ngày làm việc; Lý do cá nhân: không hoàn, được bảo lưu hoặc chuyển nhượng. 7. Phản ánh chất lượng: Qua Zalo lớp hoặc hotline 0971 29 30 31; Phản hồi trong 24 giờ, xử lý trong 5 ngày làm việc; Khảo sát hài lòng cuối mỗi học phần. 8. Hình ảnh của con: Dùng cho hồ sơ công nghệ; chỉ dùng cho truyền thông khi phụ huynh đồng ý bằng văn bản. (Ghi chú: học bù bằng lớp bù cùng nội dung hoặc video bài giảng kèm bài tập có giáo viên chữa; khi quay lại sau bảo lưu được xếp vào lớp có nội dung tương ứng; hoàn phí chỉ áp dụng khi trung tâm không mở được lớp hoặc hủy lớp; hình ảnh, video của học sinh được sử dụng theo quy định pháp luật về bảo vệ dữ liệu cá nhân. Tham khảo khung chính sách của TEKY.)"
  }
};
