import Link from "next/link";
import { getDb } from "@satarobo/db";
import { publicJobs } from "@satarobo/api";
import { EMPLOYMENT_TYPE_VI, type EmploymentType } from "@satarobo/core";
import { PublicShell } from "@/components/public-shell";
import { SiteTracker } from "@/components/site-tracker";

export const revalidate = 120;
export const metadata = { title: "Tuyển dụng — Sata Robo", description: "Cơ hội việc làm tại hệ thống giáo dục STEM Sata Robo." };

function salaryLabel(j: { salaryText: string | null; salaryMin: number | null; salaryMax: number | null }) {
  if (j.salaryText) return j.salaryText;
  const m = (v: number) => `${Math.round(v / 1e5) / 10} tr`;
  if (j.salaryMin && j.salaryMax) return `${m(j.salaryMin)} – ${m(j.salaryMax)}`;
  if (j.salaryMin) return `Từ ${m(j.salaryMin)}`;
  return "Thoả thuận";
}

export default async function JobsPublicPage() {
  const items = await publicJobs(getDb());
  return (
    <PublicShell>
      <SiteTracker />
      <h1 className="text-2xl font-bold">Tuyển dụng</h1>
      <p className="mt-1 text-sm text-ink-600">Cùng Sata Robo truyền cảm hứng khoa học – công nghệ cho trẻ em.</p>
      {items.length === 0 ? <div className="card mt-6 p-6 text-center text-sm text-ink-600">Hiện chưa có vị trí đang tuyển. Vui lòng quay lại sau.</div> : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {items.map((j) => (
            <li key={j.slug} className="card p-4">
              <Link href={`/tuyen-dung/${j.slug}`} className="text-lg font-semibold hover:text-brand-600">{j.title}</Link>
              <div className="mt-1 text-sm text-ink-600">{j.centerName ?? "Toàn hệ thống"} · {EMPLOYMENT_TYPE_VI[j.employmentType as EmploymentType]} · {j.openings} người</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="chip bg-green-100 text-green-800">{salaryLabel(j)}</span>
                {j.deadline && <span className="chip bg-slate-100">Hạn nộp {j.deadline.split("-").reverse().join("/")}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PublicShell>
  );
}
