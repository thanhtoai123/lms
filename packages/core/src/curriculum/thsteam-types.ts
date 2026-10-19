/** Kiểu dữ liệu của danh mục chương trình chuẩn TH STEAM (dữ liệu ở ./thsteam-data.ts, quy tắc ở ./thsteam.ts) */

export type ThTrackCode = "ROBO" | "AI" | "DOHOA" | "CODE";
export type ThSchoolLevel = "tieu-hoc" | "thcs" | "thpt";
/** Cấp độ của một học phần trong năm học */
export type ThDifficulty = "basic" | "advanced" | "expert";

export interface ThModule {
  /** Học phần 1, 2, 3 trong năm học */
  no: number;
  name: string;
  difficulty: ThDifficulty;
  /** "Con học" */
  learn: string;
  /** "Sản phẩm" */
  product: string;
  /** "Con làm được" */
  canDo: string;
}

export interface ThYear {
  /** Năm học thứ mấy của chương trình */
  no: number;
  ageFrom: number;
  ageTo: number;
  title: string;
  /** Phần mềm / học cụ chính */
  software: string;
  tools: string | null;
  highlights: string[];
  featuredProjects: string[];
  modules: ThModule[];
  /** Ghi chú chuyên môn của slide (thuật ngữ, an toàn theo độ tuổi…) */
  note: string | null;
}

export interface ThContest {
  /** Khoá cuộc thi: STR, EAI, STAI, ACP, THT, HKICO, KHKT, TNTHPT */
  key: string;
  /** Tên ngắn (trên slide) */
  short: string;
  /** Tên đầy đủ */
  full: string;
  sessions: number;
  /** Học thêm sau năm học thứ mấy */
  afterYear: number;
  eligibility: string | null;
  /** "Buổi 1–4: …" */
  syllabus: string[];
  /** "Tham khảo mùa …" — lịch thi đã qua chỉ để tham khảo */
  reference: string | null;
  notes: string | null;
}

/** Một dòng bảng "Con thay đổi gì sau mỗi năm học" */
export interface ThGrowthRow {
  criterion: string;
  before: string;
  after1: string;
  after2: string;
}

export interface ThCompetency {
  name: string;
  /** Tư duy · Kỹ năng số · Bản lĩnh · Phẩm chất */
  group: string;
  desc: string;
  ref: string | null;
}

export interface ThProgram {
  /** ROBO-TH, AI-THCS, CODE-THCS1 … */
  code: string;
  track: ThTrackCode;
  level: ThSchoolLevel;
  ageFrom: number;
  ageTo: number;
  /** "RoboSim → RoboVR", "AI for kids" … */
  name: string;
  tagline: string | null;
  deckUrl: string | null;
  years: ThYear[];
  contests: ThContest[];
  contestNote: string | null;
  growth: ThGrowthRow[];
  competencies: ThCompetency[];
}

export interface ThTrack {
  code: ThTrackCode;
  name: string;
  tagline: string | null;
  deckUrl: string | null;
  programs: string[];
}

export interface ThCatalogData {
  tracks: ThTrack[];
  programs: ThProgram[];
  standard: Record<string, string>;
}
