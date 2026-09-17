import type { SurveyQuestion } from "@satarobo/core";

export const DEFAULT_QUESTIONS: SurveyQuestion[] = [
  { id: "nps", type: "nps", label: "Anh/chị sẵn sàng giới thiệu Sata Robo cho bạn bè, người thân ở mức nào?", required: true },
  { id: "gv", type: "rating", label: "Anh/chị hài lòng với giáo viên của bé ở mức nào?", required: true },
  { id: "gopy", type: "text", label: "Anh/chị muốn Sata Robo cải thiện điều gì?", required: false },
];
