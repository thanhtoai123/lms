/** Nhãn mức lương hiển thị công khai: chữ tự nhập > khoảng min–max > "Thoả thuận" */
export function salaryLabel(j: { salaryText: string | null; salaryMin: number | null; salaryMax: number | null }, unit = "triệu"): string {
  if (j.salaryText) return j.salaryText;
  const m = (v: number) => `${Math.round(v / 1e5) / 10} ${unit}`;
  if (j.salaryMin && j.salaryMax) return `${m(j.salaryMin)} – ${m(j.salaryMax)}`;
  if (j.salaryMin) return `Từ ${m(j.salaryMin)}`;
  return "Thoả thuận";
}
