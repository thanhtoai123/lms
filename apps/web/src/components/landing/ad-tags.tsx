/**
 * THẺ ĐO LƯỜNG QUẢNG CÁO cho trang công khai: Meta Pixel, GA4 và Google Ads — chỉ khi Quản trị → Marketing đã nhập ID
 * và bật "Ghi nhận sự kiện". Đoạn mồi mang nonce CSP; thư viện của Meta / Google được nạp từ đoạn mồi (CSP 'strict-dynamic').
 * ID được kiểm định dạng ở máy chủ khi lưu, ở đây kiểm lại trước khi ghép vào script.
 * Sự kiện chuyển đổi (Lead / generate_lead / conversion) do form gửi khi lead tạo thành công — xem lead-form.tsx.
 */
export function AdTags({ nonce, metaPixelId, ga4Id, googleAdsId, googleAdsLeadLabel }: {
  nonce?: string; metaPixelId: string | null; ga4Id: string | null; googleAdsId: string | null; googleAdsLeadLabel: string | null;
}) {
  const px = metaPixelId && /^\d{10,20}$/.test(metaPixelId) ? metaPixelId : null;
  const ga = ga4Id && /^G-[A-Z0-9]{6,12}$/.test(ga4Id) ? ga4Id : null;
  const aw = googleAdsId && /^AW-\d{6,14}$/.test(googleAdsId) ? googleAdsId : null;
  const awLabel = aw && googleAdsLeadLabel && /^[A-Za-z0-9_-]{6,40}$/.test(googleAdsLeadLabel) ? googleAdsLeadLabel : null;
  if (!px && !ga && !aw) return null;
  const gtagId = ga ?? aw;
  const parts: string[] = [`window.__thAds=${JSON.stringify({ googleAdsId: aw, googleAdsLeadLabel: awLabel })};`];
  if (gtagId) {
    parts.push(
      "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());",
      ga ? `gtag('config',${JSON.stringify(ga)});` : "",
      aw ? `gtag('config',${JSON.stringify(aw)});` : "",
      `(function(){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+${JSON.stringify(encodeURIComponent(gtagId))};document.head.appendChild(s);})();`,
    );
  }
  if (px) {
    parts.push(
      "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');",
      `fbq('init',${JSON.stringify(px)});fbq('track','PageView');`,
    );
  }
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: parts.filter(Boolean).join("\n") }} />;
}
