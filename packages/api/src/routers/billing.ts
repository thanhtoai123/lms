import { z } from "zod";
import { INVOICE_STATUSES, TAX_RATES } from "@satarobo/core";
import { router, protectedProcedure } from "../trpc";
import * as E from "../services/einvoice";
import * as Q from "../services/qrAttendance";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const s = (n: number) => z.string().max(n);
const line = z.object({ name: s(300), unit: s(20), quantity: z.number().int().min(1).max(1000), unitPrice: z.number().int(), amount: z.number().int().min(-10_000_000_000).max(10_000_000_000), taxRate: z.enum(TAX_RATES) });

export const invoiceRouter = router({
  settings: protectedProcedure.query(({ ctx }) => E.getEInvoiceSettings(ctx)),
  saveSettings: protectedProcedure
    .input(z.object({
      enabled: z.boolean(), provider: z.enum(["sandbox", "http"]), templateCode: s(2), serial: s(10), sellerName: s(300), sellerTaxCode: s(20), sellerAddress: s(500),
      courseRate: z.enum(TAX_RATES), goodsRate: z.enum(TAX_RATES), autoDraft: z.boolean(), autoIssue: z.boolean(), startDate: isoDate.nullable(), lookupUrl: s(200),
    }))
    .mutation(({ ctx, input }) => E.saveEInvoiceSettings(ctx, input)),
  list: protectedProcedure.input(z.object({ status: z.enum(INVOICE_STATUSES).optional(), q: s(100).optional(), from: isoDate.optional(), to: isoDate.optional(), centerId: uuid.optional() }).default({})).query(({ ctx, input }) => E.listInvoices(ctx, input)),
  get: protectedProcedure.input(z.object({ id: uuid })).query(({ ctx, input }) => E.getInvoice(ctx, input.id)),
  createDraft: protectedProcedure.input(z.object({ paymentId: uuid })).mutation(({ ctx, input }) => E.createDraft(ctx, input)),
  updateDraft: protectedProcedure
    .input(z.object({ id: uuid, buyerName: s(200).nullish(), buyerCompany: s(300).nullish(), buyerTaxCode: s(20).nullish(), buyerAddress: s(500).nullish(), buyerEmail: s(200).nullish(), noInvoiceRequested: z.boolean().optional() }))
    .mutation(({ ctx, input }) => E.updateDraft(ctx, input)),
  issue: protectedProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => E.issueInvoice(ctx, input)),
  cancelDraft: protectedProcedure.input(z.object({ id: uuid, reason: s(500) })).mutation(({ ctx, input }) => E.cancelDraft(ctx, input)),
  correct: protectedProcedure
    .input(z.object({
      originalId: uuid, kind: z.enum(["adjustment", "replacement"]), reason: s(1000), agreementNote: s(500), lines: z.array(line).min(1).max(50), refundId: uuid.nullish(),
      buyer: z.object({ name: s(200).nullish(), company: s(300).nullish(), taxCode: s(20).nullish(), address: s(500).nullish(), email: s(200).nullish() }).nullish(),
    }))
    .mutation(({ ctx, input }) => E.createCorrection(ctx, input)),
  report: protectedProcedure.input(z.object({ year: z.number().int().min(2020).max(2100) })).query(({ ctx, input }) => E.invoiceReport(ctx, input)),
});

export const cardRouter = router({
  scan: protectedProcedure.input(z.object({ sessionId: uuid, code: s(200) })).mutation(({ ctx, input }) => Q.scanCard(ctx, input)),
  print: protectedProcedure.input(z.object({ classId: uuid.optional(), studentIds: z.array(uuid).max(300).optional() })).query(({ ctx, input }) => Q.cardsForPrint(ctx, input)),
  reissue: protectedProcedure.input(z.object({ studentId: uuid, reason: s(300) })).mutation(({ ctx, input }) => Q.reissueCard(ctx, input)),
});
