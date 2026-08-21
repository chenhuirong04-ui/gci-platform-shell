// GCI Executive Desk — Task 18.2: GIA Support Inbox.
// Email-sourced ticket intake (was: "转为客服工单" on the now-removed Email
// Assistant detail page) is gone along with GCI/GIA's email capability
// (final product decision) — manual ticket entry below still covers that
// case. WhatsApp intake (GIA WhatsApp Intake V1) reads real messages captured by
// api/whatsapp/webhook.ts — this page never sends anything itself; a
// "WhatsApp Draft" is generated for review only, always shown as 未发送.
// Manual ticket entry (below) still exists for anything outside the
// automated intake. Every reply is a draft only — nothing here ever
// sends an Email or WhatsApp message, changes a subscription, adds
// minutes, or issues a refund.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import {
  listTickets, updateTicketStatus, classifySupportMessage, createTicket, draftTicketReply,
  type SupportTicket, type SupportStatus, type SupportChannel, type TicketClassification, type TicketDraft,
} from '../lib/supportTickets';
import {
  getWhatsAppMessages, CLASSIFICATION_LABEL,
  type WhatsAppMessageRow,
} from '../lib/whatsapp';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const GREEN = '#6FBF8E';
const MUTED = '#7A8494';
const TEXT = colors.textPrimary;
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

type ViewKey = 'open' | 'in_progress' | 'resolved' | 'needs_chris' | 'whatsapp';

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'open', label: '待处理' },
  { key: 'in_progress', label: '处理中' },
  { key: 'resolved', label: '已解决' },
  { key: 'needs_chris', label: '需要 Chris' },
  { key: 'whatsapp', label: 'WhatsApp Intake' },
];

const PRIORITY_COLOR: Record<string, string> = { P1: RED, P2: AMBER, P3: MUTED };

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dubai = new Date(d.getTime() + 4 * 3600 * 1000);
  const mo = String(dubai.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dubai.getUTCDate()).padStart(2, '0');
  const hh = String(dubai.getUTCHours()).padStart(2, '0');
  const mm = String(dubai.getUTCMinutes()).padStart(2, '0');
  return `${mo}/${da} ${hh}:${mm}`;
}

export function SupportInbox() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewKey>('open');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newChannel, setNewChannel] = useState<SupportChannel>('whatsapp');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerContact, setNewCustomerContact] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newClassification, setNewClassification] = useState<TicketClassification | null>(null);
  const [classifyBusy, setClassifyBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [newErr, setNewErr] = useState<string | null>(null);

  const [draft, setDraft] = useState<TicketDraft | null>(null);
  const [draftBusy, setDraftBusy] = useState<SupportChannel | null>(null);
  const [draftErr, setDraftErr] = useState<string | null>(null);

  // GIA WhatsApp Intake V1 — real messages from whatsapp_messages, separate
  // list from the ticket views above (a WhatsApp message may have been
  // routed to a followup/task instead of a ticket, so it wouldn't appear
  // in the ticket list at all).
  const [waMessages, setWaMessages] = useState<WhatsAppMessageRow[]>([]);
  const [waLoading, setWaLoading] = useState(true);
  const [waError, setWaError] = useState<string | null>(null);
  const [waSelected, setWaSelected] = useState<WhatsAppMessageRow | null>(null);
  const [waDraft, setWaDraft] = useState<TicketDraft | null>(null);
  const [waDraftBusy, setWaDraftBusy] = useState(false);
  const [waDraftErr, setWaDraftErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = view === 'needs_chris' ? await listTickets({ needsChris: true }) : await listTickets({ status: view as SupportStatus });
    if (res.ok) setTickets(res.rows);
    else setError(res.error);
    setLoading(false);
  }

  async function loadWhatsApp() {
    setWaLoading(true);
    setWaError(null);
    const res = await getWhatsAppMessages(100);
    if (res.ok) setWaMessages(res.rows);
    else setWaError(res.error);
    setWaLoading(false);
  }

  useEffect(() => {
    if (view === 'whatsapp') loadWhatsApp();
    else load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function handleWhatsAppDraft() {
    if (!waSelected) return;
    setWaDraftBusy(true);
    setWaDraftErr(null);
    const res = await draftTicketReply({
      channel: 'whatsapp',
      rawContent: waSelected.text_content,
      summaryZh: waSelected.summary_zh || undefined,
      suggestedAction: waSelected.suggested_action || undefined,
      customerName: waSelected.crm_customers?.customer_name || waSelected.contact_name || undefined,
    });
    setWaDraftBusy(false);
    if (res.ok) setWaDraft(res.data);
    else setWaDraftErr(res.error);
  }

  function openTicket(t: SupportTicket) {
    setSelected(t);
    setDraft(null);
    setDraftErr(null);
  }

  async function handleStatusChange(status: SupportStatus) {
    if (!selected) return;
    setStatusBusy(true);
    const res = await updateTicketStatus(selected.id, status);
    setStatusBusy(false);
    if (res.ok) {
      setSelected(res.ticket);
      load();
    }
  }

  async function handleClassifyNew() {
    if (!newContent.trim()) return;
    setClassifyBusy(true);
    setNewErr(null);
    const res = await classifySupportMessage(newContent.trim(), undefined, newCustomerName.trim() || undefined);
    setClassifyBusy(false);
    if (res.ok) setNewClassification(res.data);
    else setNewErr(res.error);
  }

  async function handleSaveNew() {
    if (!newClassification) return;
    setSaveBusy(true);
    setNewErr(null);
    const res = await createTicket({
      channel: newChannel,
      customerName: newCustomerName.trim() || null,
      customerEmail: newChannel === 'email' ? newCustomerContact.trim() || null : null,
      customerPhone: newChannel === 'whatsapp' ? newCustomerContact.trim() || null : null,
      rawContent: newContent.trim(),
      classification: newClassification,
    });
    setSaveBusy(false);
    if (res.ok) {
      setShowNewForm(false);
      setNewChannel('whatsapp');
      setNewCustomerName('');
      setNewCustomerContact('');
      setNewContent('');
      setNewClassification(null);
      setView('open');
      load();
    } else {
      setNewErr(res.error);
    }
  }

  async function handleDraft(channel: SupportChannel) {
    if (!selected) return;
    setDraftBusy(channel);
    setDraftErr(null);
    const res = await draftTicketReply({
      channel,
      rawContent: selected.raw_content,
      summaryZh: selected.summary_zh,
      suggestedAction: selected.suggested_action,
      systemStatusContext: selected.system_status_context,
      customerName: selected.customer_name,
    });
    setDraftBusy(null);
    if (res.ok) setDraft(res.data);
    else setDraftErr(res.error);
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <button onClick={() => navigate('/')} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>← 返回</button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>GIA Support Inbox / 客服收件箱</h1>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowNewForm((v) => !v)} style={{ padding: '8px 16px', borderRadius: 9, fontSize: 13, cursor: 'pointer', background: showNewForm ? 'rgba(203,168,92,0.14)' : `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: showNewForm ? GOLD : '#080D1E', fontWeight: 700 }}>
          {showNewForm ? '取消' : '+ 新建工单（WhatsApp / 手工录入）'}
        </button>
      </div>

      {showNewForm && (
        <div style={{ padding: '16px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: GOLD, marginBottom: 10 }}>新建工单</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <select value={newChannel} onChange={(e) => setNewChannel(e.target.value as SupportChannel)} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: TEXT, fontSize: 13 }}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </select>
            <input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="客户姓名" style={{ flex: 1, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: TEXT, fontSize: 13 }} />
            <input value={newCustomerContact} onChange={(e) => setNewCustomerContact(e.target.value)} placeholder={newChannel === 'email' ? '邮箱' : '电话'} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: TEXT, fontSize: 13 }} />
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="粘贴客户原始内容…"
            rows={4}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: TEXT, fontSize: 13, marginBottom: 10, boxSizing: 'border-box', resize: 'vertical' }}
          />
          <button disabled={!newContent.trim() || classifyBusy} onClick={handleClassifyNew} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'rgba(203,168,92,0.14)', border: '1px solid rgba(203,168,92,0.4)', color: GOLD, opacity: newContent.trim() ? 1 : 0.5 }}>
            {classifyBusy ? '识别中…' : '识别'}
          </button>

          {newClassification && (
            <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 9, border: `1px solid ${BORD}` }}>
              <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 4 }}>产品:<span style={{ color: TEXT }}> {newClassification.product}</span> · 类型:<span style={{ color: TEXT }}> {newClassification.issue_type}</span> · 优先级:<span style={{ color: PRIORITY_COLOR[newClassification.priority] }}> {newClassification.priority}</span></div>
              <div style={{ fontSize: 12.5, color: TEXT, marginBottom: 4 }}>{newClassification.summary_zh}</div>
              <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 4 }}>为什么重要: {newClassification.why_important}</div>
              <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 8 }}>建议动作: {newClassification.suggested_action}</div>
              {newClassification.system_status_context && <div style={{ fontSize: 11, color: GOLD, marginBottom: 8 }}>{newClassification.system_status_context}</div>}
              {newErr && <div style={{ fontSize: 11.5, color: RED, marginBottom: 8 }}>{newErr}</div>}
              <button disabled={saveBusy} onClick={handleSaveNew} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}>
                {saveBusy ? '保存中…' : '确认创建工单'}
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)} style={{ padding: '8px 16px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer', background: view === v.key ? `linear-gradient(135deg,${GOLD},#E2C988)` : 'rgba(255,255,255,0.04)', border: `1px solid ${view === v.key ? 'transparent' : BORD}`, color: view === v.key ? '#080D1E' : MUTED, fontWeight: view === v.key ? 700 : 400 }}>
            {v.label}
          </button>
        ))}
      </div>

      {view === 'whatsapp' ? (
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {waLoading && <div style={{ fontSize: 13, color: MUTED }}>加载中…</div>}
            {waError && <div style={{ fontSize: 13, color: RED }}>读取失败:{waError}</div>}
            {!waLoading && !waError && waMessages.length === 0 && (
              <div style={{ padding: '18px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 13, color: MUTED }}>暂无 WhatsApp 消息。</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {waMessages.map((m) => (
                <div
                  key={m.id}
                  onClick={() => { setWaSelected(m); setWaDraft(null); setWaDraftErr(null); }}
                  style={{ padding: '12px 16px', borderRadius: 10, cursor: 'pointer', background: waSelected?.id === m.id ? 'rgba(203,168,92,0.08)' : CARD, border: `1px solid ${waSelected?.id === m.id ? 'rgba(203,168,92,0.4)' : BORD}` }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9.5, color: '#6FBF8E', background: 'rgba(111,191,142,0.14)', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>WhatsApp</span>
                    {m.priority && <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[m.priority], background: `${PRIORITY_COLOR[m.priority]}18`, borderRadius: 4, padding: '2px 6px' }}>{m.priority}</span>}
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: TEXT }}>{m.contact_name || `+${m.phone}`}</span>
                    <span style={{ fontSize: 10.5, color: MUTED }}>{m.crm_customers?.customer_name ? `客户：${m.crm_customers.customer_name}` : '未识别联系人'}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 10.5, color: MUTED }}>{fmtTime(m.wa_timestamp)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: TEXT, marginBottom: 4 }}>{m.summary_zh || m.text_content.slice(0, 60)}</div>
                  {m.suggested_action && <div style={{ fontSize: 11, color: MUTED }}>建议: {m.suggested_action}</div>}
                </div>
              ))}
            </div>
          </div>

          {waSelected && (
            <div style={{ width: 420, flexShrink: 0, border: `1px solid ${BORD}`, borderRadius: 12, background: CARD, padding: '16px 18px', height: 'fit-content' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {waSelected.priority && <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[waSelected.priority], background: `${PRIORITY_COLOR[waSelected.priority]}18`, borderRadius: 4, padding: '2px 6px' }}>{waSelected.priority}</span>}
                <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{waSelected.contact_name || `+${waSelected.phone}`}</span>
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>
                {waSelected.crm_customers?.customer_name ? `客户：${waSelected.crm_customers.customer_name}` : '未识别联系人（不在 CRM 中）'}
                {waSelected.classification && ` · ${CLASSIFICATION_LABEL[waSelected.classification]}`}
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, color: GOLD, fontWeight: 700, marginBottom: 4 }}>客户原始内容</div>
                <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: '8px 10px', maxHeight: 140, overflowY: 'auto' }}>{waSelected.text_content}</div>
              </div>

              {waSelected.summary_zh && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 10.5, color: GOLD, fontWeight: 700 }}>GIA 摘要:</span> <span style={{ fontSize: 12, color: TEXT }}>{waSelected.summary_zh}</span></div>}
              {waSelected.suggested_action && <div style={{ marginBottom: 14 }}><span style={{ fontSize: 10.5, color: GOLD, fontWeight: 700 }}>建议动作:</span> <span style={{ fontSize: 12, color: MUTED }}>{waSelected.suggested_action}</span></div>}

              <div style={{ fontSize: 11, color: MUTED, marginBottom: 14 }}>
                {waSelected.linked_ticket_id && '已建客服工单'}
                {waSelected.linked_followup_id && '已建 CRM 跟进'}
                {waSelected.linked_task_id && '已建待办事项'}
                {!waSelected.linked_ticket_id && !waSelected.linked_followup_id && !waSelected.linked_task_id && '尚未关联记录'}
              </div>

              <div style={{ borderTop: `1px solid ${BORD}`, paddingTop: 12 }}>
                <div style={{ fontSize: 10.5, color: GOLD, fontWeight: 700, marginBottom: 8 }}>起草回复（不自动发送）</div>
                <button disabled={waDraftBusy} onClick={handleWhatsAppDraft} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT, marginBottom: 10 }}>
                  {waDraftBusy ? '生成中…' : 'WhatsApp Draft'}
                </button>
                {waDraftErr && <div style={{ fontSize: 11.5, color: RED, marginBottom: 8 }}>{waDraftErr}</div>}
                {waDraft && (
                  <div style={{ padding: '10px 12px', background: 'rgba(203,168,92,0.05)', border: '1px solid rgba(203,168,92,0.2)', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>{waDraft.body}</div>
                    <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8 }}>草稿仅保存在当前页面，未发送</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
      <div style={{ display: 'flex', gap: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading && <div style={{ fontSize: 13, color: MUTED }}>加载中…</div>}
          {error && <div style={{ fontSize: 13, color: RED }}>读取失败:{error}</div>}
          {!loading && !error && tickets.length === 0 && (
            <div style={{ padding: '18px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 13, color: MUTED }}>暂无工单。</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tickets.map((t) => (
              <div
                key={t.id}
                onClick={() => openTicket(t)}
                style={{ padding: '12px 16px', borderRadius: 10, cursor: 'pointer', background: selected?.id === t.id ? 'rgba(203,168,92,0.08)' : CARD, border: `1px solid ${selected?.id === t.id ? 'rgba(203,168,92,0.4)' : BORD}` }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[t.priority], background: `${PRIORITY_COLOR[t.priority]}18`, borderRadius: 4, padding: '2px 6px' }}>{t.priority}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: TEXT }}>{t.customer_name || '未知客户'}</span>
                  <span style={{ fontSize: 10.5, color: MUTED }}>{t.product}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 10.5, color: MUTED }}>{fmtTime(t.created_at)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: TEXT, marginBottom: 4 }}>{t.summary_zh || t.raw_content.slice(0, 60)}</div>
                {t.suggested_action && <div style={{ fontSize: 11, color: MUTED }}>建议: {t.suggested_action}</div>}
              </div>
            ))}
          </div>
        </div>

        {selected && (
          <div style={{ width: 420, flexShrink: 0, border: `1px solid ${BORD}`, borderRadius: 12, background: CARD, padding: '16px 18px', height: 'fit-content' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[selected.priority], background: `${PRIORITY_COLOR[selected.priority]}18`, borderRadius: 4, padding: '2px 6px' }}>{selected.priority}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{selected.customer_name || '未知客户'}</span>
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>{selected.product} · {selected.issue_type} · {selected.channel}</div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, color: GOLD, fontWeight: 700, marginBottom: 4 }}>客户原始内容</div>
              <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: '8px 10px', maxHeight: 140, overflowY: 'auto' }}>{selected.raw_content}</div>
            </div>

            <div style={{ marginBottom: 6 }}><span style={{ fontSize: 10.5, color: GOLD, fontWeight: 700 }}>GIA 摘要:</span> <span style={{ fontSize: 12, color: TEXT }}>{selected.summary_zh}</span></div>
            <div style={{ marginBottom: 6 }}><span style={{ fontSize: 10.5, color: GOLD, fontWeight: 700 }}>为什么重要:</span> <span style={{ fontSize: 12, color: MUTED }}>{selected.why_important}</span></div>
            {selected.system_status_context && (
              <div style={{ marginBottom: 6 }}><span style={{ fontSize: 10.5, color: GOLD, fontWeight: 700 }}>系统状态:</span> <span style={{ fontSize: 12, color: MUTED }}>{selected.system_status_context}</span></div>
            )}
            <div style={{ marginBottom: 14 }}><span style={{ fontSize: 10.5, color: GOLD, fontWeight: 700 }}>建议解决方案:</span> <span style={{ fontSize: 12, color: MUTED }}>{selected.suggested_action}</span></div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button disabled={statusBusy || selected.status === 'in_progress'} onClick={() => handleStatusChange('in_progress')} style={{ padding: '6px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(212,168,67,0.12)', border: `1px solid ${AMBER}40`, color: AMBER }}>标记处理中</button>
              <button disabled={statusBusy || selected.status === 'resolved'} onClick={() => handleStatusChange('resolved')} style={{ padding: '6px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}>标记已解决</button>
            </div>

            <div style={{ borderTop: `1px solid ${BORD}`, paddingTop: 12 }}>
              <div style={{ fontSize: 10.5, color: GOLD, fontWeight: 700, marginBottom: 8 }}>起草回复（不自动发送）</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button disabled={draftBusy !== null} onClick={() => handleDraft('email')} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT }}>{draftBusy === 'email' ? '生成中…' : 'Email Draft'}</button>
                <button disabled={draftBusy !== null} onClick={() => handleDraft('whatsapp')} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT }}>{draftBusy === 'whatsapp' ? '生成中…' : 'WhatsApp Draft'}</button>
              </div>
              {draftErr && <div style={{ fontSize: 11.5, color: RED, marginBottom: 8 }}>{draftErr}</div>}
              {draft && (
                <div style={{ padding: '10px 12px', background: 'rgba(203,168,92,0.05)', border: '1px solid rgba(203,168,92,0.2)', borderRadius: 8 }}>
                  {draft.subject && <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6 }}>Subject: {draft.subject}</div>}
                  <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>{draft.body}</div>
                  <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8 }}>草稿仅保存在当前页面，未发送</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
