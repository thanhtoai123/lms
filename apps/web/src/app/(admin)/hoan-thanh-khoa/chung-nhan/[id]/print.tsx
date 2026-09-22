"use client";

export function PrintButton() {
  return <button className="btn-primary" onClick={() => window.print()}>In giấy chứng nhận / Lưu PDF</button>;
}
