import Link from "next/link";

/** Khung trang công khai (tin tức, giới thiệu) */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/tin-tuc" className="flex items-center gap-2 font-bold text-brand-600"><span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-500 text-white">S</span> Sata Robo</Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/gioi-thieu" className="hover:text-brand-600">Giới thiệu</Link>
            <Link href="/tin-tuc" className="hover:text-brand-600">Tin tức</Link>
            <Link href="/tuyen-dung" className="hover:text-brand-600">Tuyển dụng</Link>
            <Link href="/dang-ky" className="btn-primary !py-1.5">Học thử miễn phí</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      <footer className="border-t border-black/5 py-6 text-center text-xs text-ink-400">© Sata Robo · <a href="https://satarobo.vn/chinh-sach-bao-mat" className="underline">Chính sách bảo mật</a></footer>
    </div>
  );
}
