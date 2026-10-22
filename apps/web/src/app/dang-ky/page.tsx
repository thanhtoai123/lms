import { permanentRedirect } from "next/navigation";
import { TRIAL_PATH } from "@satarobo/core";

/** Đường dẫn cũ: chuyển hẳn về trang đăng ký học trải nghiệm, giữ nguyên UTM / mã giới thiệu / embed. Form đầy đủ (TrialForm) vẫn ở ./form.tsx. */
export default async function DangKyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v ? [v] : []) q.append(k, x);
  const qs = q.toString();
  permanentRedirect(qs ? `${TRIAL_PATH}?${qs}` : TRIAL_PATH);
}
