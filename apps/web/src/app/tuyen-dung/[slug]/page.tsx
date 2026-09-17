import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@satarobo/db";
import { publicJob } from "@satarobo/api";
import { renderMarkdown, RECRUIT_CONSENT_TEXT } from "@satarobo/core";
import { PublicShell } from "@/components/public-shell";
import { SiteTracker } from "@/components/site-tracker";
import { ApplyForm } from "./form";

export const dynamic = "force-dynamic";
const load = cache(async (slug: string) => (/^[a-z0-9-]{3,100}$/.test(slug) ? publicJob(getDb(), slug) : null));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const j = await load((await params).slug);
  return j ? { title: `${j.title} — Tuyển dụng Sata Robo`, description: j.description.slice(0, 160) } : { title: "Không tìm thấy" };
}

export default async function JobDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const j = await load(slug);
  if (!j) notFound();
  const m = (v: number) => `${Math.round(v / 1e5) / 10} triệu`;
  const salary = j.salaryText ?? (j.salaryMin && j.salaryMax ? `${m(j.salaryMin)} – ${m(j.salaryMax)}` : j.salaryMin ? `Từ ${m(j.salaryMin)}` : "Thoả thuận");
  return (
    <PublicShell>
      <SiteTracker />
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <article>
          <div className="text-xs uppercase tracking-wide text-brand-600">{j.code} · {j.department}</div>
          <h1 className="mt-1 text-2xl font-bold">{j.title}</h1>
          <p className="mt-1 text-sm text-ink-600">{j.centerName ?? "Toàn hệ thống"}{j.centerAddress ? ` — ${j.centerAddress}` : ""} · {j.typeLabel} · {j.openings} người · {salary}</p>
          <h2 className="mt-6 font-semibold">Mô tả công việc</h2>
          <div className="sr-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(j.description) }} />
          {j.requirements && <><h2 className="mt-6 font-semibold">Yêu cầu</h2><div className="sr-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(j.requirements) }} /></>}
          {j.benefits && <><h2 className="mt-6 font-semibold">Quyền lợi</h2><div className="sr-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(j.benefits) }} /></>}
        </article>
        <aside>
          {j.accepting ? <ApplyForm slug={j.slug} consentText={RECRUIT_CONSENT_TEXT} deadline={j.deadline} /> : <div className="card p-4 text-sm">Vị trí này đã hết hạn nhận hồ sơ.</div>}
        </aside>
      </div>
    </PublicShell>
  );
}
