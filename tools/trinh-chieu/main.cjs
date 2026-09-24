/**
 * TRÌNH CHIẾU AN TOÀN — ứng dụng máy tính để chiếu giáo án.
 *
 * VÌ SAO PHẢI CÓ ỨNG DỤNG NÀY:
 * Trang web KHÔNG thể chặn chụp / quay màn hình. Hệ điều hành lấy hình thẳng từ bộ đệm màn hình,
 * phần mềm quay (OBS, Bandicam, Teams, Zoom…) không hề chạm vào trang, còn PrintScreen và
 * Win+Shift+S thường bị Windows nuốt trước nên trang không thấy phím nào cả. Mọi "chống chụp"
 * bằng JavaScript chỉ là rào cho người dùng phổ thông.
 *
 * Chặn THẬT chỉ có ở mức hệ điều hành:
 *   Windows 10 2004+ : SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)
 *   macOS            : NSWindow.sharingType = none
 * Electron gói cả hai vào một lệnh: win.setContentProtection(true).
 * Khi bật, cửa sổ này hiện MÀN ĐEN trong mọi phần mềm chụp/quay thông thường và trong
 * chia sẻ màn hình của Teams/Zoom/Meet — trong khi máy chiếu nối bằng dây (HDMI) vẫn thấy bình thường.
 *
 * VẪN KHÔNG CHẶN ĐƯỢC: điện thoại chụp màn chiếu, máy quay ngoài, thiết bị bắt HDMI.
 * Không hệ thống nào trên đời chặn được mấy thứ đó — nên vẫn giữ chữ mờ + nhật ký để truy nguồn.
 */
"use strict";

const { app, BrowserWindow, session, Menu, dialog, shell, globalShortcut } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

/** Đọc cấu hình: ưu tiên biến môi trường, sau đó cau-hinh.json cạnh ứng dụng, cuối cùng là mặc định */
function docCauHinh() {
  const mac_dinh = { baseUrl: "http://localhost:3000", kiosk: false };
  let tep = {};
  const p = path.join(__dirname, "cau-hinh.json");
  try {
    if (fs.existsSync(p)) tep = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.error("cau-hinh.json sai định dạng, dùng mặc định:", e.message);
  }
  const base = String(process.env.SATA_URL || tep.baseUrl || mac_dinh.baseUrl).replace(/\/+$/, "");
  return {
    baseUrl: base,
    kiosk: process.env.SATA_KIOSK === "1" || tep.kiosk === true,
    /** Mở thẳng một buổi học nếu được truyền vào: --buoi=<lessonId> */
    lessonId: (process.argv.find((a) => a.startsWith("--buoi=")) || "").slice("--buoi=".length) || tep.lessonId || "",
    /**
     * Tên tiến trình phần mềm quay/chụp bị chặn. Đang chạy một trong số này thì ứng dụng ẨN bài
     * và hiện lời nhắc, tới khi tắt phần mềm đó. KHÔNG mặc định chặn Zoom/Teams vì trung tâm còn
     * dạy online bằng chính hai phần mềm đó — trung tâm nào cần thì thêm vào cau-hinh.json.
     */
    chanPhanMem: Array.isArray(tep.chanPhanMem) && tep.chanPhanMem.length ? tep.chanPhanMem.map(String) : [
      "obs64.exe", "obs32.exe", "obs.exe", "bandicam.exe", "camtasia.exe", "camtasiastudio.exe",
      "snagit32.exe", "snagiteditor.exe", "sharex.exe", "action.exe", "xsplit.core.exe",
      "fraps.exe", "activepresenter.exe", "screenrec.exe", "flashback recorder.exe", "icecreamscreenrecorder.exe",
      "movavi screen recorder.exe", "apowerrec.exe", "screenpresso.exe", "loom.exe", "streamlabs obs.exe",
    ],
    /** Giây giữa hai lần quét tiến trình (0 = tắt hẳn việc quét) */
    chuKyQuet: Number.isFinite(tep.chuKyQuet) ? Number(tep.chuKyQuet) : 5,
    /** Chặn khi đang chiếu qua Remote Desktop / phiên điều khiển từ xa */
    chanTuXa: tep.chanTuXa !== false,
  };
}

const CAU_HINH = docCauHinh();
/** Chỉ cho phép đi lại trong đúng máy chủ của trung tâm */
const GOC = (() => { try { return new URL(CAU_HINH.baseUrl).origin; } catch { return "http://localhost:3000"; } })();

/** Trang mở đầu: vào thẳng khung chiếu nếu có buổi, không thì vào trang chọn giáo án */
function duongDanDau() {
  return CAU_HINH.lessonId ? `${CAU_HINH.baseUrl}/scorm/buoi/${CAU_HINH.lessonId}` : `${CAU_HINH.baseUrl}/scorm`;
}

let win = null;

/* ------------------------------------------------------------------ */
/* Canh gác: phần mềm quay màn hình & phiên điều khiển từ xa           */
/* ------------------------------------------------------------------ */

const { execFile } = require("node:child_process");
const { net } = require("electron");

/** Cửa sổ lời nhắc khi phát hiện phần mềm quay (bài bị ẩn trong lúc này) */
let canhBao = null;
let dangChan = null; // tên phần mềm / lý do đang chặn, null = không chặn
let daBao = new Set(); // đã gửi nhật ký cho lý do nào (khỏi dội máy chủ)

/** Danh sách tiến trình đang chạy, chữ thường. Lỗi thì trả mảng rỗng (không chặn oan). */
function dsTienTrinh() {
  return new Promise((ok) => {
    const xong = (list) => ok(list);
    if (process.platform === "win32") {
      execFile("tasklist", ["/fo", "csv", "/nh"], { windowsHide: true, maxBuffer: 4 << 20 }, (e, out) => {
        if (e || !out) return xong([]);
        xong(out.split(/\r?\n/).map((d) => (d.split('","')[0] || "").replace(/^"/, "").toLowerCase()).filter(Boolean));
      });
    } else {
      execFile("ps", ["-A", "-o", "comm="], { maxBuffer: 4 << 20 }, (e, out) => {
        if (e || !out) return xong([]);
        xong(out.split(/\r?\n/).map((d) => d.trim().split("/").pop().toLowerCase()).filter(Boolean));
      });
    }
  });
}

/** Đang chiếu qua Remote Desktop? (Windows đặt SESSIONNAME = RDP-Tcp#N cho phiên từ xa) */
function phienTuXa() {
  if (process.platform !== "win32") return false;
  return /^rdp-/i.test(String(process.env.SESSIONNAME || ""));
}

/** Gửi nhật ký "nghi vấn sao chép" về máy chủ — dùng đúng phiên đăng nhập của cửa sổ đang mở */
function ghiNhatKy(kind) {
  try {
    const url = win && win.webContents ? win.webContents.getURL() : "";
    const m = /\/scorm\/buoi\/([0-9a-f-]{36})/i.exec(url || "");
    if (!m) return; // không ở trong khung chiếu thì không có buổi nào để ghi
    const req = net.request({
      method: "POST",
      url: `${CAU_HINH.baseUrl}/api/trpc/content.planCaptureAttempt`,
      session: session.fromPartition("persist:sata-trinh-chieu"),
      useSessionCookies: true,
    });
    req.setHeader("Content-Type", "application/json");
    req.on("error", () => {});
    req.end(JSON.stringify({ json: { lessonId: m[1], kind } }));
  } catch { /* nhật ký là phụ, không được làm hỏng buổi dạy */ }
}

/** Hiện / tắt lời nhắc và ẩn bài khi bị chặn */
function datTrangThaiChan(lyDo, nhan) {
  if (dangChan === lyDo) return;
  dangChan = lyDo;
  if (lyDo) {
    if (win) win.hide(); // ẩn hẳn: không còn gì trên màn hình để quay
    if (!canhBao || canhBao.isDestroyed()) {
      canhBao = new BrowserWindow({
        width: 760, height: 360, resizable: false, minimizable: false, maximizable: false,
        alwaysOnTop: true, title: "Trình chiếu an toàn", backgroundColor: "#111827",
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, devTools: false },
      });
      canhBao.setMenu(null);
      canhBao.on("closed", () => { canhBao = null; });
    }
    const html = `<!doctype html><meta charset="utf-8"><title>Tạm dừng chiếu</title>
      <body style="margin:0;font:16px/1.6 system-ui,Segoe UI,sans-serif;background:#111827;color:#f9fafb;padding:28px">
      <h1 style="margin:0 0 12px;font-size:22px">Đã tạm dừng chiếu học liệu</h1>
      <p style="margin:0 0 10px">${nhan}</p>
      <p style="margin:0 0 10px;color:#fca5a5">Học liệu có bản quyền của trung tâm. Lượt này đã được ghi vào nhật ký.</p>
      <p style="margin:0;color:#9ca3af">Đóng phần mềm đó rồi bài sẽ tự hiện lại sau vài giây — không cần mở lại ứng dụng.</p>
      </body>`;
    canhBao.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    canhBao.show();
    if (!daBao.has(lyDo)) { daBao.add(lyDo); ghiNhatKy(lyDo === "tu-xa" ? "remote_session" : "recorder_running"); }
  } else {
    if (canhBao && !canhBao.isDestroyed()) canhBao.close();
    canhBao = null;
    daBao.clear();
    if (win) { win.show(); win.focus(); }
  }
}

/** Vòng canh gác: quét tiến trình + phiên từ xa theo chu kỳ */
function batCanhGac() {
  if (CAU_HINH.chuKyQuet <= 0) return null;
  const chan = CAU_HINH.chanPhanMem.map((x) => x.toLowerCase());
  const quet = async () => {
    try {
      if (CAU_HINH.chanTuXa && phienTuXa()) {
        return datTrangThaiChan("tu-xa", "Máy đang được điều khiển/chiếu từ xa (Remote Desktop) — không chiếu học liệu trong phiên này.");
      }
      const dang = await dsTienTrinh();
      const thay = dang.find((t) => chan.includes(t));
      if (thay) return datTrangThaiChan(thay, `Phát hiện phần mềm quay/chụp màn hình đang chạy: <b>${thay}</b>.`);
      datTrangThaiChan(null, "");
    } catch { /* quét lỗi thì thôi, không chặn oan */ }
  };
  void quet();
  return setInterval(quet, Math.max(2, CAU_HINH.chuKyQuet) * 1000);
}


function taoCuaSo() {
  // Phiên riêng, CÓ lưu cookie: giáo viên đăng nhập một lần, hôm sau mở là vào thẳng.
  // Ứng dụng KHÔNG BAO GIỜ tự nhập mật khẩu — người dùng tự đăng nhập trong cửa sổ này.
  const phien = session.fromPartition("persist:sata-trinh-chieu");

  // Nhận diện ứng dụng để trang web biết mình đang được bảo vệ (viewer.tsx đọc chuỗi này)
  const ua = `${phien.getUserAgent()} SataRoboTrinhChieu/1.0`;
  phien.setUserAgent(ua);

  // Không cho tải tệp về máy: mọi lượt tải đều huỷ ngay.
  phien.on("will-download", (e, item) => {
    e.preventDefault();
    console.warn("Chặn tải tệp:", item.getFilename());
  });

  // Không xin quyền gì cả (camera, mic, ghi màn hình, thông báo…) — chiếu bài không cần.
  phien.setPermissionRequestHandler((_wc, _quyen, cb) => cb(false));
  phien.setPermissionCheckHandler(() => false);
  // Chặn luôn API chia sẻ màn hình của chính trang web
  if (typeof phien.setDisplayMediaRequestHandler === "function") {
    phien.setDisplayMediaRequestHandler(() => {}, { useSystemPicker: false });
  }

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#000000",
    show: false,
    autoHideMenuBar: true,
    kiosk: CAU_HINH.kiosk,
    title: "Trình chiếu an toàn — Sata Robo",
    webPreferences: {
      session: phien,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: false, // không có DevTools thì không ai lôi được đường dẫn tệp gốc ra
      spellcheck: false,
    },
  });

  // ĐÂY LÀ LỚP BẢO VỆ THẬT: cửa sổ bị loại khỏi mọi lệnh chụp/quay của hệ điều hành.
  //
  // PHẢI BẬT LẠI NHIỀU LẦN, không phải bật một lần là xong: trên Windows, cờ
  // SetWindowDisplayAffinity gắn vào HWND, mà Electron dựng lại HWND khi đổi fullscreen /
  // thu nhỏ rồi mở lại. Đo thực tế trên máy dạy: bật một lần trước khi hiện cửa sổ thì
  // GetWindowDisplayAffinity vẫn đọc ra 0x0 (KHÔNG được bảo vệ). Vì vậy bật lại ở mọi mốc.
  const batBaoVe = () => { try { win.setContentProtection(true); } catch { /* cửa sổ đã đóng */ } };
  batBaoVe();
  for (const su of ["show", "focus", "restore", "maximize", "enter-full-screen", "leave-full-screen", "move", "resize"]) {
    win.on(su, batBaoVe);
  }
  win.webContents.on("did-finish-load", batBaoVe);
  // Lưới an toàn: soát lại mỗi 3 giây, rẻ và chắc chắn hơn tin vào danh sách sự kiện
  const nhip = setInterval(batBaoVe, 3000);
  win.on("closed", () => clearInterval(nhip));

  Menu.setApplicationMenu(null);

  // Không mở cửa sổ phụ; link ra ngoài thì đẩy sang trình duyệt hệ thống (ngoài vùng bảo vệ)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(GOC)) { win.loadURL(url); return { action: "deny" }; }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // Không cho điều hướng ra khỏi máy chủ trung tâm
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(GOC)) { e.preventDefault(); void shell.openExternal(url); }
  });

  // Chặn phím in / lưu / mở DevTools ngay ở tầng ứng dụng (trang web chặn không phải lúc nào cũng tới)
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    const k = (input.key || "").toLowerCase();
    const mod = input.control || input.meta;
    if (mod && (k === "p" || k === "s" || k === "u")) return e.preventDefault();
    if (k === "f12" || (mod && input.shift && (k === "i" || k === "j" || k === "c"))) return e.preventDefault();
    if (k === "f11") { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
  });

  win.once("ready-to-show", () => {
    // restore() vì nếu ứng dụng được gọi từ một cửa sổ dòng lệnh đang thu nhỏ, Windows
    // truyền trạng thái "minimized" sang tiến trình con và cửa sổ hiện ra bị thu nhỏ sẵn.
    win.restore();
    win.show();
    win.setFullScreen(true);
    win.focus();
    batBaoVe();
  });

  win.webContents.on("did-fail-load", (_e, code, mota, url) => {
    if (code === -3) return; // bị huỷ do điều hướng tiếp, không phải lỗi
    dialog.showMessageBox(win, {
      type: "error",
      title: "Không mở được hệ thống",
      message: `Không kết nối được ${url}`,
      detail: `${mota} (mã ${code}).\n\nKiểm tra: máy chủ đã chạy chưa, địa chỉ trong cau-hinh.json có đúng không.`,
      buttons: ["Thử lại", "Đóng"],
    }).then((r) => { if (r.response === 0) win.loadURL(duongDanDau()); else win.close(); });
  });

  win.on("closed", () => { win = null; });
  void win.loadURL(duongDanDau());
}

// Chỉ cho chạy MỘT bản: mở lần hai thì đưa cửa sổ đang có lên, tránh hai phiên đăng nhập lệch nhau
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  let nhipCanhGac = null;
  app.whenReady().then(() => {
    taoCuaSo();
    nhipCanhGac = batCanhGac();
    // Thoát toàn màn hình bằng Esc; thoát ứng dụng bằng Ctrl+Shift+Q (để lỡ tay không tắt giữa buổi dạy)
    globalShortcut.register("CommandOrControl+Shift+Q", () => app.quit());
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) taoCuaSo(); });
  });

  app.on("will-quit", () => { globalShortcut.unregisterAll(); if (nhipCanhGac) clearInterval(nhipCanhGac); });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
