import { inflateRawSync } from "node:zlib";

export interface ZipEntry { name: string; size: number; compressedSize: number; method: number; offset: number; isDir: boolean }

const MAX_TOTAL = 500 * 1024 * 1024;

/** Đọc mục lục tệp .zip (không hỗ trợ ZIP64 / mã hoá) */
export function listZip(buf: Buffer): ZipEntry[] {
  const min = Math.max(0, buf.length - 65_557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Tệp không phải .zip hợp lệ");
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new Error("Không hỗ trợ ZIP64 — nén lại gói nhỏ hơn 4GB");
  if (cdOffset + cdSize > buf.length) throw new Error("Tệp .zip bị hỏng");
  const out: ZipEntry[] = [];
  let p = cdOffset;
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Mục lục .zip bị hỏng");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString(flags & 0x800 ? "utf8" : "latin1");
    if (flags & 0x1) throw new Error("Không hỗ trợ .zip có mật khẩu");
    total += size;
    if (total > MAX_TOTAL) throw new Error("Gói giải nén vượt 500MB");
    if (compressedSize > 0 && size / compressedSize > 200) throw new Error("Tỉ lệ nén bất thường — từ chối gói");
    out.push({ name, size, compressedSize, method, offset, isDir: name.endsWith("/") });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export function readZipEntry(buf: Buffer, e: ZipEntry): Buffer {
  const p = e.offset;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error(`Tệp ${e.name} trong .zip bị hỏng`);
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + e.compressedSize);
  let data: Buffer;
  if (e.method === 0) data = Buffer.from(raw);
  else if (e.method === 8) data = inflateRawSync(raw, { maxOutputLength: Math.max(1, e.size) });
  else throw new Error(`Không hỗ trợ kiểu nén ${e.method} (${e.name})`);
  if (data.length !== e.size) throw new Error(`Tệp ${e.name} giải nén sai kích thước`);
  return data;
}

/** Tạo .zip không nén (dùng cho dữ liệu mẫu / kiểm thử) */
export function buildStoredZip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(f.data.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, f.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(f.data.length, 20); ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + f.data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
