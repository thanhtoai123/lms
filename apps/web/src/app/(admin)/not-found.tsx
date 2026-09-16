import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="card p-6 max-w-xl space-y-3">
      <h1 className="text-lg font-bold">Không tìm thấy trang</h1>
      <p className="text-sm text-ink-600">Đường dẫn không tồn tại hoặc dữ liệu đã bị xoá.</p>
      <Link href="/dashboard" className="btn-primary">Về Dashboard</Link>
    </div>
  );
}
