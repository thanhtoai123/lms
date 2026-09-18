import { test } from "node:test";
import assert from "node:assert/strict";
import { canSeeLead, canToggleLeadShare, filterVisibleLeads, leadShareNotice, leadVisibilityReason, LEAD_SHARE_LABEL, sameCenter, type LeadReaderView, type LeadShareRow } from "./sharing.js";

const CS1 = "cs1";
const CS2 = "cs2";
const sale: LeadReaderView = { userId: "u-sale", fullRead: false, centerIds: [CS1] };
const otherSale: LeadReaderView = { userId: "u-other", fullRead: false, centerIds: [CS1] };
const saleCs2: LeadReaderView = { userId: "u-cs2", fullRead: false, centerIds: [CS2] };
const manager: LeadReaderView = { userId: "u-mgr", fullRead: true, centerIds: [CS1] };
const ho: LeadReaderView = { userId: "u-ho", fullRead: true, centerIds: null };

const lead = (o: Partial<LeadShareRow> = {}): LeadShareRow => ({ assignedToId: "u-sale", centerId: CS1, sharedWithCenter: false, ...o });

test("sale chỉ có lead:read_own thấy lead mình giữ", () => {
  assert.equal(canSeeLead(sale, lead()), true);
  assert.equal(canSeeLead(otherSale, lead()), false);
});

test("bật dùng chung → mọi CSKH cùng cơ sở thấy được", () => {
  const shared = lead({ sharedWithCenter: true });
  assert.equal(canSeeLead(otherSale, shared), true);
  assert.equal(canSeeLead(sale, shared), true);
});

test("dùng chung KHÔNG vượt sang cơ sở khác", () => {
  assert.equal(canSeeLead(saleCs2, lead({ sharedWithCenter: true })), false);
  assert.equal(canSeeLead(saleCs2, lead({ centerId: CS2, assignedToId: "u-sale", sharedWithCenter: true })), true);
});

test("người có lead:read đầy đủ thấy mọi lead trong phạm vi, không cần dùng chung", () => {
  assert.equal(canSeeLead(manager, lead()), true);
  assert.equal(canSeeLead(manager, lead({ centerId: CS2 })), false, "quản lý CS1 không thấy lead CS2");
  assert.equal(canSeeLead(ho, lead({ centerId: CS2 })), true, "Hội sở thấy mọi cơ sở");
});

test("lead chưa gắn cơ sở nằm ở pool chung — ai cũng xét được", () => {
  assert.equal(sameCenter(saleCs2, lead({ centerId: null })), true);
  assert.equal(canSeeLead(saleCs2, lead({ centerId: null, sharedWithCenter: true })), true);
  assert.equal(canSeeLead(saleCs2, lead({ centerId: null, sharedWithCenter: false })), false, "chưa dùng chung thì vẫn chỉ chủ lead thấy");
});

test("lead chưa phân công, chưa dùng chung → sale thường không thấy", () => {
  assert.equal(canSeeLead(sale, lead({ assignedToId: null })), false);
  assert.equal(canSeeLead(manager, lead({ assignedToId: null })), true);
});

test("lý do thấy lead (để gắn nhãn 'Dùng chung')", () => {
  assert.equal(leadVisibilityReason(sale, lead()), "owner");
  assert.equal(leadVisibilityReason(otherSale, lead({ sharedWithCenter: true })), "shared");
  assert.equal(leadVisibilityReason(otherSale, lead()), "hidden");
  assert.equal(leadVisibilityReason(manager, lead({ assignedToId: "x" })), "full");
  assert.equal(leadVisibilityReason(saleCs2, lead({ sharedWithCenter: true })), "hidden");
});

test("lọc danh sách theo quyền đọc", () => {
  const rows = [
    lead({ assignedToId: "u-sale" }),
    lead({ assignedToId: "u-other" }),
    lead({ assignedToId: "u-other", sharedWithCenter: true }),
    lead({ assignedToId: "u-other", centerId: CS2, sharedWithCenter: true }),
  ];
  assert.equal(filterVisibleLeads(sale, rows).length, 2);
  assert.equal(filterVisibleLeads(manager, rows).length, 3, "quản lý CS1 thấy 3 lead của CS1");
  assert.equal(filterVisibleLeads(ho, rows).length, 4);
});

test("ai được bật/tắt dùng chung", () => {
  assert.equal(canToggleLeadShare({ ...sale, canUpdateCenter: false }, lead()), true, "chủ lead");
  assert.equal(canToggleLeadShare({ ...otherSale, canUpdateCenter: false }, lead()), false, "sale khác không được");
  assert.equal(canToggleLeadShare({ ...otherSale, canUpdateCenter: true }, lead()), true, "quản lý cơ sở được");
  assert.equal(canToggleLeadShare({ ...saleCs2, canUpdateCenter: true }, lead()), false, "khác cơ sở thì không");
});

test("nhãn đúng bản gốc", () => {
  assert.equal(LEAD_SHARE_LABEL.toggle, "Dùng chung cho CSKH cùng cơ sở");
  assert.equal(leadShareNotice(true), "Đang dùng chung");
  assert.equal(leadShareNotice(false), "Đã tắt dùng chung");
});
