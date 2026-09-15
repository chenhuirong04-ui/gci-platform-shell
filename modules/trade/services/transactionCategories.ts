/**
 * Finance Reporting V1 (2026-09) — transaction category taxonomy + the one
 * classification rule every report/summary uses. No second ledger, no new
 * table: `category`/`subcategory`/`source_module` are just new optional keys
 * inside the existing `transactions.payload` jsonb — see types.ts
 * TransactionRecord.
 *
 * classifyTransaction() is deliberately the single source of truth for
 * "what category does this row count as," used both:
 *   - at write time, to stamp `category` onto a NEW row the frontend writes
 *     (HistoryDashboard's order-payment/consignment-settlement builders,
 *     FinanceTracker's manual entry form), and
 *   - at report-render time, as a fallback for any row that doesn't already
 *     have `category` stamped — which today means every transaction written
 *     before this round, AND every supplier-payment row (those are written
 *     by the create_supplier_payment() Postgres RPC, not the frontend, and
 *     changing that RPC's jsonb_build_object is a separate migration this
 *     round intentionally does not touch — see chat report).
 * Because the fallback is a deterministic rule keyed only on ref_type/type/
 * project_id (never a name match), old rows with no category still bucket
 * correctly without ever being written to or guessed by name.
 *
 * Updated 2026-09-15 (second revision) — added the non-operating taxonomy
 * (INTERNAL_TRANSFER / CAPITAL_INJECTION / LOAN_PROCEEDS) so Finance
 * Overview's KPIs can report real OPERATING cash flow instead of raw
 * type='in'/'out' sums that would otherwise double-count a transfer between
 * two of the company's own accounts as both revenue and expense, or count
 * a shareholder cash injection as sales. No financing module is built here
 * — this is deliberately just the category list + the operating/
 * non-operating split every report reads off of.
 */
import type { TransactionRecord } from '../types';

export type IncomeCategory =
  | 'SALES_REVENUE'
  | 'PROJECT_REVENUE'
  | 'CONSIGNMENT_REVENUE'
  | 'BUSINESS_SERVICES_REVENUE'
  | 'OTHER_INCOME';

export type ExpenseCategory =
  | 'SUPPLIER_PAYMENT'
  | 'PAYROLL'
  | 'ACCOMMODATION'
  | 'TRANSPORT'
  | 'FOOD'
  | 'OFFICE'
  | 'MARKETING'
  | 'GOVERNMENT_FEES'
  | 'BANK_CHARGES'
  | 'REFUND'
  | 'OTHER_EXPENSE';

/**
 * Non-operating — never counted as operating income/expense, excluded from
 * Finance Overview's operating cash flow KPIs and the income/expense-by-
 * category breakdowns. Bank account balances still include them (a real
 * dirham moved), only the "is this the business operating" view excludes
 * them.
 *   INTERNAL_TRANSFER   — money moving between the company's own
 *                         bank_accounts. Not revenue, not expense, not
 *                         operating cash flow — but it DOES move each
 *                         account's own balance, so (per the spec) a
 *                         transfer is recorded as two ordinary manual
 *                         entries (one 'out' on the source account, one
 *                         'in' on the destination account), both tagged
 *                         INTERNAL_TRANSFER — no special transfer wizard
 *                         this round, the existing Income/Expense buttons
 *                         already produce exactly that shape.
 *   CAPITAL_INJECTION   — shareholder/owner puts cash in. type='in' only.
 *                         Increases cash, never counted as sales.
 *   LOAN_PROCEEDS       — a bank loan/borrowing lands. type='in' only.
 *                         Increases cash, never counted as sales.
 */
export type NonOperatingCategory = 'INTERNAL_TRANSFER' | 'CAPITAL_INJECTION' | 'LOAN_PROCEEDS';

export const INCOME_CATEGORIES: { value: IncomeCategory; label: string }[] = [
  { value: 'SALES_REVENUE', label: 'Sales Revenue / 销售收入' },
  { value: 'PROJECT_REVENUE', label: 'Project Revenue / 项目收入' },
  { value: 'CONSIGNMENT_REVENUE', label: 'Consignment Revenue / 代销收入' },
  { value: 'BUSINESS_SERVICES_REVENUE', label: 'Business Services Revenue / 企业服务收入' },
  { value: 'OTHER_INCOME', label: 'Other Income / 其他收入' },
];

/** SUPPLIER_PAYMENT is system-classified only (see classifyTransaction) — not
 * offered in the manual-entry Expense dropdown, same principle as PI's
 * customer dropdown never offering a hand-typed customer. */
export const MANUAL_EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'PAYROLL', label: 'Payroll / 工资' },
  { value: 'ACCOMMODATION', label: 'Accommodation / 住宿' },
  { value: 'TRANSPORT', label: 'Transport / 交通' },
  { value: 'FOOD', label: 'Food / 餐饮' },
  { value: 'OFFICE', label: 'Office / 办公' },
  { value: 'MARKETING', label: 'Marketing / 市场' },
  { value: 'GOVERNMENT_FEES', label: 'Government Fees / 政府费用' },
  { value: 'BANK_CHARGES', label: 'Bank Charges / 银行手续费' },
  { value: 'REFUND', label: 'Refund / 退款' },
  { value: 'OTHER_EXPENSE', label: 'Other Expense / 其他支出' },
];

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'SUPPLIER_PAYMENT', label: 'Supplier Payment / 供应商付款' },
  ...MANUAL_EXPENSE_CATEGORIES,
];

/** type='in' only. */
export const NON_OPERATING_INFLOW_CATEGORIES: { value: NonOperatingCategory; label: string }[] = [
  { value: 'CAPITAL_INJECTION', label: 'Capital Injection / 股东注资' },
  { value: 'LOAN_PROCEEDS', label: 'Loan Proceeds / 贷款到账' },
];

/** Valid for either direction — see the doc comment on NonOperatingCategory. */
export const TRANSFER_CATEGORIES: { value: NonOperatingCategory; label: string }[] = [
  { value: 'INTERNAL_TRANSFER', label: 'Internal Transfer / 内部转账' },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, ...NON_OPERATING_INFLOW_CATEGORIES, ...TRANSFER_CATEGORIES]
    .map(c => [c.value, c.label])
);

export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] || category;
}

/**
 * Deterministic category resolver — never guesses from `note`/`customer`/
 * `supplier` text, only from ref_type/type/project_id (rule table straight
 * from the chat spec):
 *   income:  ORDER_PAYMENT (+project_id)  -> PROJECT_REVENUE
 *            ORDER_PAYMENT (no project_id)-> SALES_REVENUE
 *            CONSIGNMENT_SETTLEMENT       -> CONSIGNMENT_REVENUE
 *            SERVICE_PAYMENT              -> BUSINESS_SERVICES_REVENUE (not
 *                                             produced by any write path yet
 *                                             — Business Services is a
 *                                             future round, forward-compat
 *                                             only)
 *            anything else                -> OTHER_INCOME
 *   expense: SUPPLIER_PAYMENT             -> SUPPLIER_PAYMENT
 *            anything else                -> OTHER_EXPENSE
 *
 * Non-operating categories (INTERNAL_TRANSFER/CAPITAL_INJECTION/
 * LOAN_PROCEEDS) are never auto-derived — nothing in the system writes them
 * automatically, they only ever come from an explicit manual-entry pick
 * (t.category already set), so the fallback branches above never need to
 * produce them.
 */
export function classifyTransaction(t: Pick<TransactionRecord, 'category' | 'type' | 'ref_type' | 'project_id'>): string {
  if (t.category) return t.category;

  if (t.type === 'in') {
    switch (t.ref_type) {
      case 'ORDER_PAYMENT':
        return t.project_id ? 'PROJECT_REVENUE' : 'SALES_REVENUE';
      case 'CONSIGNMENT_SETTLEMENT':
        return 'CONSIGNMENT_REVENUE';
      case 'SERVICE_PAYMENT':
        return 'BUSINESS_SERVICES_REVENUE';
      default:
        return 'OTHER_INCOME';
    }
  }

  if (t.ref_type === 'SUPPLIER_PAYMENT') return 'SUPPLIER_PAYMENT';
  return 'OTHER_EXPENSE';
}

/** True for the 5 operating revenue categories — i.e. counts toward Finance
 * Overview's "本月经营现金流入". Excludes CAPITAL_INJECTION/LOAN_PROCEEDS
 * (real inflow, but not from operations) and INTERNAL_TRANSFER (not income
 * at all). */
export function isOperatingIncomeCategory(category: string): boolean {
  return INCOME_CATEGORIES.some(c => c.value === category);
}

/** True for SUPPLIER_PAYMENT + the 10 manual expense categories — i.e.
 * counts toward Finance Overview's "本月经营现金流出". Excludes
 * INTERNAL_TRANSFER. */
export function isOperatingExpenseCategory(category: string): boolean {
  return EXPENSE_CATEGORIES.some(c => c.value === category);
}

/** CAPITAL_INJECTION / LOAN_PROCEEDS — real cash inflow, real bank balance
 * impact, but deliberately excluded from operating revenue. */
export function isNonOperatingInflowCategory(category: string): boolean {
  return NON_OPERATING_INFLOW_CATEGORIES.some(c => c.value === category);
}

/** INTERNAL_TRANSFER — valid as either a manual Income or Expense entry
 * (whichever leg of the transfer is being recorded); direction validation
 * in the manual-entry form skips the normal income/expense direction check
 * for this one category. */
export function isTransferCategory(category: string): boolean {
  return TRANSFER_CATEGORIES.some(c => c.value === category);
}

/** Manual-entry form direction check: true if `category` requires the
 * Income button (operating income OR a non-operating inflow); does not
 * apply to INTERNAL_TRANSFER, which is bidirectional — callers must check
 * isTransferCategory() first and skip this check entirely when it's true. */
export function isIncomeCategory(category: string): boolean {
  return isOperatingIncomeCategory(category) || isNonOperatingInflowCategory(category);
}

/** Excluded from every operating-cash-flow figure (KPIs, category
 * breakdowns, customer/supplier rankings) — included only in raw bank
 * account balance math, which never filters by category to begin with. */
export function isNonOperatingCategory(category: string): boolean {
  return isNonOperatingInflowCategory(category) || isTransferCategory(category);
}
