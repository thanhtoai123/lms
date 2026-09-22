export const metadata = { title: "Mất kết nối — Sata Robo", robots: { index: false } };

/**
 * Màn "mất kết nối" của cổng phụ huynh. Service worker lưu sẵn trang này và trả về khi mở /ph… lúc offline.
 * Tự đủ khi mất mạng: kiểu chữ / màu viết thẳng vào thuộc tính style (tệp CSS có thể chưa có trong bộ đệm),
 * không cần JavaScript, không có dữ liệu của con.
 */
export default function PhOffline() {
  return (
    <main
      style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "32px 24px", textAlign: "center", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", color: "#241a2e", background: "#fafaf8" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={64} height={64} style={{ width: 64, height: 64, borderRadius: 16 }} />
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "#610b8a" }}>Chưa có kết nối mạng</h1>
      <p style={{ fontSize: 16, lineHeight: 1.6, margin: 0, maxWidth: 320 }}>
        Điện thoại đang mất mạng nên chưa tải được lịch học và phiếu nhận xét của con. Anh/chị kiểm tra Wi-Fi hoặc 4G rồi thử lại nhé.
      </p>
      <a
        href="/ph"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 48, minWidth: 200, padding: "0 24px", borderRadius: 14, background: "#610b8a", color: "#fff", fontSize: 16, fontWeight: 700, textDecoration: "none" }}
      >
        Thử lại
      </a>
      <p style={{ fontSize: 14, color: "#6c6c6c", margin: 0 }}>Cần gấp? Gọi điện cho cơ sở nơi con học.</p>
    </main>
  );
}
