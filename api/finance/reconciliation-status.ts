// GET /api/finance/reconciliation-status   (GIA P3 step 2, read-only)
// 财务中心 → 记账 → 银行对账: imported bank statements and how many of their
// lines are still pending (bank_statement_lines.status — same 'pending'
// count as the Home 异常提醒 in dailyWorkspaceStats), per bank account.
// Statement files (storage_path) are never selected or opened.
// Auth: requireModule('finance'); RLS tables read as the caller.
import { requireModule } from '../_lib/auth';
import { json, userRows, sum } from './_read';

export const config = { runtime: 'edge' };

interface Acc { id: string; account_name: string }
interface Imp { id: string; bank_account_id: string; file_name?: string; status?: string; created_at?: string }
interface Line { import_id: string; bank_account_id: string; status?: string; amount?: number; direction?: string | null; line_date?: string | null }

function counts(lines: Line[]) {
  const c: Record<string, number> = { pending: 0, confirmed: 0, matched: 0, ignored: 0 };
  for (const l of lines) if (l.status && l.status in c) c[l.status]++;
  const total = lines.length;
  return { total, ...c, processedPct: total ? Math.round(((total - c.pending) / total) * 1000) / 10 : null };
}

export function buildReconciliation(accounts: Acc[], imports: Imp[], lines: Line[]) {
  const nameOf = new Map(accounts.map((a) => [a.id, a.account_name]));
  const accIds = Array.from(new Set([...imports.map((i) => i.bank_account_id), ...lines.map((l) => l.bank_account_id)]));
  const pending = lines.filter((l) => l.status === 'pending');
  return {
    importCount: imports.length,
    importsReviewing: imports.filter((i) => i.status === 'reviewing').length,
    importsCompleted: imports.filter((i) => i.status === 'completed').length,
    lines: counts(lines),
    pendingAmount: { in: sum(pending.filter((l) => l.direction === 'in'), (l) => l.amount), out: sum(pending.filter((l) => l.direction === 'out'), (l) => l.amount) },
    byAccount: accIds.map((id) => {
      const ls = lines.filter((l) => l.bank_account_id === id);
      const im = imports.filter((i) => i.bank_account_id === id)
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      return {
        accountName: nameOf.get(id) || null,
        imports: im.length,
        lastImportAt: im[0]?.created_at?.slice(0, 10) || null,
        lastImportFile: im[0]?.file_name || null,
        lines: counts(ls),
      };
    }),
    statusMeaning: { pending: '待处理', confirmed: '已入账', matched: '已匹配现有流水', ignored: '已忽略' },
  };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
  const auth = await requireModule(request, ['finance']);
  if (!auth.ok) return auth.response;
  try {
    const [accounts, imports, lines] = await Promise.all([
      userRows<Acc>(auth.ctx, 'bank_accounts', 'select=id,account_name'),
      userRows<Imp>(auth.ctx, 'bank_statement_imports', 'select=id,bank_account_id,file_name,status,created_at&order=created_at.desc&limit=500'),
      userRows<Line>(auth.ctx, 'bank_statement_lines', `select=import_id,bank_account_id,status,amount,direction,line_date&limit=5000`),
    ]);
    return json({ ok: true, source: 'bank_statement_imports + bank_statement_lines (财务中心 · 银行对账)', currency: 'AED', ...buildReconciliation(accounts, imports, lines) });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'read_failed' }, 502);
  }
}
