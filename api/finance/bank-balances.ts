// GET /api/finance/bank-balances   (GIA P3 step 2, read-only)
// 财务中心 → 银行账户: active accounts with their balance (same math as
// FinanceTracker.tsx, see ./_read.ts), totals PER CURRENCY and per scope,
// and cheques awaiting clearance. Account numbers / IBAN / SWIFT are never
// returned.
// Totals never add different currencies together and never convert with an
// exchange rate. Personal accounts (account_type 'Personal') are reported as
// their own scope and are NOT company funds; Cash accounts are their own
// scope too. Each account keeps its own balance and currency.
// Auth: requireModule('finance'); bank_accounts read as the caller (RLS).
import { requireModule } from '../_lib/auth';
import { json, userRows, loadTransactions, accountBalance, round2, sum, type Account, type Txn } from './_read';

export const config = { runtime: 'edge' };

export type FundScope = 'company_bank' | 'company_cash' | 'personal';
const SCOPE_ZH: Record<FundScope, string> = { company_bank: '公司银行账户', company_cash: '公司现金', personal: '个人账户（非公司资金）' };

export function fundScope(type: string): FundScope {
  if (type === 'Personal') return 'personal';
  if (type === 'Cash') return 'company_cash';
  return 'company_bank'; // Corporate / Other
}

export function buildBankBalances(accounts: Account[], txns: Txn[]) {
  const list = accounts.map((a) => {
    const own = txns.filter((t) => t.bank_account_id === a.id);
    const last = own.map((t) => String(t.date || '').slice(0, 10)).filter(Boolean).sort().pop() || null;
    const scope = fundScope(a.account_type);
    return {
      accountName: a.account_name,
      type: a.account_type,
      scope,
      scopeZh: SCOPE_ZH[scope],
      bankName: a.bank_name || null,
      currency: (a.currency || 'AED').toUpperCase(),
      balance: accountBalance(a, txns),
      lastTransactionDate: last,
    };
  });
  // One row per (currency, scope); amounts are only ever summed within one currency.
  const currencies = Array.from(new Set(list.map((a) => a.currency))).sort((x, y) => (x === 'AED' ? -1 : y === 'AED' ? 1 : x.localeCompare(y)));
  const totalsByCurrency = currencies.map((currency) => {
    const inCur = list.filter((a) => a.currency === currency);
    const tot = (scope: FundScope) => {
      const rows = inCur.filter((a) => a.scope === scope);
      return rows.length ? { accounts: rows.length, balance: round2(rows.reduce((s, a) => s + a.balance, 0)) } : null;
    };
    const bank = tot('company_bank');
    const cash = tot('company_cash');
    return {
      currency,
      companyBank: bank,
      companyCash: cash,
      companyTotal: bank || cash ? round2((bank?.balance || 0) + (cash?.balance || 0)) : null,
      personal: tot('personal'),
    };
  });
  const pending = txns.filter((t) => t.payment_method === 'CHEQUE' && t.cheque_status === 'PENDING');
  const pIn = pending.filter((t) => t.type === 'in');
  const pOut = pending.filter((t) => t.type === 'out');
  return {
    accountCount: list.length,
    totalsByCurrency,
    totalsNote: '按币种分别汇总，不同币种不相加、不做汇率换算；个人账户单独列示，不计入公司资金',
    accounts: list,
    pendingCheques: {
      incoming: { count: pIn.length, amount: sum(pIn, (t) => t.amount) },
      outgoing: { count: pOut.length, amount: sum(pOut, (t) => t.amount) },
      note: '待清算支票不计入账户余额（与财务中心一致）；金额为交易记录原值，未换算币种',
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
    return json({ ok: true, source: 'bank_accounts + transactions (财务中心 · 银行账户)', ...buildBankBalances(accounts, txns) });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'read_failed' }, 502);
  }
}
