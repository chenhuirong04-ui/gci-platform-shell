// GET /api/finance/pending-vouchers   (GIA P3 step 2, read-only)
// 财务中心 → 记账 → 凭证录入: vouchers uploaded but not yet confirmed into the
// books (finance_vouchers.status = 'pending' — the Home 异常提醒 count in
// dailyWorkspaceStats). Only the AI-extracted summary fields are returned;
// the voucher file (storage_path) is never selected or opened.
// Auth: requireModule('finance'); finance_vouchers read as the caller (RLS).
import { requireModule } from '../_lib/auth';
import { json, userRows, sum } from './_read';

export const config = { runtime: 'edge' };

export const VOUCHER_LIST_MAX = 20;

interface Voucher {
  status?: string; payment_context?: string; ai_date?: string | null; ai_amount?: number | null;
  ai_counterparty?: string | null; ai_invoice_no?: string | null; ai_description?: string | null;
  purpose_note?: string | null; created_at?: string | null;
}

export function buildPendingVouchers(rows: Voucher[]) {
  const pending = rows.filter((v) => v.status === 'pending')
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))); // oldest first
  const confirmed = rows.filter((v) => v.status === 'confirmed');
  return {
    pendingCount: pending.length,
    pendingAmount: sum(pending, (v) => v.ai_amount),
    confirmedCount: confirmed.length,
    oldestPendingUploadedAt: pending[0]?.created_at?.slice(0, 10) || null,
    vouchers: pending.slice(0, VOUCHER_LIST_MAX).map((v) => ({
      uploadedAt: v.created_at?.slice(0, 10) || null,
      date: v.ai_date || null,
      amount: v.ai_amount ?? null,
      counterparty: v.ai_counterparty || null,
      invoiceNo: v.ai_invoice_no || null,
      description: v.ai_description ? String(v.ai_description).slice(0, 120) : null,
      purpose: v.purpose_note ? String(v.purpose_note).slice(0, 120) : null,
      paymentMethod: v.payment_context || null,
    })),
    note: '金额为 AI 识别值，未经确认，不计入账目；不读取凭证附件内容',
  };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireModule(request, ['finance']);
  if (!auth.ok) return auth.response;
  try {
    const rows = await userRows<Voucher>(auth.ctx, 'finance_vouchers',
      'select=status,payment_context,ai_date,ai_amount,ai_counterparty,ai_invoice_no,ai_description,purpose_note,created_at&order=created_at.asc&limit=1000');
    return json({ ok: true, source: 'finance_vouchers (财务中心 · 凭证录入)', currency: 'AED', ...buildPendingVouchers(rows) });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'read_failed' }, 502);
  }
}
