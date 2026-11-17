// GET /api/finance/bank-balances   (GIA P3 step 2, read-only)
// 财务中心 → 银行账户: active accounts with their balance, bank / cash totals,
// and cheques awaiting clearance — same math as FinanceTracker.tsx (see
// ./_read.ts). Account numbers / IBAN / SWIFT are never returned.
// Auth: requireModule('finance'); bank_accounts read as the caller (RLS).
import { requireModule } from '../_lib/auth';
import { json, userRows, loadTransactions, accountBalance, round2, sum, type Account, type Txn } from './_read';

export const config = { runtime: 'edge' };

export function buildBankBalances(accounts: Account[], txns: Txn[]) {
  const list = accounts.map((a) => {
    const own = txns.filter((t) => t.bank_account_id === a.id);
    const last = own.map((t) => String(t.date || '').slice(0, 10)).filter(Boolean).sort().pop() || null;
    return {
      accountName: a.account_name,
      type: a.account_type,
      bankName: a.bank_name || null,
      currency: a.currency || 'AED',
      balance: accountBalance(a, txns),
      lastTransactionDate: last,
    };
  });
  const pending = txns.filter((t) => t.payment_method === 'CHEQUE' && t.cheque_status === 'PENDING');
  const pIn = pending.filter((t) => t.type === 'in');
  const pOut = pending.filter((t) => t.type === 'out');
  return {
    accountCount: list.length,
    bankTotal: round2(list.filter((a) => a.type !== 'Cash').reduce((s, a) => s + a.balance, 0)),
    cashTotal: round2(list.filter((a) => a.type === 'Cash').reduce((s, a) => s + a.balance, 0)),
    accounts: list,
    pendingCheques: {
      incoming: { count: pIn.length, amount: sum(pIn, (t) => t.amount) },
      outgoing: { count: pOut.length, amount: sum(pOut, (t) => t.amount) },
      note: '待清算支票不计入账户余额（与财务中心一致）',
    },
  };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireModule(request, ['finance']);
  if (!auth.ok) return auth.response;
  try {
    const [accounts, txns] = await Promise.all([
      userRows<Account>(auth.ctx, 'bank_accounts',
        'select=id,account_name,account_type,bank_name,currency,opening_balance,is_active&is_active=eq.true&order=account_name.asc'),
      loadTransactions(),
    ]);
    return json({ ok: true, source: 'bank_accounts + transactions (财务中心 · 银行账户)', currency: 'AED', ...buildBankBalances(accounts, txns) });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'read_failed' }, 502);
  }
}
