import Link from "next/link";

export const metadata = { title: "Không tìm thấy trang" };

/** 404 chung: ngắn gọn, có đường về trang chủ */
export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6 text-center">
      <div>
        <p className="text-5xl font-extrabold text-brand-600">404</p>
        <h1 className="mt-2 text-xl font-bold">Không tìm thấy trang này</h1>
        <p className="mt-2 text-sm text-ink-600">Đường dẫn có thể đã đổi hoặc trang chưa được xuất bản.</p>
        <Link href="/" className="btn-primary mt-5 inline-block">Về trang chủ</Link>
      </div>
    </main>
  );
}
