import Link from "next/link";
import { hasPermission, CONV_STATUSES, CONV_STATUS_VI, MSG_CHANNELS, MSG_CHANNEL_VI, type Actor, type ConvStatus, type MsgChannel } from "@satarobo/core";
import { getServerCaller } from "@/lib/trpc/server";
import { NoAccess, PageHeader } from "@/components/admin-ui";
import { Empty } from "@/components/ui";
import { dtVN } from "@/components/care-ui";
import { Composer, ConvActions, StartConversation, PortalLink, LinkLeadForm } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tin nhắn" };

type SP = { id?: string; status?: string; channel?: string; mine?: string; flagged?: string; q?: string; link?: string };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function MessagesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { caller, ctx } = await getServerCaller();
  const actor = ctx.actor as Actor | null;
  if (!actor || !hasPermission(actor, "message:read")) return <NoAccess title="Tin nhắn" perm="message:read" />;
  const status = CONV_STATUSES.includes(sp.status as ConvStatus) ? (sp.status as ConvStatus) : undefined;
  const channel = MSG_CHANNELS.includes(sp.channel as MsgChannel) ? (sp.channel as MsgChannel) : undefined;
  const d = await caller.messaging.inbox({ status, channel, mine: sp.mine === "1", flagged: sp.flagged === "1", q: sp.q || undefined });
  const conv = sp.id && UUID.test(sp.id) ? await caller.messaging.conversation({ id: sp.id }) : null;
  const isTeacher = actor.assignments.some((a) => a.role === "TEACHER");
  const myStudents = isTeacher ? await caller.messaging.myStudents() : null;
  const supervisor = hasPermission(actor, "message:audit");
  const q = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams(Object.entries({ status: sp.status, channel: sp.channel, mine: sp.mine, flagged: sp.flagged, q: sp.q, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/tin-nhan?${u.toString()}`;
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Tin nhắn" desc="Hộp thư chung: phụ huynh (liên kết riêng), Facebook Messenger, Zalo OA. Messenger chỉ trả lời trong 24 giờ (tới 7 ngày khi nhân viên trả lời trực tiếp); Zalo OA tin tư vấn trong 7 ngày kể từ tương tác cuối."
        actions={<div className="flex gap-2">{supervisor && <Link href="/hoi-thoai" className="btn-ghost">Giám sát →</Link>}{(d.canStart || isTeacher) && <StartConversation myStudents={myStudents} />}</div>} />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Link href={q({ status: undefined, mine: undefined, flagged: undefined })} className="chip bg-slate-100">Đang mở {d.counts?.open ?? 0}</Link>
        <Link href={q({ mine: "1" })} className={`chip ${sp.mine ? "bg-brand-100 text-brand-700" : "bg-slate-100"}`}>Của tôi {d.counts?.mine ?? 0}</Link>
        <Link href={q({ flagged: "1" })} className={`chip ${sp.flagged ? "bg-red-100 text-red-700" : "bg-slate-100"}`}>Gắn cờ {d.counts?.flagged ?? 0}</Link>
        {(d.counts?.waitingOver ?? 0) > 0 && <span className="chip bg-red-100 text-red-700">{d.counts?.waitingOver} chờ quá 60 phút</span>}
        <form className="flex gap-1" action="/tin-nhan">
          <select name="channel" defaultValue={channel ?? ""} className="input !w-auto !py-1 !text-xs"><option value="">Mọi kênh</option>{MSG_CHANNELS.map((c) => <option key={c} value={c}>{MSG_CHANNEL_VI[c]}</option>)}</select>
          <select name="status" defaultValue={status ?? ""} className="input !w-auto !py-1 !text-xs"><option value="">Đang mở</option>{CONV_STATUSES.map((s) => <option key={s} value={s}>{CONV_STATUS_VI[s]}</option>)}</select>
          <input name="q" defaultValue={sp.q} placeholder="Tìm…" className="input !w-40 !py-1 !text-xs" />
          <button className="btn-ghost !py-1 !text-xs">Lọc</button>
        </form>
      </div>
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="card max-h-[75vh] divide-y divide-black/5 overflow-y-auto">
          {d.items.length === 0 ? <div className="p-4"><Empty>Không có hội thoại.</Empty></div> : d.items.map((c) => (
            <Link key={c.id} href={q({ id: c.id })} className={`block p-3 text-sm hover:bg-black/[0.03] ${conv?.id === c.id ? "bg-brand-50" : ""}`}>
              <div className="flex justify-between gap-2"><span className="truncate font-medium">{c.name}</span><span className="shrink-0 text-[11px] text-ink-400">{dtVN(c.lastMessageAt)}</span></div>
              <div className="truncate text-xs text-ink-600">{c.subject ? `${c.subject} · ` : ""}{c.preview}</div>
              <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                <span className="chip bg-slate-100">{c.channelLabel}</span>
                <span className="chip bg-slate-100">{c.statusLabel}</span>
                {c.waitingMin !== null && <span className={`chip ${c.waitingMin > 60 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>chờ {c.waitingMin}′</span>}
                {c.flags.map((f) => <span key={f} className="chip bg-red-100 text-red-700">{f}</span>)}
                {c.assignee && <span className="chip bg-slate-50">{c.assignee}</span>}
              </div>
            </Link>
          ))}
        </div>
        <div className="card flex min-h-[50vh] flex-col">
          {!conv ? <div className="grid flex-1 place-items-center p-6 text-sm text-ink-400">Chọn một hội thoại</div> : (
            <>
              <div className="space-y-2 border-b border-black/5 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{conv.parent?.name ?? conv.lead?.name ?? conv.displayName ?? conv.externalId ?? "Khách"}</div>
                    <div className="text-xs text-ink-600">{conv.channelLabel}{conv.subject ? ` · ${conv.subject}` : ""}{conv.parent ? ` · ${conv.parent.phone}` : ""}{conv.lead ? ` · lead ${conv.lead.phone}` : ""}</div>
                    {conv.parent && conv.parent.children.length > 0 && <div className="text-xs">Con: {conv.parent.children.map((k) => <Link key={k.id} href={`/students/${k.id}`} className="mr-2 text-brand-600">{k.name}</Link>)}</div>}
                    {conv.lead && <Link href={`/leads/${conv.lead.id}`} className="text-xs text-brand-600">Mở lead →</Link>}
                    {conv.channel === "portal" && <div className="text-[11px] text-ink-400">PH mở liên kết lần cuối: {conv.portalSeenAt ? dtVN(conv.portalSeenAt) : "chưa mở"}</div>}
                  </div>
                  {conv.can.manage && <ConvActions id={conv.id} status={conv.status} assignedTo={conv.assignedTo} staff={conv.staff} canClearFlags={supervisor} hasFlags={conv.flags.length > 0} />}
                </div>
                {conv.flags.length > 0 && <div className="flex flex-wrap gap-1">{conv.flags.map((f) => <span key={f.key} className="chip bg-red-100 text-red-700">{f.label}</span>)}</div>}
                {conv.can.newLink && <PortalLink id={conv.id} link={sp.link?.startsWith("/tn/") ? sp.link : null} />}
                {conv.can.linkLead && <details className="text-xs"><summary className="cursor-pointer text-brand-600">Tạo lead từ hội thoại</summary><div className="mt-2"><LinkLeadForm id={conv.id} centers={conv.centers} /></div></details>}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: "50vh" }}>
                {conv.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "in" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.direction === "in" ? "bg-black/5" : m.direction === "note" ? "border border-amber-200 bg-amber-50" : "bg-brand-500 text-white"}`}>
                      <div className="whitespace-pre-wrap">{m.body}</div>
                      {m.attachments?.map((a, i) => <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block text-xs underline">Tệp {a.type}</a>)}
                      <div className={`mt-0.5 text-[10px] ${m.direction === "out" ? "text-white/70" : "text-ink-400"}`}>{m.direction === "note" ? "Ghi chú · " : ""}{m.by ?? (m.direction === "in" ? "Khách" : "")} · {dtVN(m.createdAt)}{m.tag ? ` · ${m.tag}` : ""}{m.status === "failed" || m.status === "skipped" ? ` · ⚠ ${m.error}` : ""}</div>
                      {m.flags.length > 0 && <div className="mt-1 text-[10px] font-semibold text-red-700">⚑ {m.flags.join(", ")}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <Composer id={conv.id} canReply={conv.can.reply} canNote={conv.can.note} windowNote={conv.window.allowed ? (conv.window.tag ? `Quá 24 giờ — tin sẽ gửi với thẻ HUMAN_AGENT (chỉ người thật trả lời, hạn ${dtVN(conv.window.expiresAt)})` : conv.window.expiresAt ? `Được trả lời đến ${dtVN(conv.window.expiresAt)}` : null) : conv.window.reason} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
