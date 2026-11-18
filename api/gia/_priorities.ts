// GIA P5 step 2 — deterministic priority scoring for the daily business overview.
//
// The overview bundle's raw tool results → a ranked list of candidate issues.
// Same data + same day → same list and order, so the "top three" no longer
// depend on the model's sampling. The model still writes the analysis and may
// swap an item, but only with a stated reason (see overviewRules in ask.ts).
//
// Score = (资金影响 0–40 + 逾期程度 0–30 + 业务紧急性 0–20) × 数据可信度 (1 / 0.85 / 0.6).
// Candidates come from every area that has an actual issue; no area is fixed
// into the top three. Pure function, no imports: unit-tested in isolation.
//
// Money rules kept here on purpose:
//   • bank_balances is the BOOK balance of recorded accounts — not the
//     company's total available cash (unrecorded cash, unimported statements);
//     personal accounts are never company funds.
//   • 寄售待结算 is not a formal receivable: only consignment already SOLD and
//     unpaid is money owed now; unsold consignment is stock at the customer.
//   • voided orders / payments are never an issue amount; profit is not scored.

export type Confidence = 'high' | 'medium' | 'low';
const MULT: Record<Confidence, number> = { high: 1, medium: 0.85, low: 0.6 };
const CONF_ZH: Record<Confidence, string> = { high: '高', medium: '中', low: '低' };

export interface PriorityCandidate {
  rank: number;
  key: string;
  area: string;
  title: string;
  involves: string;
  facts: string[];
  score: number;
  breakdown: { money: number; overdue: number; urgency: number; confidence: string; confidenceReason: string };
  basis: string;
  suggestedAction: string;
}

export const PRIORITY_MIN_SCORE = 15;

export function moneyScore(aed: number): number {
  const a = Math.abs(Number(aed) || 0);
  if (a >= 50000) return 40;
  if (a >= 10000) return 32;
  if (a >= 5000) return 26;
  if (a >= 1000) return 18;
  if (a >= 100) return 10;
  if (a > 0) return 5;
  return 0;
}

export function overdueScore(days: number): number {
  const d = Number(days) || 0;
  if (d >= 30) return 30;
  if (d >= 14) return 24;
  if (d >= 7) return 18;
  if (d >= 3) return 12;
  if (d >= 1) return 6;
  return 0;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n: number) => r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function daysBetween(from: string | null | undefined, today: string): number | null {
  if (!from) return null;
  const a = Date.parse(String(from).slice(0, 10));
  const b = Date.parse(today);
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 86400000);
}

type Raw = Record<string, any>;
type Draft = Omit<PriorityCandidate, 'rank' | 'score' | 'basis'> & { money: number; overdue: number; urgency: number; confidence: Confidence; confidenceReason: string };

/** Ranked candidates from the overview tool results (tool id → raw JSON). */
export function rankPriorities(data: Raw, today: string): PriorityCandidate[] {
  const out: Draft[] = [];
  const add = (d: Omit<Draft, 'breakdown'>) => out.push({ ...d, breakdown: undefined as any });
  const ok = (id: string) => data[id] && data[id].ok !== false ? data[id] : null;

  // ── Formal receivables (orders, invoices) ──
  const rs = ok('receivables_summary');
  if (rs) {
    const o = rs.orderReceivables;
    if (o && Number(o.total) > 0) {
      const orders = (o.customers || []).flatMap((c: any) => (c.orders || []).map((x: any) => ({ ...x, customer: c.customerName })));
      const maxDays = Math.max(0, ...orders.filter((x: any) => x.overdue).map((x: any) => daysBetween(x.dueDate, today) || 0));
      const top = (o.customers || []).slice(0, 3).map((c: any) => c.customerName).join('、');
      add({
        key: 'order_receivables', area: '应收', title: o.overdueCount > 0 ? '逾期订单应收催收' : '订单应收跟进',
        involves: top || '—',
        facts: [`订单应收 AED ${fmt(o.total)}，${o.customerCount} 个客户 / ${o.orderCount} 张订单 [receivables_summary]`,
          o.overdueCount > 0 ? `${o.overdueCount} 个客户有逾期订单，最长逾期 ${maxDays} 天 [receivables_summary]` : '无逾期订单 [receivables_summary]'],
        money: moneyScore(o.total), overdue: overdueScore(maxDays), urgency: o.overdueCount > 0 ? 16 : 8,
        confidence: 'high', confidenceReason: '来自有效订单（已排除作废 / 寄售 / 调整单）',
        suggestedAction: '按客户确认付款日期并登记回款计划',
      });
    }
    const inv = rs.invoiceReceivables;
    if (inv && Number(inv.total) > 0) {
      const maxDays = Math.max(0, ...(inv.invoices || []).filter((x: any) => x.overdue).map((x: any) => daysBetween(x.dueDate, today) || 0));
      add({
        key: 'invoice_receivables', area: '应收', title: inv.overdueCount > 0 ? '逾期发票催收' : '已开发票待收款',
        involves: [...new Set((inv.invoices || []).slice(0, 3).map((x: any) => x.customerName))].join('、') || '—',
        facts: [`发票应收 AED ${fmt(inv.total)}，${inv.invoiceCount} 张 [receivables_summary]`,
          inv.overdueCount > 0 ? `${inv.overdueCount} 张逾期，最长 ${maxDays} 天 [receivables_summary]` : '无逾期发票 [receivables_summary]'],
        money: moneyScore(inv.total), overdue: overdueScore(maxDays), urgency: inv.overdueCount > 0 ? 16 : 8,
        confidence: 'medium', confidenceReason: '发票与订单口径可能重叠（receivables_summary 提示）',
        suggestedAction: '核对发票对应订单后按到期日催收',
      });
    }
  }

  // ── Consignment: sold-and-unpaid (owed now) vs unsold stock at the customer ──
  const cs = ok('consignment_summary');
  if (cs && Array.isArray(cs.records) && cs.records.length) {
    const recs = cs.records.filter((r: any) => r.settlementStatus !== 'SETTLED');
    const soldUnpaid = recs.reduce((s: number, r: any) => s + Math.max(0, (Number(r.soldQty) || 0) * (Number(r.unitPrice) || 0) - (Number(r.receivedAmount) || 0)), 0);
    const soldQty = recs.reduce((s: number, r: any) => s + (Number(r.soldQty) || 0), 0);
    const remainingQty = recs.reduce((s: number, r: any) => s + (Number(r.remainingQty) || 0), 0);
    const remainingValue = recs.reduce((s: number, r: any) => s + (Number(r.remainingQty) || 0) * (Number(r.unitPrice) || 0), 0);
    const customers = [...new Set(recs.map((r: any) => r.customerName))].join('、');
    const oldest = recs.map((r: any) => r.createdAt).filter(Boolean).sort()[0];
    const age = daysBetween(oldest, today) || 0;
    const settleTotal = Number(rs?.consignmentReceivables?.total) || 0;
    if (soldUnpaid > 0.005) {
      add({
        key: 'consignment_sold_unpaid', area: '寄售', title: '寄售已售未收款结算',
        involves: customers,
        facts: [`寄售已售 ${soldQty} 件、未收款约 AED ${fmt(soldUnpaid)}（已售数量 × 单价 − 已收，不含税）[consignment_summary]`],
        money: moneyScore(soldUnpaid), overdue: overdueScore(age), urgency: 12,
        confidence: 'medium', confidenceReason: '已售数量以系统登记为准，需客户确认',
        suggestedAction: '向客户确认已售数量并开结算单收款',
      });
    }
    if (remainingQty > 0) {
      add({
        key: 'consignment_unsold', area: '寄售', title: '寄售货品长期未动销 / 待核对',
        involves: customers,
        facts: [`寄售待结算（寄售管理口径，含未售货值，不是正式应收）AED ${fmt(settleTotal)} [receivables_summary]`,
          `已售 ${soldQty} 件，剩余 ${remainingQty} 件在客户处，货值约 AED ${fmt(remainingValue)}（不含税）[consignment_summary]`,
          `最早一批寄售于 ${String(oldest || '').slice(0, 10)}，已 ${age} 天 [consignment_summary]`],
        money: moneyScore(remainingValue), overdue: overdueScore(age), urgency: soldQty === 0 || soldQty / Math.max(1, soldQty + remainingQty) < 0.1 ? 10 : 6,
        confidence: 'medium', confidenceReason: '货值不是已到期的钱；售出后才形成应收',
        suggestedAction: '与客户盘点实际售出与剩余库存，决定结算、补货或收回',
      });
    }
  }

  // ── Bank book balance vs payables ──
  const bb = ok('bank_balances');
  const pd = ok('payables_due');
  const rec = ok('reconciliation_status') || ok('bank_reconciliation_status');
  if (bb) {
    const aed = (bb.totalsByCurrency || []).find((t: any) => t.currency === 'AED');
    const companyAed = Number(aed?.companyTotal) || 0;
    const company = (bb.accounts || []).filter((a: any) => a.scope !== 'personal');
    const lastTxn = company.map((a: any) => a.lastTransactionDate).filter(Boolean).sort().pop() || null;
    const stale = lastTxn ? daysBetween(lastTxn, today) || 0 : null;
    const imports = rec ? Number(rec.importCount) || 0 : null;
    const balances = (bb.totalsByCurrency || []).map((t: any) => `${t.currency} ${fmt(t.companyTotal)}`).join(' / ');
    if (pd) {
      const dueAed = (Number(pd.overdue?.amount) || 0) + (Number(pd.dueIn7Days?.amount) || 0);
      if (dueAed > 0) {
        const gap = dueAed - companyAed;
        add({
          key: 'payables_cash', area: '银行与应付', title: gap > 0 ? '应付到期超过公司账面余额' : '应付到期付款安排',
          involves: (pd.payables || []).slice(0, 3).map((p: any) => p.supplierName || p.supplier).filter(Boolean).join('、') || '供应商',
          facts: [`逾期应付 AED ${fmt(pd.overdue?.amount || 0)}（${pd.overdue?.count || 0} 笔），7 天内到期 AED ${fmt(pd.dueIn7Days?.amount || 0)} [payables_due]`,
            `公司账户账面余额 AED ${fmt(companyAed)} [bank_balances]`],
          money: moneyScore(Math.max(dueAed, gap)), overdue: Number(pd.overdue?.count) > 0 ? 18 : 3, urgency: gap > 0 ? 18 : 12,
          confidence: stale !== null && stale > 30 ? 'medium' : 'high', confidenceReason: stale !== null && stale > 30 ? '银行流水已久未更新，账面余额可能不是实际可用资金' : '应付与账户余额均来自财务中心',
          suggestedAction: gap > 0 ? '确认实际可用资金，排定付款顺序或与供应商协商' : '按到期日安排付款',
        });
      }
    }
    if ((stale !== null && stale > 30) || imports === 0) {
      add({
        key: 'bank_book_unverified', area: '银行与资金', title: '银行账面余额无法代表实际可用资金',
        involves: company.map((a: any) => a.accountName).join('、'),
        facts: [`公司账户账面余额 ${balances}（按币种，不含个人账户）[bank_balances]`,
          lastTxn ? `最近一笔入账流水 ${lastTxn}，已 ${stale} 天未更新 [bank_balances]` : '公司账户无入账流水日期 [bank_balances]',
          imports === null ? '未读取对账状态' : `已导入银行对账单 ${imports} 份 [bank_reconciliation_status]`],
        money: 0, overdue: stale !== null && stale > 60 ? 12 : 6, urgency: 10,
        confidence: 'high', confidenceReason: '这是数据缺口本身：没有新流水 / 对账单，无法判断真实现金',
        suggestedAction: '导入最新银行对账单并补录流水，确认公司实际可用资金',
      });
    }
  }

  // ── Pending vouchers ──
  const pv = ok('pending_vouchers');
  if (pv && Number(pv.pendingCount) > 0) {
    const age = daysBetween(pv.oldestPendingUploadedAt, today) || 0;
    add({
      key: 'pending_vouchers', area: '凭证', title: '待处理凭证入账',
      involves: `${pv.pendingCount} 张凭证`,
      facts: [`待处理凭证 ${pv.pendingCount} 张，AI 识别金额 AED ${fmt(pv.pendingAmount || 0)}，最早上传 ${String(pv.oldestPendingUploadedAt || '').slice(0, 10)} [pending_vouchers]`],
      money: moneyScore(pv.pendingAmount), overdue: Math.min(12, overdueScore(age)), urgency: 6,
      confidence: 'medium', confidenceReason: '金额为 AI 识别值，未经确认',
      suggestedAction: '财务确认凭证并入账',
    });
  }

  // ── CRM follow-ups ──
  const fu = ok('crm_followups');
  if (fu && Array.isArray(fu.items) && fu.items.length) {
    const urgent = fu.items.filter((i: any) => i.urgent);
    const maxDays = Math.max(0, ...fu.items.map((i: any) => Number(i.overdueDays) || 0));
    const noOwner = fu.items.filter((i: any) => !i.owner).length;
    add({
      key: 'crm_followups', area: '客户跟进', title: maxDays > 0 ? '客户跟进逾期' : '今日客户跟进',
      involves: fu.items.slice(0, 5).map((i: any) => i.customer).join('、'),
      facts: [`待跟进 ${fu.items.length} 个（今日 ${fu.counts?.dueToday ?? 0}，逾期 ${fu.counts?.overdue ?? 0}），紧急 ${urgent.length} 个，最长逾期 ${maxDays} 天 [crm_followups]`,
        noOwner ? `${noOwner} 个未填写负责人 [crm_followups]` : '均已有负责人 [crm_followups]'],
      money: 0, overdue: overdueScore(maxDays), urgency: urgent.length ? 14 : 6,
      confidence: 'high', confidenceReason: 'CRM 正式客户记录（首页工作台同口径）',
      suggestedAction: noOwner ? '先指定负责人，今天内完成跟进并更新下次跟进日期' : '负责人今天内完成跟进并更新下次跟进日期',
    });
  }

  // ── Quotations waiting for a reply ──
  const db = ok('daily_brief');
  const quotes = db?.quotations?.allPending || [];
  if (quotes.length) {
    const amount = quotes.reduce((s: number, q: any) => s + (Number(q.grandTotal) || 0), 0);
    const maxWait = Math.max(0, ...quotes.map((q: any) => Number(q.daysAgo) || 0));
    const overdueN = Number(db.quotations.overdueCount) || 0;
    const unnamed = quotes.filter((q: any) => !q.customerName || q.customerName === '—').length;
    add({
      key: 'quotations_waiting', area: '报价', title: overdueN ? '报价超期未回复' : '报价等待客户回复',
      involves: quotes.slice(0, 3).map((q: any) => `${q.quoteNo}${q.customerName && q.customerName !== '—' ? `（${q.customerName}）` : ''}`).join('、'),
      facts: [`${quotes.length} 张报价待回复，合计 AED ${fmt(amount)}，最长已发出 ${maxWait} 天，超期 ${overdueN} 张 [daily_brief]`]
        .concat(unnamed ? [`${unnamed} 张报价未填写客户名称 [daily_brief]`] : []),
      money: moneyScore(amount), overdue: maxWait >= 14 ? 18 : maxWait >= 7 ? 12 : maxWait >= 3 ? 6 : 0, urgency: overdueN ? 10 : 6,
      confidence: unnamed ? 'medium' : 'high', confidenceReason: unnamed ? '部分报价缺客户名称' : '报价记录完整',
      suggestedAction: '销售联系客户确认报价反馈',
    });
  }

  // ── Warehouse stock ──
  const inv = ok('inventory_table_alerts');
  if (inv && (Number(inv.outOfStockCount) || 0) + (Number(inv.lowStockCount) || 0) > 0) {
    const items = inv.alertItems || [];
    const lastUpd = items.map((i: any) => i.updatedAt).filter(Boolean).sort().pop();
    const stale = daysBetween(lastUpd, today);
    const selling = (Number(db?.sales?.monthlyCount) || 0) > 0;
    add({
      key: 'stock_shortage', area: '仓库库存', title: '仓库缺货 / 低库存',
      involves: items.slice(0, 3).map((i: any) => i.productName).join('、'),
      facts: [`缺货 ${inv.outOfStockCount || 0} 项，低库存 ${inv.lowStockCount || 0} 项（共 ${inv.totalRows} 项）[inventory_table_alerts]`,
        lastUpd ? `库存表最近更新 ${String(lastUpd).slice(0, 10)} [inventory_table_alerts]` : '库存表无更新时间',
        `本月销售 ${db?.sales?.monthlyCount ?? '无数据'} 单 [daily_brief]`],
      money: 0, overdue: 0, urgency: selling ? 10 : 5,
      confidence: stale !== null && stale > 30 ? 'low' : 'high', confidenceReason: stale !== null && stale > 30 ? `库存表已 ${stale} 天未更新` : '库存表近期有更新',
      suggestedAction: selling ? '按在售需求补货或暂停相关报价' : '先盘点确认库存表是否准确，再决定补货',
    });
  }

  // ── Internal tasks ──
  const tk = ok('internal_tasks');
  if (tk?.counts) {
    const tasks = tk.tasks || [];
    const od = tasks.filter((t: any) => t.overdue);
    if (od.length) {
      const maxDays = Math.max(0, ...od.map((t: any) => daysBetween(t.dueAt, today) || 0));
      const p1 = od.some((t: any) => /P1|高|urgent/i.test(String(t.priority || '')));
      add({
        key: 'tasks_overdue', area: '内部待办', title: '内部事项逾期',
        involves: od.slice(0, 3).map((t: any) => t.title).join('、'),
        facts: [`逾期内部事项 ${od.length} 项，最长逾期 ${maxDays} 天 [internal_tasks]`],
        money: 0, overdue: overdueScore(maxDays), urgency: p1 ? 14 : 10,
        confidence: 'high', confidenceReason: '内部事项记录',
        suggestedAction: '负责人更新进度或调整到期日',
      });
    }
    const noDue = Number(tk.counts.activeWithoutDueDate) || 0;
    const noOwner = Number(tk.counts.activeWithoutOwner) || 0;
    if (noDue + noOwner > 0) {
      add({
        key: 'tasks_incomplete', area: '内部待办', title: '进行中事项缺到期日 / 负责人',
        involves: tasks.filter((t: any) => !t.dueAt || !t.owner).slice(0, 3).map((t: any) => t.title).join('、'),
        facts: [`进行中事项缺到期日 ${noDue} 项、缺负责人 ${noOwner} 项 [internal_tasks]`],
        money: 0, overdue: 0, urgency: 3,
        confidence: 'high', confidenceReason: '内部事项记录',
        suggestedAction: '补填到期日和负责人',
      });
    }
  }

  // ── Licences ──
  const docs = ok('company_documents');
  if (docs?.licences) {
    for (const name of docs.licences.expired || []) {
      add({
        key: `licence_expired:${name}`, area: '证照', title: '有效证照已过期',
        involves: String(name), facts: [`${name} 已过期 [company_documents]`],
        money: 0, overdue: 30, urgency: 20, confidence: 'high', confidenceReason: '公司文件到期日',
        suggestedAction: '立即办理续期并上传新证照',
      });
    }
    for (const s of docs.licences.expiringIn90Days || []) {
      const m = String(s).match(/（(\d{4}-\d{2}-\d{2})）/);
      const left = m ? -(daysBetween(m[1], today) || 0) : 90;
      add({
        key: `licence_expiring:${s}`, area: '证照', title: '证照即将到期',
        involves: String(s), facts: [`${s} 还有 ${left} 天到期 [company_documents]`],
        money: 0, overdue: 0, urgency: left <= 30 ? 16 : left <= 60 ? 12 : 8, confidence: 'high', confidenceReason: '公司文件到期日',
        suggestedAction: '准备续期材料并预约办理',
      });
    }
    const old = docs.licences.renewedOldVersionsStillReminding || [];
    if (old.length) {
      add({
        key: 'licence_old_reminder', area: '证照', title: '已续期旧版证照仍在提醒',
        involves: old.join('、'), facts: [`${old.length} 份已续期的旧版本仍开着到期提醒（不是证照过期）[company_documents]`],
        money: 0, overdue: 0, urgency: 2, confidence: 'high', confidenceReason: '同证号新版本已上传',
        suggestedAction: '在公司文件中关闭旧版本的到期提醒',
      });
    }
  }

  return out
    .map((d) => {
      const raw = d.money + d.overdue + d.urgency;
      const score = Math.round(raw * MULT[d.confidence]);
      const { money, overdue, urgency, confidence, confidenceReason, ...rest } = d;
      return {
        ...rest,
        score,
        breakdown: { money, overdue, urgency, confidence: CONF_ZH[confidence], confidenceReason },
        basis: `资金影响 ${money}/40 · 逾期 ${overdue}/30 · 紧急性 ${urgency}/20 · 可信度 ${CONF_ZH[confidence]}（×${MULT[confidence]}）= ${score}`,
      };
    })
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .map((c, i) => ({ ...c, rank: i + 1 }));
}
