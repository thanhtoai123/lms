"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { DEPARTMENTS, DEPARTMENT_VI, EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_VI, INTERVIEW_RESULTS, INTERVIEW_RESULT_VI, type Department, type EmploymentType, type JobStatus, type CandidateStage, type InterviewResult } from "@satarobo/core";
import { useTRPC } from "@/lib/trpc/client";

type Job = { id?: string; title: string; centerId: string | null; department: Department; employmentType: EmploymentType; openings: number; salaryMin: number | null; salaryMax: number | null; salaryText: string | null; description: string; requirements: string | null; benefits: string | null; deadline: string | null };

export function JobForm({ centers, globalCreate, job }: { centers: { id: string; code: string; name: string }[]; globalCreate: boolean; job?: Job }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Job>(job ?? { title: "", centerId: globalCreate ? null : centers[0]?.id ?? null, department: "academic", employmentType: "full_time", openings: 1, salaryMin: null, salaryMax: null, salaryText: null, description: "", requirements: null, benefits: null, deadline: null });
  const m = useMutation(trpc.recruit.upsertJob.mutationOptions({ onSuccess: (r) => { setOpen(false); if (!job) router.push(`/jobs/${r.id}`); router.refresh(); } }));
  if (!open) return <button type="button" className={job ? "btn-ghost" : "btn-primary"} onClick={() => setOpen(true)}>{job ? "Sửa tin" : "+ Tin tuyển dụng"}</button>;
  const num = (x: string) => (x === "" ? null : Math.max(0, Math.round(Number(x))));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <form className="card mt-6 grid w-full max-w-2xl grid-cols-2 gap-2 p-4 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ ...v, id: job?.id }); }}>
        <h3 className="col-span-2 font-semibold">{job ? "Sửa tin tuyển dụng" : "Tin tuyển dụng mới"}</h3>
        <label className="col-span-2">Vị trí<input className="input mt-1" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} required placeholder="Giáo viên Robotics tiểu học" /></label>
        <label>Cơ sở<select className="input mt-1" value={v.centerId ?? ""} onChange={(e) => setV({ ...v, centerId: e.target.value || null })}>{globalCreate && <option value="">Toàn hệ thống</option>}{centers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></label>
        <label>Bộ phận<select className="input mt-1" value={v.department} onChange={(e) => setV({ ...v, department: e.target.value as Department })}>{DEPARTMENTS.map((d) => <option key={d} value={d}>{DEPARTMENT_VI[d]}</option>)}</select></label>
        <label>Hình thức<select className="input mt-1" value={v.employmentType} onChange={(e) => setV({ ...v, employmentType: e.target.value as EmploymentType })}>{EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{EMPLOYMENT_TYPE_VI[t]}</option>)}</select></label>
        <label>Số lượng<input type="number" min={1} max={100} className="input mt-1" value={v.openings} onChange={(e) => setV({ ...v, openings: Number(e.target.value) })} /></label>
        <label>Lương từ (đ)<input type="number" min={0} className="input mt-1" value={v.salaryMin ?? ""} onChange={(e) => setV({ ...v, salaryMin: num(e.target.value) })} /></label>
        <label>Lương đến (đ)<input type="number" min={0} className="input mt-1" value={v.salaryMax ?? ""} onChange={(e) => setV({ ...v, salaryMax: num(e.target.value) })} /></label>
        <label>Hiển thị lương (tuỳ chọn)<input className="input mt-1" value={v.salaryText ?? ""} onChange={(e) => setV({ ...v, salaryText: e.target.value || null })} placeholder="150–250k/buổi" /></label>
        <label>Hạn nộp<input type="date" className="input mt-1" value={v.deadline ?? ""} onChange={(e) => setV({ ...v, deadline: e.target.value || null })} /></label>
        <label className="col-span-2">Mô tả công việc (markdown)<textarea className="input mt-1 font-mono text-xs" rows={6} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} required /></label>
        <label>Yêu cầu<textarea className="input mt-1 font-mono text-xs" rows={4} value={v.requirements ?? ""} onChange={(e) => setV({ ...v, requirements: e.target.value || null })} /></label>
        <label>Quyền lợi<textarea className="input mt-1 font-mono text-xs" rows={4} value={v.benefits ?? ""} onChange={(e) => setV({ ...v, benefits: e.target.value || null })} /></label>
        {m.error && <p className="col-span-2 text-red-700">{m.error.message}</p>}
        <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button><button className="btn-primary" disabled={m.isPending}>Lưu</button></div>
      </form>
    </div>
  );
}

export function JobStatusButtons({ id, status }: { id: string; status: JobStatus }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.recruit.setJobStatus.mutationOptions({ onSuccess: () => router.refresh() }));
  const acts: { to: JobStatus; label: string }[] = status === "draft" ? [{ to: "open", label: "Đăng tuyển" }, { to: "closed", label: "Đóng" }]
    : status === "open" ? [{ to: "paused", label: "Tạm dừng" }, { to: "closed", label: "Đóng tin" }]
    : status === "paused" ? [{ to: "open", label: "Mở lại" }, { to: "closed", label: "Đóng tin" }] : [{ to: "open", label: "Mở lại" }];
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {acts.map((a) => <button key={a.to} type="button" className={a.to === "open" ? "btn-primary" : "btn-ghost"} disabled={m.isPending} onClick={() => m.mutate({ id, status: a.to })}>{a.label}</button>)}
      {m.error && <span className="text-sm text-red-700">{m.error.message}</span>}
    </span>
  );
}

export function StageMover({ id, next }: { id: string; next: { key: CandidateStage; label: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.recruit.move.mutationOptions({ onSuccess: () => { setReason(""); router.refresh(); } }));
  const opts = next.filter((n) => n.key !== "hired");
  if (!opts.length) return null;
  return (
    <div className="space-y-2 text-sm">
      <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ghi chú / lý do (bắt buộc khi loại hoặc ứng viên rút)" />
      <div className="flex flex-wrap gap-2">{opts.map((n) => <button key={n.key} type="button" className={n.key === "rejected" || n.key === "withdrawn" ? "btn-ghost text-red-700" : "btn-ghost"} disabled={m.isPending} onClick={() => m.mutate({ id, stage: n.key, reason: reason || null })}>→ {n.label}</button>)}</div>
      {m.error && <p className="text-red-700">{m.error.message}</p>}
    </div>
  );
}

export function ScheduleInterview({ candidateId, interviewers }: { candidateId: string; interviewers: { id: string; name: string }[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [v, setV] = useState({ at: "", durationMin: 45, interviewerId: interviewers[0]?.id ?? "", location: "" });
  const m = useMutation(trpc.recruit.schedule.mutationOptions({ onSuccess: () => { setV({ ...v, at: "" }); router.refresh(); } }));
  return (
    <form className="grid grid-cols-2 gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ candidateId, scheduledAt: new Date(v.at).toISOString(), durationMin: v.durationMin, interviewerId: v.interviewerId, location: v.location || null }); }}>
      <label>Thời gian<input type="datetime-local" className="input mt-1" value={v.at} onChange={(e) => setV({ ...v, at: e.target.value })} required /></label>
      <label>Thời lượng (phút)<input type="number" min={15} max={240} className="input mt-1" value={v.durationMin} onChange={(e) => setV({ ...v, durationMin: Number(e.target.value) })} /></label>
      <label>Người phỏng vấn<select className="input mt-1" value={v.interviewerId} onChange={(e) => setV({ ...v, interviewerId: e.target.value })}>{interviewers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
      <label>Địa điểm / link<input className="input mt-1" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="Phòng 101 / Google Meet" /></label>
      {m.error && <p className="col-span-2 text-red-700">{m.error.message}</p>}
      <div className="col-span-2"><button className="btn-primary" disabled={m.isPending || !v.at}>Xếp lịch phỏng vấn</button></div>
    </form>
  );
}

export function ScoreForm({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [v, setV] = useState({ score: 3, result: "hold" as InterviewResult, feedback: "" });
  const m = useMutation(trpc.recruit.score.mutationOptions({ onSuccess: () => router.refresh() }));
  return (
    <form className="mt-2 space-y-2 rounded-lg bg-black/[0.03] p-2 text-xs" onSubmit={(e) => { e.preventDefault(); m.mutate({ id, ...v }); }}>
      <div className="flex gap-2">
        <label>Điểm<select className="input mt-1 !py-1" value={v.score} onChange={(e) => setV({ ...v, score: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}</select></label>
        <label>Kết quả<select className="input mt-1 !py-1" value={v.result} onChange={(e) => setV({ ...v, result: e.target.value as InterviewResult })}>{INTERVIEW_RESULTS.map((r) => <option key={r} value={r}>{INTERVIEW_RESULT_VI[r]}</option>)}</select></label>
      </div>
      <textarea className="input !text-xs" rows={2} value={v.feedback} onChange={(e) => setV({ ...v, feedback: e.target.value })} placeholder="Nhận xét: chuyên môn, dạy thử, giao tiếp…" required />
      {m.error && <p className="text-red-700">{m.error.message}</p>}
      <button className="btn-primary !py-1" disabled={m.isPending}>Lưu đánh giá</button>
    </form>
  );
}

export function CancelInterview({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const m = useMutation(trpc.recruit.cancelInterview.mutationOptions({ onSuccess: () => router.refresh() }));
  return <button type="button" className="text-xs text-red-700 hover:underline" disabled={m.isPending} onClick={() => m.mutate({ id })}>Huỷ lịch</button>;
}

export function HireForm({ id, centers, defaultCenter, defaultTitle, defaultDept }: { id: string; centers: { id: string; code: string }[]; defaultCenter: string | null; defaultTitle: string; defaultDept: Department }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [v, setV] = useState({ centerId: defaultCenter ?? centers[0]?.id ?? "", title: defaultTitle.slice(0, 80), department: defaultDept, hiredAt: new Date().toISOString().slice(0, 10) });
  const m = useMutation(trpc.recruit.hire.mutationOptions({ onSuccess: (r) => router.push(`/nhan-su/${r.staffId}`) }));
  return (
    <form className="grid grid-cols-2 gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); m.mutate({ id, ...v }); }}>
      <label>Cơ sở<select className="input mt-1" value={v.centerId} onChange={(e) => setV({ ...v, centerId: e.target.value })}>{centers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>
      <label>Ngày vào làm<input type="date" className="input mt-1" value={v.hiredAt} onChange={(e) => setV({ ...v, hiredAt: e.target.value })} /></label>
      <label>Chức danh<input className="input mt-1" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></label>
      <label>Bộ phận<select className="input mt-1" value={v.department} onChange={(e) => setV({ ...v, department: e.target.value as Department })}>{DEPARTMENTS.map((d) => <option key={d} value={d}>{DEPARTMENT_VI[d]}</option>)}</select></label>
      {m.error && <p className="col-span-2 text-red-700">{m.error.message}</p>}
      <div className="col-span-2"><button className="btn-primary" disabled={m.isPending}>Nhận việc → tạo hồ sơ nhân sự (thử việc)</button></div>
    </form>
  );
}

export function RevealContact({ id }: { id: string }) {
  const trpc = useTRPC();
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.recruit.reveal.mutationOptions());
  if (m.data) return <span className="text-sm">{m.data.phone} {m.data.email ? `· ${m.data.email}` : ""}</span>;
  return (
    <span className="inline-flex gap-1">
      <input className="input !py-1 !text-xs" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do xem (gọi hẹn PV…)" />
      <button type="button" className="btn-ghost !py-1 !text-xs" disabled={reason.trim().length < 5 || m.isPending} onClick={() => m.mutate({ id, reason })}>Hiện liên hệ</button>
      {m.error && <span className="text-xs text-red-700">{m.error.message}</span>}
    </span>
  );
}
