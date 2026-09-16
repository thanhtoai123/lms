"use client";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const forbidden = /quyền|FORBIDDEN/i.test(error.message);
  return (
    <div className="card p-6 max-w-xl space-y-3">
      <h1 className="text-lg font-bold">{forbidden ? "Không có quyền truy cập" : "Có lỗi khi tải trang"}</h1>
      <p className="text-sm text-ink-600">{forbidden ? "Tài khoản của bạn không được phép xem màn hình này hoặc dữ liệu của cơ sở này." : "Vui lòng thử lại. Nếu lỗi lặp lại, báo quản trị hệ thống kèm mã bên dưới."}</p>
      {error.digest && <p className="text-xs font-mono text-ink-400">Mã: {error.digest}</p>}
      <button className="btn-ghost" onClick={reset}>Thử lại</button>
    </div>
  );
}
