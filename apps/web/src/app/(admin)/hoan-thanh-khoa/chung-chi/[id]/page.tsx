import { redirect } from "next/navigation";

/**
 * Đường dẫn cũ `/hoan-thanh-khoa/chung-chi/[id]` — giữ lại để liên kết / dấu trang cũ không gãy.
 * Trung tâm cấp "giấy chứng nhận" (không phải "chứng chỉ") nên trang thật nằm ở `/hoan-thanh-khoa/chung-nhan/[id]`.
 */
export default async function LegacyCertificateRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/hoan-thanh-khoa/chung-nhan/${encodeURIComponent(id)}`);
}
