// GCI APP built-in AI agent chat (MVP) — talks to /api/assistant/agent.
// The agent can look things up across CRM, inventory, catalog and prices in
// several steps, and can only PROPOSE a quotation draft. The draft is saved
// only when the user clicks Confirm here.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';

type Turn = { role: 'user' | 'assistant'; content: string };
type Step = { tool: string; input: string; ok: boolean };
type ProposalItem = { item_name: string; description?: string; qty: number; unit: string; supplier_cost: number; selling_price: number };
type Proposal = {
  token: string; customer_name?: string; customer_id: string; project_name?: string; currency: string; vat_rate: number;
  items: ProposalItem[]; subtotal: number; vat: number; total: number; stock_verification_required?: boolean;
};
type Entry = Turn & { steps?: Step[]; proposal?: Proposal | null; status?: 'confirmed' | 'cancelled' | 'error'; note?: string };

const GOLD = colors.goldBase;
const TEXT = colors.textPrimary;
const MUTED = colors.textSecondary;
const CARD = colors.bgSurface;
const RAISED = colors.bgRaised;
const BORDER = 'rgba(240,234,210,0.12)';

const TOOL_LABEL: Record<string, [string, string]> = {
  search_customers: ['查找客户', 'Find customer'],
  check_inventory: ['查客户寄售剩余', 'Consignment remaining'],
  search_products: ['匹配商品', 'Match products'],
  get_product_prices: ['查价格', 'Look up prices'],
  propose_quotation_draft: ['生成报价草稿', 'Draft quotation'],
};

const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');

export function AgentChat({ initialQuestion = '' }: { initialQuestion?: string }) {
  const { lang } = useI18n();
  const en = lang === 'en';
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [entries, busy]);
  // A question handed over from the Home assistant box (/ai?tab=agent&agent_q=…) is asked once.
  const askedInitial = useRef(false);
  useEffect(() => {
    if (askedInitial.current || !initialQuestion.trim()) return;
    askedInitial.current = true;
    send(initialQuestion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  const examples = en
    ? ['How much stock do we have for LED panel 600x600?', 'Check stock for office chairs, match products and draft a quote for customer ABC: 20 pcs']
    : ['查一下 LED 面板 600x600 还有多少库存', '查办公椅库存，匹配商品，给客户 ABC 做一份 20 把的报价草稿'];

  async function send(message: string) {
    const q = message.trim();
    if (!q || busy) return;
    const history: Turn[] = [...entries.map(({ role, content }) => ({ role, content })), { role: 'user', content: q }];
    setEntries((e) => [...e, { role: 'user', content: q }]);
    setText('');
    setBusy(true);
    try {
      const res = await fetch('/api/assistant/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEntries((e) => [...e, { role: 'assistant', content: data.reply || (en ? '(no reply)' : '（无回复）'), steps: data.steps, proposal: data.proposal }]);
    } catch (err: any) {
      setEntries((e) => [...e, { role: 'assistant', content: (en ? 'Something went wrong: ' : '出错了：') + String(err?.message || err), status: 'error' }]);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(index: number, proposal: Proposal) {
    setConfirming(index);
    try {
      const res = await fetch('/api/assistant/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `agent-${crypto.randomUUID()}` },
        body: JSON.stringify({ confirm: { token: proposal.token } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || data.result?.error || `HTTP ${res.status}`);
      const r = data.result || {};
      if (r.ok === false) throw new Error(r.error || 'save_failed');
      // Only a real quotation number is shown — never an internal id.
      const no = r.result?.quote_no || r.quote_no || r.result?.quote_number || r.quote_number || '';
      const ref = typeof no === 'string' ? no : '';
      setEntries((e) => e.map((x, i) => (i === index ? { ...x, status: 'confirmed', note: ref ? String(ref) : '' } : x)));
    } catch (err: any) {
      setEntries((e) => e.map((x, i) => (i === index ? { ...x, status: 'error', note: String(err?.message || err) } : x)));
    } finally {
      setConfirming(null);
    }
  }

  const cancel = (index: number) => setEntries((e) => e.map((x, i) => (i === index ? { ...x, status: 'cancelled' } : x)));

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{en ? 'GCI Business Agent' : 'GCI 业务智能体'}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 999, padding: '1px 8px' }}>Beta</span>
      </div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 12px', lineHeight: 1.6 }}>
        {en
          ? 'Ask in plain language. It can look up customers, stock, products and prices in several steps and propose a quotation draft — nothing is saved until you confirm.'
          : '用自然语言提问。它可以分多步查询客户、库存、商品和价格，并提出报价草稿——在你确认之前不会保存任何内容。'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 520, overflowY: 'auto', paddingRight: 2 }}>
        {entries.length === 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {examples.map((ex) => (
              <button key={ex} type="button" onClick={() => send(ex)} style={{ textAlign: 'left', fontSize: 13, color: TEXT, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 12px', cursor: 'pointer', maxWidth: '100%' }}>
                {ex}
              </button>
            ))}
          </div>
        )}

        {entries.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'stretch', maxWidth: m.role === 'user' ? '85%' : '100%' }}>
            {m.steps && m.steps.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {m.steps.map((s, k) => (
                  <span key={k} title={s.input} style={{ fontSize: 11.5, color: s.ok ? MUTED : '#F08A72', border: `1px solid ${BORDER}`, borderRadius: 999, padding: '2px 8px' }}>
                    {k + 1}. {(TOOL_LABEL[s.tool] || [s.tool, s.tool])[en ? 1 : 0]}{s.ok ? '' : en ? ' — failed' : ' — 失败'}
                  </span>
                ))}
              </div>
            )}
            <div style={{
              whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.65, color: m.status === 'error' && !m.proposal ? '#F08A72' : TEXT,
              background: m.role === 'user' ? RAISED : 'transparent', border: m.role === 'user' ? `1px solid ${BORDER}` : 'none',
              borderRadius: 12, padding: m.role === 'user' ? '8px 12px' : '2px 0', overflowWrap: 'anywhere',
            }}>
              {m.content}
            </div>

            {m.proposal && (
              <div style={{ marginTop: 10, border: `1px solid rgba(203,168,92,0.4)`, borderRadius: 12, padding: 12, background: 'rgba(203,168,92,0.06)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 6 }}>
                  {en ? 'Quotation draft preview — not saved yet' : '报价草稿预览，尚未保存'}
                </div>
                <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>
                  {(en ? 'Customer: ' : '客户：') + (m.proposal.customer_name || m.proposal.customer_id)}
                  {m.proposal.project_name ? ` · ${m.proposal.project_name}` : ''} · {m.proposal.currency} · VAT {m.proposal.vat_rate}%
                </div>
                {m.proposal.stock_verification_required && (
                  <div style={{ fontSize: 12.5, color: '#E8C46A', background: 'rgba(217,180,90,0.12)', border: '1px solid rgba(217,180,90,0.35)', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>
                    {en
                      ? 'Stock to be verified manually — quantities are not confirmed against sellable stock (customer consignment remaining is not sellable stock).'
                      : '库存待人工核实——报价数量未经可销售库存确认（客户寄售剩余不等于可销售库存）。'}
                  </div>
                )}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: TEXT, minWidth: 420 }}>
                    <thead>
                      <tr style={{ color: MUTED, textAlign: 'left' }}>
                        <th style={{ padding: '4px 6px', fontWeight: 600 }}>{en ? 'Item' : '项目'}</th>
                        <th style={{ padding: '4px 6px', fontWeight: 600, textAlign: 'right' }}>{en ? 'Qty' : '数量'}</th>
                        <th style={{ padding: '4px 6px', fontWeight: 600, textAlign: 'right' }}>{en ? 'Unit price' : '单价'}</th>
                        <th style={{ padding: '4px 6px', fontWeight: 600, textAlign: 'right' }}>{en ? 'Amount' : '金额'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.proposal.items.map((it, k) => (
                        <tr key={k} style={{ borderTop: `1px solid ${BORDER}` }}>
                          <td style={{ padding: '6px' }}>{it.item_name}</td>
                          <td style={{ padding: '6px', textAlign: 'right' }}>{it.qty} {it.unit}</td>
                          <td style={{ padding: '6px', textAlign: 'right' }}>{fmt(it.selling_price)}</td>
                          <td style={{ padding: '6px', textAlign: 'right' }}>{fmt(it.qty * it.selling_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ textAlign: 'right', fontSize: 13, color: MUTED, marginTop: 6 }}>
                  {(en ? 'Subtotal ' : '小计 ') + fmt(m.proposal.subtotal)} · VAT {fmt(m.proposal.vat)} ·{' '}
                  <b style={{ color: TEXT }}>{(en ? 'Total ' : '合计 ') + m.proposal.currency + ' ' + fmt(m.proposal.total)}</b>
                </div>

                {!m.status && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button type="button" disabled={confirming !== null} onClick={() => confirm(i, m.proposal!)}
                      style={{ background: GOLD, color: colors.bgBase, border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: confirming !== null ? 0.6 : 1 }}>
                      {confirming === i ? (en ? 'Saving…' : '保存中…') : en ? 'Confirm & save draft' : '确认并保存草稿'}
                    </button>
                    <button type="button" disabled={confirming !== null} onClick={() => cancel(i)}
                      style={{ background: 'transparent', color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
                      {en ? 'Cancel' : '取消'}
                    </button>
                  </div>
                )}
                {m.status === 'confirmed' && (
                  <div style={{ marginTop: 10, fontSize: 13, color: '#7FD19C' }}>
                    {(en ? 'Quotation draft saved' : '报价草稿已保存') + (m.note ? (en ? ` · No. ${m.note}` : ` · 单号 ${m.note}`) : '')}{' '}
                    <button type="button" onClick={() => navigate('/quotation')} style={{ background: 'none', border: 'none', color: GOLD, cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
                      {en ? 'Open Quotation Center' : '打开报价中心'}
                    </button>
                  </div>
                )}
                {m.status === 'cancelled' && <div style={{ marginTop: 10, fontSize: 13, color: MUTED }}>{en ? 'Cancelled — nothing was saved.' : '已取消，未保存任何内容。'}</div>}
                {m.status === 'error' && <div style={{ marginTop: 10, fontSize: 13, color: '#F08A72' }}>{(en ? 'Save failed: ' : '保存失败：') + (m.note || '')}</div>}
              </div>
            )}
          </div>
        ))}
        {busy && <div style={{ fontSize: 13, color: MUTED }}>{en ? 'Working on it…' : '正在处理…'}</div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(text); }} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
          placeholder={en ? 'e.g. Check stock for LED panels and draft a quote for customer ABC' : '例如：查 LED 面板库存，给客户 ABC 做报价草稿'}
          style={{ flex: 1, minWidth: 0, background: colors.bgBase, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none' }} />
        <button type="submit" disabled={busy || !text.trim()}
          style={{ background: GOLD, color: colors.bgBase, border: 'none', borderRadius: 10, padding: '0 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: busy || !text.trim() ? 0.6 : 1 }}>
          {en ? 'Send' : '发送'}
        </button>
      </form>
    </div>
  );
}
