import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slugify, validatePost, postTransition, readingMinutes, renderMarkdown, validateSiteBlock, normUtm, channelOf, validateCampaign, campaignMetrics, buildUtmUrl,
  validAnonId, cohortRow, churnRate, withdrawReasonGroup, dsrTransition, dsrDue, dsrSlaState, erasureDecision, validateDsr, retentionCutoff, anonymizedPhone, dsrCode, dsrAckDue, dsrCanExtend, incidentNotifyDue, validateIncident, incidentCloseCheck, incidentCode,
} from "./rules.js";

test("tin tức: slug, kiểm tra, trạng thái", () => {
  assert.equal(slugify("Khai giảng khoá Robotics hè 2026 — Đà Nẵng!"), "khai-giang-khoa-robotics-he-2026-da-nang");
  const ok = { title: "Khai giảng khoá hè 2026", slug: "khai-giang-he-2026", body: "x".repeat(60) };
  assert.deepEqual(validatePost(ok), []);
  assert.ok(validatePost({ ...ok, slug: "Khai Giang" }).length);
  assert.ok(validatePost({ ...ok, title: "Ngắn", body: "ngắn" }).length === 2);
  const now = new Date("2026-09-17T00:00:00Z");
  assert.equal(postTransition("draft", "publish", { now }), "published");
  assert.throws(() => postTransition("published", "publish", { now }));
  assert.equal(postTransition("draft", "schedule", { now, publishAt: new Date("2026-09-18T00:00:00Z") }), "scheduled");
  assert.throws(() => postTransition("draft", "schedule", { now, publishAt: new Date("2026-09-17T00:01:00Z") }));
  assert.throws(() => postTransition("published", "schedule", { now, publishAt: new Date("2026-09-18T00:00:00Z") }));
  assert.equal(postTransition("scheduled", "unpublish", { now }), "draft");
  assert.equal(postTransition("archived", "restore", { now }), "draft");
  assert.throws(() => postTransition("archived", "publish", { now }));
  assert.equal(readingMinutes("a ".repeat(450)), 2);
});

test("markdown an toàn", () => {
  const h = renderMarkdown("## Tiêu đề\nĐoạn **đậm** và *nghiêng* <script>alert(1)</script>\n\n- một\n- hai\n\n1. a\n\n> trích\n[link](https://satarobo.vn) [xấu](javascript:alert(1)) [nội bộ](/dang-ky)\n![ảnh](https://x.vn/a.png)");
  assert.ok(h.includes("<h2>Tiêu đề</h2>"));
  assert.ok(h.includes("<strong>đậm</strong>") && h.includes("<em>nghiêng</em>"));
  assert.ok(h.includes("&lt;script&gt;") && !h.includes("<script>"));
  assert.ok(h.includes("<ul>\n<li>một</li>\n<li>hai</li>\n</ul>"));
  assert.ok(h.includes("<ol>") && h.includes("<blockquote>trích</blockquote>"));
  assert.ok(h.includes('<a href="https://satarobo.vn" rel="noopener nofollow" target="_blank">link</a>'));
  assert.ok(!h.includes("javascript:") && h.includes("xấu"));
  assert.ok(h.includes('<a href="/dang-ky">nội bộ</a>'));
  assert.ok(h.includes('<img src="https://x.vn/a.png" alt="ảnh" loading="lazy" />'));
  assert.ok(!renderMarkdown('[x](" onmouseover="a)').includes("onmouseover=\""));
  assert.equal(renderMarkdown("![a](//evil.com/x.png)"), "<p></p>");
});

test("nội dung website", () => {
  assert.deepEqual(validateSiteBlock("home", { heroTitle: "Sata Robo", ctaLabel: "Đăng ký", ctaUrl: "/dang-ky", heroImage: "/api/public/site-media/abc.png" }), []);
  assert.ok(validateSiteBlock("home", { heroTitle: "", ctaLabel: "x", ctaUrl: "javascript:x" }).length === 2);
  assert.ok(validateSiteBlock("home", { heroTitle: "a", ctaLabel: "b", ctaUrl: "/x", hack: "1" }).length === 1);
  assert.ok(validateSiteBlock("home", { heroTitle: "a", ctaLabel: "b", ctaUrl: "/x", heroImage: "file:///etc" }).length === 1);
  assert.deepEqual(validateSiteBlock("nope", {}), ["Trang không tồn tại"]);
});

test("tracking & chiến dịch", () => {
  assert.equal(normUtm(" Facebook Ads "), "facebook_ads");
  assert.equal(normUtm(""), null);
  assert.equal(channelOf("fb", null), "facebook");
  assert.equal(channelOf(null, "walk-in"), "offline");
  assert.equal(channelOf("zalo_oa", null), "zalo");
  assert.equal(channelOf(null, "web-form"), "organic");
  assert.equal(channelOf("xyz", null), "other");
  assert.deepEqual(validateCampaign({ name: "Hè 2026", utmCampaign: "he_2026", channel: "facebook", budget: 5000000, startDate: "2026-06-01", endDate: "2026-07-01" }), []);
  assert.equal(validateCampaign({ name: "H", utmCampaign: "Hè 2026", channel: "facebook", budget: -1, startDate: "x", endDate: "2020-01-01" }).length, 5);
  assert.deepEqual(campaignMetrics({ spend: 10_000_000, visits: 2000, leads: 100, trials: 40, enrolled: 20, revenue: 96_000_000 }), { cvr: 5, trialRate: 40, closeRate: 20, cpl: 100000, cpa: 500000, roas: 9.6 });
  assert.equal(campaignMetrics({ spend: 0, visits: 0, leads: 0, trials: 0, enrolled: 0, revenue: 0 }).cpl, null);
  assert.equal(buildUtmUrl("https://satarobo.vn/dang-ky", { source: "Facebook", medium: "cpc", campaign: "he_2026" }), "https://satarobo.vn/dang-ky?utm_source=facebook&utm_medium=cpc&utm_campaign=he_2026");
  assert.throws(() => buildUtmUrl("http://x", { source: "a", medium: "b", campaign: "c" }));
  assert.equal(validAnonId("a1B2c3D4e5F6g7H8"), true);
  assert.equal(validAnonId("0905123456abcdefgh"), false);
  assert.equal(validAnonId("short"), false);
});

test("cohort & churn", () => {
  const r = cohortRow([{ status: "completed" }, { status: "completed" }, { status: "withdrawn" }, { status: "active" }, { status: "paused" }]);
  assert.deepEqual(r, { size: 5, completed: 2, withdrawn: 1, active: 1, paused: 1, transferred: 0, completionRate: 40, withdrawRate: 20, retention: 80 });
  assert.equal(cohortRow([]).retention, 0);
  assert.equal(churnRate(40, 3), 7.5);
  assert.equal(churnRate(0, 3), 0);
  assert.equal(withdrawReasonGroup("Gia đình chuyển nhà xa"), "schedule");
  assert.equal(withdrawReasonGroup("Học phí cao"), "finance");
  assert.equal(withdrawReasonGroup(null), "other");
});

test("tuân thủ dữ liệu", () => {
  assert.equal(dsrTransition("received", "verify"), "verifying");
  assert.equal(dsrTransition("verifying", "start"), "in_progress");
  assert.equal(dsrTransition("in_progress", "complete"), "completed");
  assert.throws(() => dsrTransition("received", "complete"));
  assert.throws(() => dsrTransition("completed", "reject"));
  const rec = new Date("2026-09-17T00:00:00Z");
  assert.equal(dsrDue("delete", rec).toISOString(), "2026-10-07T00:00:00.000Z");
  assert.equal(dsrDue("access", rec).toISOString(), "2026-09-27T00:00:00.000Z");
  assert.equal(dsrDue("withdraw_consent", rec, true).toISOString(), "2026-10-17T00:00:00.000Z");
  assert.equal(dsrSlaState(dsrDue("access", rec), "received", new Date("2026-09-26T00:00:00Z")), "due_soon");
  assert.equal(dsrSlaState(dsrDue("access", rec), "received", new Date("2026-09-28T00:00:00Z")), "overdue");
  assert.equal(dsrSlaState(dsrDue("access", rec), "completed", new Date("2026-09-28T00:00:00Z")), "done");
  assert.equal(dsrSlaState(dsrDue("access", rec), "in_progress", new Date("2026-09-18T01:00:00Z")), "ok");
  // tiếp nhận thứ 6 (giờ VN) → hạn phản hồi thứ 3 tuần sau
  assert.equal(dsrAckDue(new Date("2026-09-18T03:00:00Z")).toISOString(), "2026-09-22T03:00:00.000Z");
  assert.equal(dsrAckDue(new Date("2026-09-16T03:00:00Z")).toISOString(), "2026-09-18T03:00:00.000Z");
  assert.equal(dsrCanExtend({ status: "in_progress", extendedAt: null, reason: "Cần xác minh thêm hồ sơ" }).length, 0);
  assert.equal(dsrCanExtend({ status: "in_progress", extendedAt: new Date(), reason: "Cần xác minh thêm hồ sơ" }).length, 1);
  assert.equal(dsrCanExtend({ status: "completed", extendedAt: null, reason: "x" }).length, 2);
  assert.deepEqual(erasureDecision({ subjectType: "lead", hasFinancialRecords: false, hasActiveEnrollment: false, hasOpenDebt: false }), { allowed: true, mode: "anonymize", reasons: [] });
  assert.equal(erasureDecision({ subjectType: "parent", hasFinancialRecords: true, hasActiveEnrollment: false, hasOpenDebt: false }).mode, "partial");
  assert.equal(erasureDecision({ subjectType: "parent", hasFinancialRecords: true, hasActiveEnrollment: true, hasOpenDebt: true }).reasons.length, 2);
  assert.deepEqual(validateDsr({ type: "delete", requesterName: "Chị Lan", requesterPhone: "0905 123 456", details: "Xin xoá thông tin của tôi", channel: "phone" }), []);
  assert.equal(validateDsr({ type: "delete", requesterName: "L", requesterPhone: "123", details: "xoá", channel: "fax" }).length, 4);
  assert.equal(retentionCutoff("2026-09-17", 24), "2024-09-17");
  assert.equal(retentionCutoff("2026-03-31", 13), "2025-02-28");
  assert.throws(() => retentionCutoff("2026-03-31", 1));
  assert.equal(anonymizedPhone("12345678-aaaa"), "0001234567");
  assert.equal(dsrCode(2026, 7), "YC-DL26-0007");
});

test("sự cố dữ liệu: hạn thông báo 72 giờ, điều kiện đóng", () => {
  const d = new Date("2026-09-17T02:00:00Z");
  assert.equal(incidentNotifyDue(d).toISOString(), "2026-09-20T02:00:00.000Z");
  const now = new Date("2026-09-17T03:00:00Z");
  assert.equal(validateIncident({ title: "Lộ file", description: "Gửi nhầm danh sách phụ huynh cho nhóm Zalo khác", severity: "medium", detectedAt: d, affectedCount: 30, now }).length, 0);
  assert.equal(validateIncident({ title: "x", description: "ngắn", severity: "medium", detectedAt: new Date("2026-09-18T00:00:00Z"), affectedCount: -1, now }).length, 4);
  assert.equal(incidentCloseCheck({ severity: "high", notifiedAuthorityAt: null, containment: "Đã thu hồi tin nhắn", noNotifyReason: null }).length, 1);
  assert.equal(incidentCloseCheck({ severity: "high", notifiedAuthorityAt: now, containment: "Đã thu hồi tin nhắn", noNotifyReason: null }).length, 0);
  assert.equal(incidentCloseCheck({ severity: "low", notifiedAuthorityAt: null, containment: "Đã thu hồi tin nhắn", noNotifyReason: null }).length, 1);
  assert.equal(incidentCloseCheck({ severity: "low", notifiedAuthorityAt: null, containment: "Đã thu hồi tin nhắn", noNotifyReason: "Chỉ lộ nội bộ, đã xoá ngay" }).length, 0);
  assert.equal(incidentCode(2026, 3), "SC-DL26-003");
});
