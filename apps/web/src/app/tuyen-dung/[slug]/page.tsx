import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@satarobo/db";
import { publicJob } from "@satarobo/api";
import { renderMarkdown, RECRUIT_CONSENT_TEXT } from "@satarobo/core";
import { PublicShell } from "@/components/public-shell";
import { SiteTracker } from "@/components/site-tracker";
import { JsonLd, PageHero, viDate } from "@/components/site/page-hero";
import { publicSiteUrl } from "@/lib/site-url";
import { salaryLabel } from "../salary";
import { ApplyForm } from "./form";

export const dynamic = "force-dynamic";
const load = cache(async (slug: string) => (/^[a-z0-9-]{3,100}$/.test(slug) ? publicJob(getDb(), slug) : null));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const j = await load(slug);
  return j ? { title: { absolute: `${j.title} — Tuyển dụng TH STEAM Academy` }, description: j.description.replace(/[#*_>`]/g, "").slice(0, 160), alternates: { canonical: `/tuyen-dung/${slug}` } } : { title: "Không tìm thấy" };
}

const SCHEMA_TYPE: Record<string, string> = { full_time: "FULL_TIME", part_time: "PART_TIME", collaborator: "CONTRACTOR", intern: "INTERN" };

export default async function JobDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const j = await load(slug);
  if (!j) notFound();
  const base = publicSiteUrl();
  const salary = salaryLabel(j);
  const ld = [
    ...(j.openedAt ? [{
      "@context": "https://schema.org", "@type": "JobPosting", title: j.title, identifier: { "@type": "PropertyValue", name: "TH STEAM Academy", value: j.code },
      description: [j.description, j.requirements, j.benefits].filter(Boolean).map((x) => renderMarkdown(x as string)).join(""),
      datePosted: new Date(j.openedAt).toISOString().slice(0, 10), ...(j.deadline ? { validThrough: `${j.deadline}T23:59:59+07:00` } : {}),
      employmentType: SCHEMA_TYPE[j.employmentType] ?? "OTHER", totalJobOpenings: j.openings, directApply: true,
      hiringOrganization: { "@type": "Organization", name: "TH STEAM Academy", sameAs: base, logo: `${base}/thsteam/logo-dung.png` },
      jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "Country", name: "VN" },
    }] : []),
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Trang chủ", item: `${base}/` }, { "@type": "ListItem", position: 2, name: "Tuyển dụng", item: `${base}/tuyen-dung` }, { "@type": "ListItem", position: 3, name: j.title }] },
  ];
  return (
    <PublicShell landing>
      <SiteTracker />
      <JsonLd data={ld} />
      <PageHero
        crumbs={[{ label: "Trang chủ", href: "/" }, { label: "Tuyển dụng", href: "/tuyen-dung" }, { label: j.code }]}
        eyebrow={`${j.department} · ${j.centerName ?? "Toàn hệ thống"}`}
        title={j.title}
        meta={[{ text: salary, gold: true }, { text: j.typeLabel }, { text: `Cần ${j.openings} người` }, ...(j.deadline ? [{ text: `Hạn nộp ${viDate(j.deadline)}` }] : [])]}
      />
      <section className="lp-sec lp-page">
        <div className="lp-wrap lp-job-in">
          <article className="lp-prose lp-article">
            <h2>Mô tả công việc</h2>
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(j.description) }} />
            {j.requirements && <><h2>Yêu cầu</h2><div dangerouslySetInnerHTML={{ __html: renderMarkdown(j.requirements) }} /></>}
            {j.benefits && <><h2>Quyền lợi</h2><div dangerouslySetInnerHTML={{ __html: renderMarkdown(j.benefits) }} /></>}
          </article>
          <aside className="lp-apply" id="ung-tuyen">
            {j.accepting
              ? <ApplyForm slug={j.slug} consentText={RECRUIT_CONSENT_TEXT} deadline={j.deadline} />
              : <div className="lp-ok"><strong>Đã hết hạn nhận hồ sơ</strong>Bạn xem các vị trí khác ở trang Tuyển dụng nhé.</div>}
          </aside>
        </div>
      </section>
    </PublicShell>
  );
}
