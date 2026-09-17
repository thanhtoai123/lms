import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { listZip, readZipEntry, buildStoredZip } from "./zip.js";

test("zip: đọc gói không nén", () => {
  const z = buildStoredZip([{ name: "imsmanifest.xml", data: Buffer.from("<manifest/>") }, { name: "thư mục/a.html", data: Buffer.from("xin chào") }]);
  const es = listZip(z);
  assert.deepEqual(es.map((e) => e.name), ["imsmanifest.xml", "thư mục/a.html"]);
  assert.equal(readZipEntry(z, es[1]!).toString(), "xin chào");
  assert.throws(() => listZip(Buffer.from("not a zip at all, definitely not")));
});

test("zip: đọc mục nén deflate", () => {
  const z = buildStoredZip([{ name: "a.txt", data: Buffer.from("x") }]);
  const es = listZip(z);
  // giả lập mục deflate bằng cách tự dựng lại tệp
  const data = Buffer.from("hello hello hello hello");
  const comp = deflateRawSync(data);
  const e = { ...es[0]!, method: 8, size: data.length, compressedSize: comp.length, offset: 0 };
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(1, 26);
  const buf = Buffer.concat([lh, Buffer.from("a"), comp]);
  assert.equal(readZipEntry(buf, e).toString(), data.toString());
});
