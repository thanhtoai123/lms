"use client";
import { useEffect } from "react";

/** Ô bảng có mọi dòng chữ ngắn hơn ngưỡng này thì không được xuống dòng giữa chừng */
const MAX_LINE = 48;

/** Độ dài dòng chữ dài nhất trong ô: ô có thẻ con thì xét từng đoạn chữ, ô chỉ có chữ thì xét cả chuỗi */
function longestLine(cell: HTMLElement) {
  if (cell.children.length === 0) return (cell.textContent ?? "").trim().length;
  let max = 0;
  const walk = (el: Node) => {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) max = Math.max(max, (n.textContent ?? "").trim().length);
      else if (n.nodeType === Node.ELEMENT_NODE) {
        const e = n as HTMLElement;
        if (e.tagName === "TEXTAREA" || e.tagName === "SELECT") continue;
        walk(e);
      }
    }
  };
  walk(cell);
  return max;
}

/**
 * Bảng trong khu quản trị / giáo viên: ô chứa chữ ngắn (ngày, số tiền, mã, trạng thái, tên người) giữ nguyên một dòng,
 * để bảng cuộn ngang trên điện thoại thay vì ép cột hẹp làm chữ rớt dòng. Ô có đoạn dài (ghi chú, mô tả) vẫn tự xuống dòng.
 * Đánh dấu bằng thuộc tính `data-nw` (CSS ở globals.css) — theo dõi cả bảng sinh ra sau khi tải dữ liệu.
 */
export function KeepShortCells() {
  useEffect(() => {
    const root = document.getElementById("main");
    if (!root) return;
    let raf = 0;
    const mark = () => {
      raf = 0;
      for (const cell of root.querySelectorAll<HTMLElement>("td:not([data-nw-done])")) {
        cell.setAttribute("data-nw-done", "");
        if (longestLine(cell) <= MAX_LINE) cell.setAttribute("data-nw", "");
      }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(mark); };
    mark();
    const mo = new MutationObserver(schedule);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return null;
}
