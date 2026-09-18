"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

type SettingLabels = Record<string, { label: string; desc: string }>;

/** Nhãn tiếng Việt cho bảng kê "đã tạo / đã sao chép" sau khi nhân bản */
const CREATED_LABEL: Record<string, string> = {
  tenants: "Trung tâm", tenantSettings: "Cấu hình quyền riêng tư", orgUnits: "Đơn vị tổ chức",
  legalEntities: "Pháp nhân", centers: "Cơ sở", rooms: "Phòng học", adminUser: "Tài khoản quản trị",
  courses: "Khoá học", coursePackages: "Gói học phí", curricula: "Chương trình học", lessons: "Bài học",
  workShifts: "Mã ca làm việc", commissionPolicies: "Chính sách hoa hồng",
  commissionPolicyShares: "Mức chia hoa hồng", commissionPolicyTiers: "Bậc hoa hồng",
  notificationTypes: "Danh mục thông báo", paymentMethods: "Phương thức thanh toán",
  emailTemplates: "Mẫu email / ZNS", userGroups: "Nhóm quyền", userGroupPermissions: "Quyền của nhóm",
  opsSettings: "Cấu hình vận hành",
};

export interface TenantCard {
  id: string;
  code: string;
  name: string;
  type: "OWNED" | "FRANCHISE";
  typeLabel: string;
  status: string;
  statusLabel: string;
  isDefault: boolean;
  isMine: boolean;
  address: string | null;
  contractNo: string | null;
  contractFrom: string | null;
  contractTo: string | null;
  centers: number;
  students: number;
  classes: number;
  leads: number;
  staff: number;
  revenue30d: number;
  debt: number;
  seesPii: boolean;
  seesFinanceDetail: boolean;
  hoSeesPii: boolean | null;
  hoSeesFinanceDetail: boolean | null;
  dataRetentionYears: number | null;
  allowCrossCenterTransfer: boolean | null;
  /** Người đang xem có được kết thúc hợp đồng của trung tâm này không */
  canOffboard: boolean;
}

type Template = { id: string; code: string; name: string; isDefault: boolean };

const vnd = (n: number) => `${(n ?? 0).toLocaleString("vi-VN")} ₫`;
const dmy = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

function Panel({ title, desc, children, onClose }: { title: string; desc?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 py-10" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card w-full max-w-3xl space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Đóng">Đóng</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Thẻ trung tâm + panel chi tiết (kèm 4 công tắc quyền riêng tư)      */
/* ------------------------------------------------------------------ */

export function TenantCards({ items, labels }: { items: TenantCard[]; labels: SettingLabels }) {
  const [open, setOpen] = useState<TenantCard | null>(null);
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((t) => (
          <article key={t.id} className="card flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">
                  <span className="font-mono text-sm text-muted-foreground">{t.code}</span> · {t.name}
                </h2>
                {t.address && <p className="text-xs text-muted-foreground">{t.address}</p>}
              </div>
              <span className={`chip ${t.type === "FRANCHISE" ? "bg-orange-100 text-orange-800" : "bg-violet-100 text-violet-800"}`}>{t.typeLabel}</span>
            </div>

            <div className="flex flex-wrap gap-1 text-xs">
              <span className={`chip ${t.status === "active" ? "bg-green-100 text-green-800" : t.status === "onboarding" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`}>{t.statusLabel}</span>
              {t.isMine && <span className="chip bg-brand-100 text-brand-700">Trung tâm của bạn</span>}
              {t.isDefault && <span className="chip bg-slate-100 text-slate-600">Chuỗi gốc</span>}
              {!t.seesPii && <span className="chip bg-amber-100 text-amber-800" title="Trung tâm này không chia sẻ dữ liệu cá nhân với Hội sở chuỗi">Dữ liệu cá nhân đã che</span>}
              {!t.seesFinanceDetail && <span className="chip bg-amber-100 text-amber-800" title="Chỉ xem được số liệu tài chính tổng hợp">Tài chính: chỉ tổng hợp</span>}
            </div>

            <dl className="grid grid-cols-3 gap-2 text-center text-sm">
              {([["Cơ sở", t.centers], ["Học viên", t.students], ["Lớp", t.classes], ["Lead", t.leads], ["Nhân sự", t.staff]] as const).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-black/[0.03] p-2">
                  <dt className="text-[11px] text-muted-foreground">{k}</dt>
                  <dd className="font-semibold">{v.toLocaleString("vi-VN")}</dd>
                </div>
              ))}
              <div className="rounded-xl bg-black/[0.03] p-2">
                <dt className="text-[11px] text-muted-foreground">Doanh thu 30 ngày</dt>
                <dd className="font-semibold">{vnd(t.revenue30d)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">Công nợ: <b>{vnd(t.debt)}</b>{t.contractNo ? ` · HĐ ${t.contractNo} (${dmy(t.contractFrom)} – ${dmy(t.contractTo)})` : ""}</p>

            <button type="button" className="btn-primary mt-auto" onClick={() => setOpen(t)}>Xem &amp; cài đặt quyền riêng tư</button>
          </article>
        ))}
      </div>
      {open && <TenantDetail tenant={open} labels={labels} onClose={() => setOpen(null)} />}
    </>
  );
}

function Toggle({ id, checked, disabled, label, desc, onChange }: { id: string; checked: boolean; disabled: boolean; label: string; desc: string; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 rounded-xl border border-black/10 p-3">
      <input id={id} type="checkbox" className="mt-1 h-4 w-4" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm">
        <b>{label}</b>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
    </label>
  );
}

function TenantDetail({ tenant, labels, onClose }: { tenant: TenantCard; labels: SettingLabels; onClose: () => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [pii, setPii] = useState(!!tenant.hoSeesPii);
  const [fin, setFin] = useState(!!tenant.hoSeesFinanceDetail);
  const [transfer, setTransfer] = useState(!!tenant.allowCrossCenterTransfer);
  const [years, setYears] = useState(String(tenant.dataRetentionYears ?? 5));
  const [reason, setReason] = useState("");
  const m = useMutation(trpc.tenants.updateSettings.mutationOptions({ onSuccess: () => { setReason(""); router.refresh(); } }));
  // Chỉ quản trị của CHÍNH trung tâm đó đổi được — Hội sở chuỗi không tự mở quyền xem dữ liệu
  const canEdit = tenant.isMine;
  const changed = pii !== !!tenant.hoSeesPii || fin !== !!tenant.hoSeesFinanceDetail || transfer !== !!tenant.allowCrossCenterTransfer || Number(years) !== (tenant.dataRetentionYears ?? 5);

  return (
    <Panel title={`${tenant.code} · ${tenant.name}`} desc={`${tenant.typeLabel} · ${tenant.statusLabel}${tenant.contractNo ? ` · HĐ ${tenant.contractNo}` : ""}`} onClose={onClose}>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Quyền riêng tư của trung tâm</h3>
        <p className="text-xs text-muted-foreground">
          {canEdit
            ? "Bạn đang quản trị trung tâm này nên đổi được các công tắc dưới đây. Mỗi lần đổi đều ghi nhật ký kèm lý do."
            : "Chỉ quản trị của chính trung tâm này mới bật/tắt được — Hội sở chuỗi không tự mở quyền xem dữ liệu của bên nhượng quyền."}
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          <Toggle id="ho-pii" checked={pii} disabled={!canEdit || m.isPending} label={labels.hoSeesPii?.label ?? "Hội sở chuỗi được xem dữ liệu cá nhân"} desc={labels.hoSeesPii?.desc ?? ""} onChange={setPii} />
          <Toggle id="ho-fin" checked={fin} disabled={!canEdit || m.isPending} label={labels.hoSeesFinanceDetail?.label ?? "Hội sở chuỗi được xem chi tiết tài chính"} desc={labels.hoSeesFinanceDetail?.desc ?? ""} onChange={setFin} />
          <Toggle id="ho-transfer" checked={transfer} disabled={!canEdit || m.isPending} label={labels.allowCrossCenterTransfer?.label ?? "Cho phép chuyển học viên / lead sang trung tâm khác"} desc={labels.allowCrossCenterTransfer?.desc ?? ""} onChange={setTransfer} />
          <label className="flex items-start gap-3 rounded-xl border border-black/10 p-3 text-sm">
            <span className="flex-1">
              <b>{labels.dataRetentionYears?.label ?? "Thời gian giữ dữ liệu (năm)"}</b>
              <span className="block text-xs text-muted-foreground">{labels.dataRetentionYears?.desc ?? ""}</span>
            </span>
            <input type="number" min={1} max={20} className="input w-20 text-right" value={years} disabled={!canEdit || m.isPending} onChange={(e) => setYears(e.target.value)} />
          </label>
        </div>

        {canEdit && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate({ tenantId: tenant.id, hoSeesPii: pii, hoSeesFinanceDetail: fin, allowCrossCenterTransfer: transfer, dataRetentionYears: Number(years), reason });
            }}
          >
            <input className="input flex-1" placeholder="Lý do thay đổi (bắt buộc, ≥ 5 ký tự — ghi vào nhật ký)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required />
            <button className="btn-primary" disabled={!changed || reason.trim().length < 5 || m.isPending}>{m.isPending ? "Đang lưu…" : "Lưu cài đặt"}</button>
          </form>
        )}
        {m.error && <p className="text-sm text-red-700">{m.error.message}</p>}
        {m.data && <p className="text-sm text-green-700">Đã lưu cài đặt quyền riêng tư.</p>}
      </section>

      <section className="space-y-1 border-t border-black/5 pt-3 text-sm">
        <h3 className="text-sm font-semibold">Số liệu tổng hợp</h3>
        <p className="text-muted-foreground">
          {tenant.centers} cơ sở · {tenant.students} học viên đang học · {tenant.classes} lớp đang chạy · {tenant.leads} lead · {tenant.staff} nhân sự
        </p>
        <p className="text-muted-foreground">Doanh thu 30 ngày: <b>{vnd(tenant.revenue30d)}</b> · Công nợ: <b>{vnd(tenant.debt)}</b></p>
        {!tenant.seesFinanceDetail && <p className="text-xs text-amber-700">Trung tâm này chỉ chia sẻ số liệu tổng hợp — không mở được từng phiếu thu.</p>}
        {!tenant.seesPii && <p className="text-xs text-amber-700">Dữ liệu cá nhân của trung tâm này hiển thị ở dạng đã che (0912****78).</p>}
      </section>

      {tenant.canOffboard && <DangerZone tenant={tenant} />}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Vùng nguy hiểm — kết thúc hợp đồng nhượng quyền                     */
/* ------------------------------------------------------------------ */

const OFFBOARD_KIND_LABEL: Record<string, string> = { lock: "Sẽ khoá", keep: "Giữ nguyên", export: "Nằm trong gói bàn giao" };

/** Đổi chuỗi base64 máy chủ trả về thành tệp tải xuống */
function downloadBase64(fileName: string, base64: string, mime: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DangerZone({ tenant }: { tenant: TenantCard }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const preview = useQuery({ ...trpc.tenants.previewOffboard.queryOptions({ tenantId: tenant.id }), enabled: open });
  const after = () => { setConfirm(""); setReason(""); router.refresh(); };
  const exportM = useMutation(trpc.tenants.exportData.mutationOptions({
    onSuccess: (d) => {
      downloadBase64(d.fileName, d.contentBase64, "application/zip");
      setDone(`Đã tải gói bàn giao ${d.fileName} (${Math.max(1, Math.round(d.bytes / 1024))} KB)${d.masked ? " — dữ liệu cá nhân đã che theo quyền của bạn" : ""}.`);
      setReason("");
    },
  }));
  const suspendM = useMutation(trpc.tenants.suspend.mutationOptions({ onSuccess: (d) => { setDone(`Đã tạm ngừng trung tâm · khoá ${d.lockedAccounts} tài khoản.`); after(); } }));
  const closeM = useMutation(trpc.tenants.close.mutationOptions({ onSuccess: (d) => { setDone(`Đã đóng trung tâm · khoá ${d.lockedAccounts} tài khoản · giữ dữ liệu đến ${dmy(d.retentionUntil)}.`); after(); } }));
  const reopenM = useMutation(trpc.tenants.reopen.mutationOptions({ onSuccess: () => { setDone("Đã mở lại trung tâm — tài khoản vẫn phải mở khoá bằng tay ở màn Tài khoản."); after(); } }));

  const busy = exportM.isPending || suspendM.isPending || closeM.isPending || reopenM.isPending;
  const err = exportM.error?.message ?? suspendM.error?.message ?? closeM.error?.message ?? reopenM.error?.message ?? null;
  const confirmOk = confirm.trim().toUpperCase() === tenant.code.toUpperCase();
  const reasonOk = reason.trim().length >= 10;
  const armed = confirmOk && reasonOk && !busy;
  const payload = { tenantId: tenant.id, confirm: confirm.trim().toUpperCase(), reason: reason.trim() };

  return (
    <section className="space-y-3 rounded-xl border-2 border-red-300 bg-red-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-red-800">Vùng nguy hiểm — kết thúc hợp đồng nhượng quyền</h3>
          <p className="text-xs text-red-800/80">
            Bàn giao dữ liệu rồi tạm ngừng / đóng trung tâm. Các thao tác ở đây <b>khoá toàn bộ tài khoản</b> của trung tâm và được ghi nhật ký.
            Không thao tác nào xoá dữ liệu.
          </p>
        </div>
        <button type="button" className="btn-ghost !py-1.5 text-xs text-red-800" onClick={() => setOpen((v) => !v)}>
          {open ? "Thu gọn" : "Mở vùng nguy hiểm"}
        </button>
      </div>

      {open && (
        <div className="space-y-3">
          {preview.isPending && <p className="text-xs text-red-800/80">Đang tính bảng kê…</p>}
          {preview.error && <p className="text-sm text-red-700">{preview.error.message}</p>}
          {preview.data && (
            <>
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <ul className="space-y-1 rounded-xl bg-white/70 p-3">
                  {preview.data.lines.map((l) => (
                    <li key={l.key} className="flex items-baseline justify-between gap-2">
                      <span>
                        {l.label}
                        <span className="block text-[11px] text-muted-foreground">{OFFBOARD_KIND_LABEL[l.kind] ?? l.kind}{l.note ? ` · ${l.note}` : ""}</span>
                      </span>
                      <b>{l.count.toLocaleString("vi-VN")}</b>
                    </li>
                  ))}
                </ul>
                <div className="space-y-2 rounded-xl bg-white/70 p-3">
                  <p><b>{preview.data.accountsTotal}</b> tài khoản sẽ bị khoá, không đăng nhập được nữa:</p>
                  <ul className="max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-muted-foreground">
                    {preview.data.accounts.map((a) => <li key={a.id}>{a.fullName} · {a.email}</li>)}
                    {preview.data.accounts.length === 0 && <li>Không có tài khoản đang hoạt động.</li>}
                  </ul>
                  <p className="text-[11px]">
                    Dữ liệu giữ <b>{preview.data.retention.years} năm</b> — đến ngày <b>{dmy(preview.data.retention.until)}</b> mới xoá / ẩn danh.
                  </p>
                  {preview.data.warnings.map((w) => <p key={w} className="text-[11px] font-medium text-amber-800">⚠ {w}</p>)}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="input"
                  placeholder={`Gõ lại mã trung tâm ${tenant.code} để xác nhận`}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value.toUpperCase())}
                  maxLength={12}
                />
                <input
                  className="input"
                  placeholder="Lý do (bắt buộc, ≥ 10 ký tự — ghi vào nhật ký)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-ghost !py-1.5 text-xs"
                  disabled={!reasonOk || busy}
                  onClick={() => exportM.mutate({ tenantId: tenant.id, reason: reason.trim() })}
                >
                  {exportM.isPending ? "Đang đóng gói…" : "Xuất gói bàn giao (.zip)"}
                </button>
                {tenant.status !== "closed" && (
                  <button type="button" className="btn-ghost !py-1.5 text-xs text-red-800" disabled={!armed || tenant.status === "suspended"} onClick={() => suspendM.mutate(payload)}>
                    Tạm ngừng trung tâm
                  </button>
                )}
                {tenant.status !== "closed" && (
                  <button type="button" className="btn-primary !bg-red-700 !py-1.5 text-xs hover:!bg-red-800" disabled={!armed} onClick={() => closeM.mutate(payload)}>
                    Đóng trung tâm (kết thúc hợp đồng)
                  </button>
                )}
                {(tenant.status === "suspended" || tenant.status === "closed") && (
                  <button type="button" className="btn-ghost !py-1.5 text-xs" disabled={!armed} onClick={() => reopenM.mutate(payload)}>
                    Mở lại trung tâm
                  </button>
                )}
              </div>
              <p className="text-[11px] text-red-800/80">
                Nút đỏ chỉ bật khi đã gõ đúng mã <b>{tenant.code}</b> và nhập lý do. Nên <b>xuất gói bàn giao trước</b>, rồi mới đóng.
              </p>
              {err && <p className="text-sm text-red-700">{err}</p>}
              {done && <p className="text-sm font-medium text-green-800">{done}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tạo trung tâm nhượng quyền — panel MỘT BƯỚC                         */
/* ------------------------------------------------------------------ */

export function NewTenantPanel({ templates }: { templates: Template[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sourceTenantId, setSource] = useState(templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [legalName, setLegalName] = useState("");
  const [contractNo, setContractNo] = useState("");
  const [centerCode, setCenterCode] = useState("");
  const [centerName, setCenterName] = useState("");
  const [roomCount, setRoomCount] = useState("2");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [reason, setReason] = useState("");

  const preview = useQuery({ ...trpc.tenants.previewProvision.queryOptions({ sourceTenantId, roomCount: Number(roomCount) || 0 }), enabled: open && !!sourceTenantId });
  const m = useMutation(trpc.tenants.provision.mutationOptions({ onSuccess: () => router.refresh() }));

  const ready = code.trim().length >= 2 && name.trim().length >= 3 && centerCode.trim().length >= 2 && centerName.trim().length >= 3
    && /\S+@\S+\.\S+/.test(adminEmail) && adminFullName.trim().length >= 2 && reason.trim().length >= 10 && !!sourceTenantId;

  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>+ Tạo trung tâm nhượng quyền</button>;

  const copy = (preview.data?.lines ?? []).filter((l) => l.kind === "copy");
  const create = (preview.data?.lines ?? []).filter((l) => l.kind === "create");
  const skip = (preview.data?.lines ?? []).filter((l) => l.kind === "skip");

  return (
    <Panel
      title="Tạo trung tâm nhượng quyền"
      desc="Chọn mô hình mẫu → điền tên / mã / địa chỉ → xem bảng kê → nhập lý do → Tạo. Tất cả ghi trong một lượt, có thể xem lại ở nhật ký."
      onClose={() => setOpen(false)}
    >
      {m.data ? (
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-green-700">Đã tạo trung tâm {m.data.code} · {m.data.name}.</p>
          <p className="text-muted-foreground">
            Cơ sở đầu tiên <b>{m.data.centerCode}</b> · tài khoản quản trị <b>{m.data.adminEmail}</b> đang ở trạng thái <b>chờ kích hoạt</b> (không có mật khẩu — người dùng tự đặt qua thư mời).
          </p>
          <div>
            <h3 className="font-semibold">Đã sao chép</h3>
            <ul className="mt-1 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
              {Object.entries(m.data.created as Record<string, number>).map(([k, v]) => (
                <li key={k}>{CREATED_LABEL[k] ?? k}: <b>{v}</b></li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">Việc cần làm tiếp</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              {m.data.nextSteps.map((s: string) => <li key={s}>{s}</li>)}
            </ol>
          </div>
          <button className="btn-primary" onClick={() => { setOpen(false); m.reset(); }}>Xong</button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate({
              sourceTenantId, code: code.trim().toUpperCase(), name: name.trim(),
              legalName: legalName.trim() || null, taxCode: taxCode.trim() || null, address: address.trim() || null,
              phone: phone.trim() || null, contractNo: contractNo.trim() || null,
              centerCode: centerCode.trim().toUpperCase(), centerName: centerName.trim(), centerAddress: address.trim() || null,
              roomCount: Number(roomCount) || 0, adminEmail: adminEmail.trim().toLowerCase(), adminFullName: adminFullName.trim(), reason: reason.trim(),
            });
          }}
        >
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">1. Mô hình mẫu</h3>
            <select className="input w-full" value={sourceTenantId} onChange={(e) => setSource(e.target.value)}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.name}{t.isDefault ? " (chuỗi gốc)" : ""}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Khung vận hành của mô hình mẫu sẽ được sao chép sang trung tâm mới. Không sao chép bất kỳ dữ liệu cá nhân nào.</p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">2. Trung tâm mới</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">Mã trung tâm <span className="text-muted-foreground">(IN HOA, không đổi được)</span>
                <input className="input mt-1 w-full uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="FR_HUE" required />
              </label>
              <label className="text-sm">Tên trung tâm
                <input className="input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Sata Robo Huế" required />
              </label>
              <label className="text-sm">Địa chỉ
                <input className="input mt-1 w-full" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} placeholder="12 Lê Lợi, Vĩnh Ninh, Huế" />
              </label>
              <label className="text-sm">Điện thoại
                <input className="input mt-1 w-full" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
              </label>
              <label className="text-sm">Pháp nhân
                <input className="input mt-1 w-full" value={legalName} onChange={(e) => setLegalName(e.target.value)} maxLength={200} placeholder="Công ty TNHH …" />
              </label>
              <label className="text-sm">Mã số thuế <span className="text-muted-foreground">(có thì tạo pháp nhân)</span>
                <input className="input mt-1 w-full" value={taxCode} onChange={(e) => setTaxCode(e.target.value)} maxLength={20} />
              </label>
              <label className="text-sm">Số hợp đồng nhượng quyền
                <input className="input mt-1 w-full" value={contractNo} onChange={(e) => setContractNo(e.target.value)} maxLength={50} />
              </label>
              <label className="text-sm">Số phòng học mẫu
                <input type="number" min={0} max={10} className="input mt-1 w-full" value={roomCount} onChange={(e) => setRoomCount(e.target.value)} />
              </label>
              <label className="text-sm">Mã cơ sở đầu tiên <span className="text-muted-foreground">(khác mọi cơ sở đang có)</span>
                <input className="input mt-1 w-full uppercase" value={centerCode} onChange={(e) => setCenterCode(e.target.value.toUpperCase())} maxLength={20} placeholder="HUE1" required />
              </label>
              <label className="text-sm">Tên cơ sở đầu tiên
                <input className="input mt-1 w-full" value={centerName} onChange={(e) => setCenterName(e.target.value)} maxLength={120} placeholder="Sata Robo Huế — Lê Lợi" required />
              </label>
              <label className="text-sm">Email quản trị trung tâm
                <input type="email" className="input mt-1 w-full" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} maxLength={200} required />
              </label>
              <label className="text-sm">Họ tên quản trị
                <input className="input mt-1 w-full" value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} maxLength={120} required />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Tài khoản quản trị được tạo ở trạng thái <b>chờ kích hoạt</b>: hệ thống không đặt và không sinh mật khẩu.</p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">3. Bảng kê sẽ tạo</h3>
            {preview.isPending && <p className="text-sm text-muted-foreground">Đang tính bảng kê…</p>}
            {preview.error && <p className="text-sm text-red-700">{preview.error.message}</p>}
            {preview.data && (
              <div className="grid gap-3 text-sm md:grid-cols-3">
                {([["Sao chép từ mô hình mẫu", copy], ["Tạo mới", create], ["Không sao chép", skip]] as const).map(([title, lines]) => (
                  <div key={title} className="rounded-xl border border-black/10 p-3">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h4>
                    <ul className="mt-1 space-y-1 text-xs">
                      {lines.map((l) => (
                        <li key={l.key} className="flex items-baseline justify-between gap-2">
                          <span>{l.label}{l.note && <span className="block text-[11px] text-muted-foreground">{l.note}</span>}</span>
                          <b className={l.kind === "skip" ? "text-muted-foreground" : ""}>{l.count}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">4. Lý do &amp; xác nhận</h3>
            <input className="input w-full" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Lý do tạo trung tâm (bắt buộc, ≥ 10 ký tự — ghi vào nhật ký)" required />
            {m.error && <p className="text-sm text-red-700">{m.error.message}</p>}
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={!ready || m.isPending}>{m.isPending ? "Đang tạo…" : "Tạo trung tâm"}</button>
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Huỷ</button>
            </div>
          </section>
        </form>
      )}
    </Panel>
  );
}
