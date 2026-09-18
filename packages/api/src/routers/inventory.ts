import { z } from "zod";
import { ITEM_TYPES, MOVEMENT_TYPES, RENTAL_STATUSES, AUDIT_STATUSES, COIN_REASONS, COIN_RULE_CODES, REDEMPTION_STATUSES, type ItemType, type MovementType, type CoinReason } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as I from "../services/inventory";
import * as R from "../services/rewards";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const s = (n: number) => z.string().max(n);
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const itemType = z.enum(ITEM_TYPES as unknown as [ItemType, ...ItemType[]]);
const page = int(1, 10_000).optional();

export const inventoryRouter = router({
  items: protectedProcedure.input(z.object({ type: itemType.optional(), q: s(100).optional(), includeInactive: z.boolean().optional() }).default({})).query(({ ctx, input }) => I.listItems(ctx, input)),
  upsertItem: protectedProcedure
    .input(z.object({
      id: uuid.optional(), sku: s(40), name: s(150), type: itemType, unit: s(20), courseId: uuid.nullish(),
      salePrice: int(0, 1_000_000_000).nullish(), rentPrice: int(0, 100_000_000).nullish(), deposit: int(0, 100_000_000).nullish(),
      reorderLevel: int(0, 100_000).optional(), description: s(500).nullish(), isActive: z.boolean().optional(),
    }))
    .mutation(({ ctx, input }) => I.upsertItem(ctx, input)),
  setBom: protectedProcedure.input(z.object({ kitId: uuid, lines: z.array(z.object({ componentId: uuid, qty: int(1, 1000) })).max(100) })).mutation(({ ctx, input }) => I.setBom(ctx, input)),
  stock: protectedProcedure.input(z.object({ centerId: uuid.optional(), type: itemType.optional(), tone: z.enum(["out", "low", "ok"]).optional(), q: s(100).optional() }).default({})).query(({ ctx, input }) => I.stockOverview(ctx, input)),
  movements: protectedProcedure
    .input(z.object({ centerId: uuid.optional(), itemId: uuid.optional(), type: z.enum(MOVEMENT_TYPES as unknown as [MovementType, ...MovementType[]]).optional(), studentId: uuid.optional(), from: isoDate.optional(), to: isoDate.optional(), page }).default({}))
    .query(({ ctx, input }) => I.listMovements(ctx, input)),
  createMovement: protectedProcedure
    .input(z.object({ centerId: uuid, itemId: uuid, type: z.enum(["receipt", "issue", "return", "damage"]), qty: int(1, 100_000), unitCost: int(0, 1_000_000_000).nullish(), studentId: uuid.nullish(), classId: uuid.nullish(), supplier: s(150).nullish(), note: s(500).nullish() }))
    .mutation(({ ctx, input }) => I.createMovement(ctx, input)),
  transfer: protectedProcedure.input(z.object({ fromCenterId: uuid, toCenterId: uuid, itemId: uuid, qty: int(1, 100_000), note: s(500).nullish() })).mutation(({ ctx, input }) => I.transferStock(ctx, input)),
  assemble: protectedProcedure.input(z.object({ centerId: uuid, kitId: uuid, qty: int(1, 1000), note: s(500).nullish() })).mutation(({ ctx, input }) => I.assembleKit(ctx, input)),
  sell: protectedProcedure
    .input(z.object({
      centerId: uuid, studentId: uuid.nullish(), customer: z.object({ name: s(120), phone: s(20), email: s(200).nullish() }).nullish(),
      lines: z.array(z.object({ itemId: uuid, qty: int(1, 1000) })).min(1).max(20), paymentMethodId: uuid, note: s(500).nullish(),
    }))
    .mutation(({ ctx, input }) => I.sellProducts(ctx, input)),
  rentals: protectedProcedure.input(z.object({ centerId: uuid.optional(), status: z.enum(RENTAL_STATUSES).optional(), overdue: z.boolean().optional(), studentId: uuid.optional() }).default({})).query(({ ctx, input }) => I.listRentals(ctx, input)),
  rentOut: protectedProcedure.input(z.object({ centerId: uuid, itemId: uuid, studentId: uuid, qty: int(1, 10), days: int(1, 365), paymentMethodId: uuid.nullish(), note: s(500).nullish() })).mutation(({ ctx, input }) => I.rentOut(ctx, input)),
  closeRental: protectedProcedure.input(z.object({ id: uuid, outcome: z.enum(["ok", "damaged", "lost"]), damageCharge: int(0, 100_000_000).optional(), note: s(500).nullish() })).mutation(({ ctx, input }) => I.closeRental(ctx, input)),
  audits: protectedProcedure.input(z.object({ centerId: uuid.optional(), status: z.enum(AUDIT_STATUSES).optional() }).default({})).query(({ ctx, input }) => I.listAudits(ctx, input)),
  audit: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => I.getAudit(ctx, input.id)),
  createAudit: protectedProcedure.input(z.object({ centerId: uuid, type: itemType.nullish(), note: s(500).nullish() })).mutation(({ ctx, input }) => I.createAudit(ctx, input)),
  saveAuditCounts: protectedProcedure
    .input(z.object({ id: uuid, lines: z.array(z.object({ itemId: uuid, countedQty: int(0, 1_000_000).nullable(), note: s(300).nullish() })).max(2000) }))
    .mutation(({ ctx, input }) => I.saveAuditCounts(ctx, input)),
  auditAction: protectedProcedure.input(z.object({ id: uuid, action: z.enum(["submit", "approve", "reopen", "cancel"]), note: s(500).nullish() })).mutation(({ ctx, input }) => I.auditAction(ctx, input)),
});

const coinReason = z.enum(COIN_REASONS as unknown as [CoinReason, ...CoinReason[]]);

export const coinRouter = router({
  leaderboard: protectedProcedure.input(z.object({ centerId: uuid.optional(), classId: uuid.optional(), q: s(100).optional(), page }).default({})).query(({ ctx, input }) => R.leaderboard(ctx, input)),
  student: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => R.studentCoins(ctx, input.id)),
  ledger: protectedProcedure.input(z.object({ centerId: uuid.optional(), reason: coinReason.optional(), mine: z.boolean().optional(), page }).default({})).query(({ ctx, input }) => R.coinLedger(ctx, input)),
  award: protectedProcedure
    .input(z.object({ studentIds: z.array(uuid).min(1).max(60), amount: int(1, 100_000), reason: coinReason, note: s(300).nullish(), classId: uuid.nullish(), sessionId: uuid.nullish() }))
    .mutation(({ ctx, input }) => R.awardCoins(ctx, input)),
  awardSession: protectedProcedure.input(z.object({ sessionId: uuid, amount: int(1, 100_000).nullish() })).mutation(({ ctx, input }) => R.awardSession(ctx, input)),
  rules: protectedProcedure.query(({ ctx }) => R.listCoinRules(ctx)),
  upsertRule: protectedProcedure
    .input(z.object({ code: z.enum(COIN_RULE_CODES), description: s(300), coins: int(1, 100_000), condition: s(500).nullish(), isActive: z.boolean() }))
    .mutation(({ ctx, input }) => R.upsertCoinRule(ctx, input)),
  adjust: protectedProcedure.input(z.object({ studentId: uuid, amount: int(-100_000, 100_000), note: s(300) })).mutation(({ ctx, input }) => R.adjustCoins(ctx, input)),
  revoke: protectedProcedure.input(z.object({ txId: uuid, note: s(300) })).mutation(({ ctx, input }) => R.revokeCoins(ctx, input)),
  rewards: protectedProcedure.input(z.object({ includeInactive: z.boolean().optional() }).default({})).query(({ ctx, input }) => R.listRewards(ctx, input)),
  upsertReward: protectedProcedure
    .input(z.object({ id: uuid.optional(), name: s(120), description: s(300).nullish(), cost: int(1, 100_000), inventoryItemId: uuid.nullish(), isActive: z.boolean(), sortOrder: int(0, 999).optional() }))
    .mutation(({ ctx, input }) => R.upsertReward(ctx, input)),
  redemptions: protectedProcedure.input(z.object({ status: z.enum(REDEMPTION_STATUSES).optional(), centerId: uuid.optional() }).default({})).query(({ ctx, input }) => R.listRedemptions(ctx, input)),
  redeem: protectedProcedure.input(z.object({ studentId: uuid, rewardId: uuid, note: s(300).nullish() })).mutation(({ ctx, input }) => R.requestRedemption(ctx, input)),
  decideRedemption: protectedProcedure.input(z.object({ id: uuid, action: z.enum(["approve", "reject", "deliver", "cancel"]), note: s(300).nullish() })).mutation(({ ctx, input }) => R.decideRedemption(ctx, input)),
});
