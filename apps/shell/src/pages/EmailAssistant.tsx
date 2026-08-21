// GCI Executive Desk — Task 11.1: Email Chat Assistant.
// Read a real Gmail thread, discuss it with GCI Assistant, draft a reply,
// revise it over multiple turns. Read-only against Gmail (gmail.readonly) —
// this page never sends, drafts-saves, archives, deletes, or labels any
// email. Draft text lives only in this page's component state.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { searchGmail, getGmailThread, getTodayEmails, type GmailResult, type GmailThreadMessage } from '../lib/googleSearch';
import { getAllCustomerNames } from '../lib/crmSupabase';
import {
  sendEmailAssistantChat, resolveCustomerContext, threadMessagesForChat, extractSenderName,
  summarizeEmailThread, categorizeEmail, EMAIL_CATEGORIES,
  triageEmails, dubaiDateStr, todayDubaiStr, yesterdayDubaiStr, TIER_LABELS,
  type ChatTurn, type DraftShape, type EmailSummary, type EmailCategory, type TriageResult, type EmailTier,
} from '../lib/emailAssistant';
import { classifySupportMessage, createTicket, type TicketClassification } from '../lib/supportTickets';
import { fetchAndStoreGmailAttachment, classifyFileDescription } from '../lib/giaFiles';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const GREEN = '#6FBF8E';
const BLUE_TAG = '#8FA6D4';
const MUTED = '#7A8494';
const SUBTLE = '#5A6A84';
const TEXT = colors.textPrimary;
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

// Summary-first redesign: scope is fixed to the last 30 days (no long-term
// archive browsing here — that's what Gmail itself is for), sorted needs-
// Chris-first by default, filtered by the same six categories Chris
// already uses. No "Recent/Important/Unread" filter chips anymore — those
// concepts are now just the default sort + the category tabs.
const GMAIL_SCOPE_QUERY = 'newer_than:30d in:inbox';
const GMAIL_SCOPE_MAX = 60;

const QUICK_PROMPTS = [
  { label: '这封邮件什么意思？', text: '这封邮件什么意思？他真正想要什么？' },
  { label: '给点建议', text: '这封邮件应该怎么处理？有什么风险需要注意？' },
  { label: '起草回复', text: '帮我起草一个回复，先不要发。' },
];

function formatEmailDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dubai = new Date(d.getTime() + 4 * 3600 * 1000);
  const mo = String(dubai.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dubai.getUTCDate()).padStart(2, '0');
  const hh = String(dubai.getUTCHours()).padStart(2, '0');
  const mm = String(dubai.getUTCMinutes()).padStart(2, '0');
  return `${mo}/${da} ${hh}:${mm}`;
}

export function EmailAssistant() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 统一真实邮件数据源 — Home's KPIs and this page's default "今天" view
  // both read getTodayEmails() (real Gmail, Dubai-calendar-day-scoped,
  // paginated so the count is never silently truncated). AI classification
  // is a separate, purely additive pass over this same list — it never
  // changes which emails are in it.
  const [todayEmails, setTodayEmails] = useState<GmailResult[] | null>(null);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [triageMap, setTriageMap] = useState<Record<string, TriageResult> | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  // 全部/AI建议处理/重要/未读 — filters the SAME todayEmails array client-side,
  // never a different Gmail query per filter. Home's "AI建议处理" KPI deep-
  // links with ?filter=action-required.
  const [todayFilter, setTodayFilter] = useState<'all' | 'action' | 'important' | 'unread'>(
    searchParams.get('filter') === 'action-required' ? 'action' : 'all',
  );

  const [category, setCategory] = useState<EmailCategory | 'all'>('all');
  const [emails, setEmails] = useState<GmailResult[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [customerNames, setCustomerNames] = useState<string[]>([]);

  // "今天只看今天" — default landing tab; 昨天/更早 are a deliberate opt-in
  // via this switcher, never crowding the default view.
  const [dayTab, setDayTab] = useState<'today' | 'yesterday' | 'earlier'>('today');

  const [selected, setSelected] = useState<GmailResult | null>(null);
  const [threadMessages, setThreadMessages] = useState<GmailThreadMessage[] | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [customerContext, setCustomerContext] = useState<{ summary: string | null; customerName: string | null } | null>(null);
  const [emailSummary, setEmailSummary] = useState<EmailSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  // GIA Multi-Source File Intake — "收好" next to an attachment chip.
  // Explicit, single-attachment action (messageId+attachmentId already
  // known from this exact chip, never guessed) — a lightweight two-click
  // confirm inline instead of the full multi-item capture card, since
  // there's only ever one thing to confirm here.
  const [confirmingAttachmentKey, setConfirmingAttachmentKey] = useState<string | null>(null);
  const [savingAttachmentKey, setSavingAttachmentKey] = useState<string | null>(null);
  const [savedAttachmentKeys, setSavedAttachmentKeys] = useState<Set<string>>(new Set());
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  async function handleSaveAttachment(messageId: string, a: { filename: string; mimeType: string; attachmentId: string }) {
    const key = `${messageId}:${a.attachmentId}`;
    setSavingAttachmentKey(key);
    setAttachmentError(null);
    const classification = classifyFileDescription(a.filename, a.filename);
    const res = await fetchAndStoreGmailAttachment(messageId, a.attachmentId, a.filename, a.mimeType, classification, null);
    setSavingAttachmentKey(null);
    setConfirmingAttachmentKey(null);
    if (res.ok) setSavedAttachmentKeys((prev) => new Set(prev).add(key));
    else setAttachmentError(res.error);
  }

  // Task 18.2 — "转为客服工单": reuses this thread's content, runs the same
  // classify() used by the Support Inbox's manual entry, then a single
  // insert into support_tickets. Never sends anything.
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketErr, setTicketErr] = useState<string | null>(null);
  const [ticketCreated, setTicketCreated] = useState(false);

  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [currentDraft, setCurrentDraft] = useState<DraftShape | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getAllCustomerNames().then((res) => {
      if (res.ok) setCustomerNames(res.rows.map((r) => r.customer_name));
    });
  }, []);

  // The real, unified "今天" list — loads immediately regardless of which
  // dayTab is active, since it's also what Home's KPIs read. Fast: metadata
  // only, Dubai-day-scoped (~2 days of inbox, not 30), bounded concurrency
  // server-side — see api/google/today-emails.ts.
  useEffect(() => {
    setTodayEmails(null);
    setTodayError(null);
    getTodayEmails().then((res) => {
      if (res.ok) setTodayEmails(res.results);
      else setTodayError(res.error);
    });
  }, []);

  // AI classification is a separate pass over the SAME list, after it's
  // already visible — one bulk call, additive only (chineseSubject + tier),
  // never removes or hides an email. If this call fails entirely, every
  // email just falls back to its real subject with no tier badge — the
  // list itself is unaffected.
  useEffect(() => {
    if (!todayEmails || triageMap || triageLoading) return;
    if (todayEmails.length === 0) {
      setTriageMap({});
      return;
    }
    setTriageLoading(true);
    triageEmails(todayEmails.map((m) => ({ id: m.id, sender: m.sender, subject: m.subject, snippet: m.snippet, date: m.date }))).then((res) => {
      setTriageLoading(false);
      if (res.ok) {
        const map: Record<string, TriageResult> = {};
        res.results.forEach((r) => { map[r.id] = r; });
        setTriageMap(map);
      } else {
        setTriageError(res.error);
      }
    });
  }, [todayEmails, triageMap, triageLoading]);

  const actionRequiredCount = todayEmails?.filter((m) => triageMap?.[m.id]?.tier === 'must').length ?? 0;
  const importantCount = todayEmails?.filter((m) => triageMap?.[m.id]?.tier === 'important').length ?? 0;
  const unreadCount = todayEmails?.filter((m) => m.unread).length ?? 0;

  // 全部/AI建议处理/重要/未读 — same array, filtered client-side, never a
  // second Gmail query. "全部" always shows every email regardless of tier.
  const filteredTodayEmails = useMemo(() => {
    const list = todayEmails || [];
    if (todayFilter === 'action') return list.filter((m) => triageMap?.[m.id]?.tier === 'must');
    if (todayFilter === 'important') return list.filter((m) => triageMap?.[m.id]?.tier === 'important');
    if (todayFilter === 'unread') return list.filter((m) => m.unread);
    return list;
  }, [todayEmails, todayFilter, triageMap]);

  useEffect(() => {
    if (dayTab === 'today') return; // lazy — the 30-day list is only needed for 昨天/更早
    if (emails || listError) return; // already fetched/attempted once
    searchGmail(GMAIL_SCOPE_QUERY, GMAIL_SCOPE_MAX).then((res) => {
      if (res.ok) setEmails(res.results);
      else setListError(res.error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayTab]);

  // Bucket the (lazily-loaded) 30-day list by Asia/Dubai calendar day for
  // 昨天/更早 only — "今天" no longer reads from this, see todayEmails above.
  const buckets = useMemo(() => {
    const yesterday = yesterdayDubaiStr();
    const y: GmailResult[] = [], e: GmailResult[] = [];
    for (const m of emails || []) {
      const d = dubaiDateStr(m.date);
      if (d === yesterday) y.push(m);
      else if (d !== todayDubaiStr()) e.push(m);
    }
    return { yesterday: y, earlier: e };
  }, [emails]);

  // Default sort for the 昨天/更早 flat list views: needs-Chris-first
  // (unread as the cheap, explainable proxy), then most recent first.
  // Category tabs filter on top of that same sort, never replace it.
  const dayBucketEmails = dayTab === 'yesterday' ? buckets.yesterday : dayTab === 'earlier' ? buckets.earlier : [];
  const displayedEmails = useMemo(() => {
    const filtered = category === 'all'
      ? dayBucketEmails
      : dayBucketEmails.filter((m) => categorizeEmail(m.sender, m.subject, customerNames) === category);
    return [...filtered].sort((a, b) => {
      if (!!a.unread !== !!b.unread) return a.unread ? -1 : 1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayBucketEmails, category, customerNames]);

  function isCustomerMatch(sender: string): string | null {
    return customerNames.find((name) => name.length >= 2 && sender.toLowerCase().includes(name.toLowerCase())) || null;
  }

  function openThread(email: GmailResult) {
    setSelected(email);
    setThreadMessages(null);
    setThreadError(null);
    setCustomerContext(null);
    setEmailSummary(null);
    setSummaryError(null);
    setShowOriginal(false);
    setTicketErr(null);
    setTicketCreated(false);
    // Never carry the previous email's conversation into a new thread.
    setChatHistory([]);
    setChatInput('');
    setChatError(null);
    setCurrentDraft(null);

    getGmailThread(email.threadId).then((res) => {
      if (res.ok) {
        setThreadMessages(res.messages);
        const first = res.messages[0];
        if (first) resolveCustomerContext(first.from).then(setCustomerContext);

        // One AI call, once, when the thread opens — never per list row.
        setSummaryLoading(true);
        summarizeEmailThread(threadMessagesForChat(res.messages)).then((sres) => {
          setSummaryLoading(false);
          if (sres.ok) setEmailSummary(alignNeedsChrisWithTriage(email.id, sres.data));
          else setSummaryError(sres.error);
        });
      } else {
        setThreadError(res.error);
      }
    });
  }

  // Homepage triage and the detail badge must never disagree about the
  // same email — if this one was already triaged today, its tier is the
  // source of truth for the 需要处理/无需处理 badge (must/ignored are
  // unambiguous; "important" and untriaged emails keep the detail
  // summarizer's own judgment, since that call sees the full body while
  // triage only sees a snippet). The richer summary/why/nextStep text
  // always stays the detail summarizer's own — it has more context.
  function alignNeedsChrisWithTriage(emailId: string, data: EmailSummary): EmailSummary {
    const tier = triageMap?.[emailId]?.tier;
    if (tier === 'must') return { ...data, needsChris: true };
    if (tier === 'ignored') return { ...data, needsChris: false };
    return data;
  }

  // Task 18.2 — "转为客服工单". Classifies the thread's first message
  // through the same support classifier the Support Inbox's manual entry
  // uses, then a single insert into support_tickets. Read-only against
  // Gmail; the only write is that one insert.
  async function handleConvertToTicket() {
    if (!selected || !threadMessages || threadMessages.length === 0) return;
    setTicketBusy(true);
    setTicketErr(null);
    const first = threadMessages[0];
    const senderName = extractSenderName(first.from);
    const emailMatch = first.from.match(/<([^>]+)>/);
    const senderEmail = emailMatch ? emailMatch[1] : (first.from.includes('@') ? first.from : null);

    const cls = await classifySupportMessage(`${first.subject}\n\n${first.body}`, undefined, senderName);
    if (!cls.ok) {
      setTicketBusy(false);
      setTicketErr(cls.error);
      return;
    }
    const res = await createTicket({
      channel: 'email',
      customerName: senderName || null,
      customerEmail: senderEmail,
      rawContent: `${first.subject}\n\n${first.body}`,
      classification: cls.data as TicketClassification,
      sourceThreadId: selected.threadId,
      sourceMessageId: first.id,
    });
    setTicketBusy(false);
    if (res.ok) setTicketCreated(true);
    else setTicketErr(res.error);
  }

  // Deep-link support: /email-assistant?threadId=... from Ask GCI / Gmail results.
  useEffect(() => {
    const threadId = searchParams.get('threadId');
    if (!threadId || selected) return;
    getGmailThread(threadId).then((res) => {
      if (res.ok && res.messages.length > 0) {
        const first = res.messages[0];
        setSelected({ id: first.id, threadId, sender: first.from, subject: first.subject, date: first.date, snippet: first.snippet, link: '' });
        setThreadMessages(res.messages);
        resolveCustomerContext(first.from).then(setCustomerContext);
        setSummaryLoading(true);
        summarizeEmailThread(threadMessagesForChat(res.messages)).then((sres) => {
          setSummaryLoading(false);
          if (sres.ok) setEmailSummary(alignNeedsChrisWithTriage(first.id, sres.data));
          else setSummaryError(sres.error);
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading]);

  async function handleSend(text?: string) {
    const question = (text ?? chatInput).trim();
    if (!question || !threadMessages || chatLoading) return;
    setChatInput('');
    setChatError(null);
    const nextHistory: ChatTurn[] = [...chatHistory, { role: 'user', content: question }];
    setChatHistory(nextHistory);
    setChatLoading(true);

    const res = await sendEmailAssistantChat({
      thread: threadMessagesForChat(threadMessages),
      question,
      history: chatHistory,
      customerContext: customerContext?.summary ?? null,
      currentDraft,
    });

    setChatLoading(false);
    if (res.ok) {
      setChatHistory((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      if (res.draft) setCurrentDraft(res.draft);
    } else {
      setChatError(res.error);
    }
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 28px 40px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 40px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexShrink: 0 }}>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}
        >
          ← 返回
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
          Email Assistant / 邮件聊天助理
        </h1>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => navigate('/support-inbox')}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}
        >
          客服收件箱 →
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        {/* ── Left: today's full real inbox (default), or a date-scoped flat list ── */}
        <div style={{ width: dayTab === 'today' ? 460 : 300, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {([['today', '今天'], ['yesterday', '昨天'], ['earlier', '更早']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setDayTab(key)}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: dayTab === key ? 700 : 400,
                  background: dayTab === key ? `linear-gradient(135deg,${GOLD},#E2C988)` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${dayTab === key ? 'transparent' : BORD}`,
                  color: dayTab === key ? '#080D1E' : MUTED,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {dayTab === 'today' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
                今日邮件 · {todayEmails ? todayEmails.length : todayError ? '—' : '…'}
              </div>

              {todayError ? (
                <div style={{ padding: 16, fontSize: 12.5, color: RED }}>邮件读取失败 / 未连接:{todayError}</div>
              ) : !todayEmails ? (
                <div style={{ padding: 16, fontSize: 12.5, color: MUTED }}>加载中…</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                    {([
                      ['all', `全部 · ${todayEmails.length}`],
                      ['action', `AI建议处理 · ${actionRequiredCount}`],
                      ['important', `重要 · ${importantCount}`],
                      ['unread', `未读 · ${unreadCount}`],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setTodayFilter(key)}
                        style={{
                          padding: '5px 11px', borderRadius: 16, fontSize: 11.5, cursor: 'pointer',
                          background: todayFilter === key ? 'rgba(203,168,92,0.16)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${todayFilter === key ? 'rgba(203,168,92,0.5)' : BORD}`,
                          color: todayFilter === key ? GOLD : MUTED,
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {triageLoading && <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>AI 正在分析今天的邮件…</div>}
                  {triageError && <div style={{ fontSize: 11, color: RED, marginBottom: 8 }}>AI 分析失败（邮件仍可查看）:{triageError}</div>}

                  <div style={{ flex: 1, overflowY: 'auto', border: `1px solid ${BORD}`, borderRadius: 12, background: CARD }}>
                    {filteredTodayEmails.length === 0 ? (
                      <div style={{ padding: 16, fontSize: 12.5, color: MUTED }}>
                        {todayEmails.length === 0 ? '今天还没有新邮件。' : '这个筛选下没有邮件。'}
                      </div>
                    ) : (
                      filteredTodayEmails.map((m) => {
                        const t = triageMap?.[m.id];
                        const match = isCustomerMatch(m.sender);
                        const active = selected?.threadId === m.threadId;
                        const cn = t?.chineseSubject && t.chineseSubject.trim() && t.chineseSubject !== m.subject ? t.chineseSubject : null;
                        return (
                          <div
                            key={m.id}
                            onClick={() => openThread(m)}
                            style={{
                              padding: '11px 14px', borderBottom: `1px solid ${BORD}`, cursor: 'pointer',
                              background: active ? 'rgba(203,168,92,0.08)' : 'transparent',
                              display: 'flex', alignItems: 'flex-start', gap: 8,
                            }}
                          >
                            {m.unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, marginTop: 6, flexShrink: 0 }} />}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 12.5, fontWeight: m.unread ? 700 : 500, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {cn || m.subject || '(无主题)'}
                              </div>
                              {cn && (
                                <div style={{ fontSize: 10.5, color: SUBTLE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                                  {m.subject || '(no subject)'}
                                </div>
                              )}
                              <div style={{ fontSize: 11, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>
                                {extractSenderName(m.sender)}
                              </div>
                              <div style={{ fontSize: 10.5, color: SUBTLE, marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span>{formatEmailDate(m.date)}</span>
                                {t?.tier && (
                                  <span style={{
                                    color: t.tier === 'must' ? GOLD : t.tier === 'important' ? BLUE_TAG : MUTED,
                                    background: t.tier === 'must' ? 'rgba(203,168,92,0.12)' : t.tier === 'important' ? 'rgba(143,166,212,0.12)' : 'rgba(255,255,255,0.05)',
                                    borderRadius: 3, padding: '1px 5px',
                                  }}>
                                    {TIER_LABELS[t.tier as EmailTier]}
                                  </span>
                                )}
                                {match && <span style={{ color: GOLD, background: 'rgba(203,168,92,0.12)', borderRadius: 3, padding: '1px 5px' }}>{match}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {!listError && dayTab !== 'today' && (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setCategory('all')}
                  style={{
                    padding: '5px 11px', borderRadius: 16, fontSize: 11.5, cursor: 'pointer',
                    background: category === 'all' ? 'rgba(203,168,92,0.16)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${category === 'all' ? 'rgba(203,168,92,0.5)' : BORD}`,
                    color: category === 'all' ? GOLD : MUTED,
                  }}
                >
                  全部
                </button>
                {EMAIL_CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setCategory(c.key)}
                    style={{
                      padding: '5px 11px', borderRadius: 16, fontSize: 11.5, cursor: 'pointer',
                      background: category === c.key ? 'rgba(203,168,92,0.16)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${category === c.key ? 'rgba(203,168,92,0.5)' : BORD}`,
                      color: category === c.key ? GOLD : MUTED,
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', border: `1px solid ${BORD}`, borderRadius: 12, background: CARD }}>
                {!emails ? (
                  <div style={{ padding: 16, fontSize: 12.5, color: MUTED }}>加载中…</div>
                ) : displayedEmails.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 12.5, color: MUTED }}>{dayTab === 'yesterday' ? '昨天没有邮件。' : '没有更早的邮件（最近 30 天内）。'}</div>
                ) : (
                  displayedEmails.map((m) => {
                    const match = isCustomerMatch(m.sender);
                    const active = selected?.threadId === m.threadId;
                    return (
                      <div
                        key={m.id}
                        onClick={() => openThread(m)}
                        style={{
                          padding: '11px 14px', borderBottom: `1px solid ${BORD}`, cursor: 'pointer',
                          background: active ? 'rgba(203,168,92,0.08)' : 'transparent',
                          display: 'flex', alignItems: 'flex-start', gap: 8,
                        }}
                      >
                        {m.unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, marginTop: 5, flexShrink: 0 }} />}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: m.unread ? 700 : 500, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {extractSenderName(m.sender)}
                          </div>
                          <div style={{ fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                            {m.subject || '(无主题)'}
                          </div>
                          <div style={{ fontSize: 10.5, color: SUBTLE, marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span>{formatEmailDate(m.date)}</span>
                            {match && <span style={{ color: GOLD, background: 'rgba(203,168,92,0.12)', borderRadius: 3, padding: '1px 5px' }}>{match}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Right: thread + chat ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 14 }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 13, border: `1px solid ${BORD}`, borderRadius: 12, background: CARD }}>
              从左侧选择一封邮件开始
            </div>
          ) : (
            <>
              {/* Thread detail — summary first, original text collapsed by default */}
              <div style={{ maxHeight: '48%', overflowY: 'auto', border: `1px solid ${BORD}`, borderRadius: 12, background: CARD, padding: '14px 16px', flexShrink: 0 }}>
                {threadError ? (
                  <div style={{ fontSize: 12.5, color: RED }}>读取失败:{threadError}</div>
                ) : !threadMessages ? (
                  <div style={{ fontSize: 12.5, color: MUTED }}>加载邮件内容…</div>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 10 }}>
                      {threadMessages[0]?.subject || '(无主题)'}
                    </div>

                    {summaryLoading ? (
                      <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>正在生成摘要…</div>
                    ) : summaryError ? (
                      <div style={{ fontSize: 12, color: RED, marginBottom: 12 }}>摘要生成失败:{summaryError}</div>
                    ) : emailSummary ? (
                      <div style={{ marginBottom: 14, padding: '11px 13px', background: 'rgba(203,168,92,0.05)', border: '1px solid rgba(203,168,92,0.2)', borderRadius: 9 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                            background: emailSummary.needsChris ? 'rgba(224,132,106,0.16)' : 'rgba(111,191,142,0.14)',
                            color: emailSummary.needsChris ? RED : GREEN,
                          }}>
                            {emailSummary.needsChris ? '需要处理' : '无需处理'}
                          </span>
                        </div>
                        <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.6, marginBottom: 6 }}><strong>摘要:</strong>{emailSummary.summary}</div>
                        <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, marginBottom: 6 }}><strong style={{ color: TEXT }}>为什么重要:</strong>{emailSummary.why}</div>
                        <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}><strong style={{ color: TEXT }}>建议下一步:</strong>{emailSummary.nextStep}</div>
                      </div>
                    ) : null}

                    <div style={{ marginBottom: 12 }}>
                      {ticketCreated ? (
                        <span style={{ fontSize: 11.5, color: GREEN }}>✓ 已转为客服工单</span>
                      ) : (
                        <button disabled={ticketBusy} onClick={handleConvertToTicket} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT }}>
                          {ticketBusy ? '转换中…' : '转为客服工单 →'}
                        </button>
                      )}
                      {ticketErr && <span style={{ fontSize: 11, color: RED, marginLeft: 8 }}>{ticketErr}</span>}
                    </div>

                    <div
                      onClick={() => setShowOriginal((v) => !v)}
                      style={{ fontSize: 11.5, color: GOLD, cursor: 'pointer', marginBottom: showOriginal ? 10 : 0, userSelect: 'none' }}
                    >
                      {showOriginal ? '− 收起原文' : '+ 查看原文'}
                    </div>

                    {showOriginal && threadMessages.map((m, i) => (
                      <div key={m.id} style={{ marginBottom: i < threadMessages.length - 1 ? 16 : 0, paddingBottom: i < threadMessages.length - 1 ? 14 : 0, borderBottom: i < threadMessages.length - 1 ? `1px solid ${BORD}` : 'none', paddingTop: 10, borderTop: `1px solid ${BORD}` }}>
                        <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>
                          From: {m.from} · To: {m.to} · {formatEmailDate(m.date)}
                        </div>
                        <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                        {m.attachments.length > 0 && (
                          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                            {m.attachments.map((a, ai) => {
                              const key = `${m.id}:${a.attachmentId}`;
                              const saved = savedAttachmentKeys.has(key);
                              const saving = savingAttachmentKey === key;
                              const confirming = confirmingAttachmentKey === key;
                              return (
                                <span key={ai} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: MUTED, background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, borderRadius: 5, padding: '3px 8px' }}>
                                  📎 {a.filename}
                                  {saved ? (
                                    <span style={{ color: GOLD }}>✓ 已收好</span>
                                  ) : confirming ? (
                                    <>
                                      <span>确认收好到 Drive？</span>
                                      <button onClick={() => handleSaveAttachment(m.id, a)} disabled={saving} style={{ fontSize: 10, color: GOLD, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                        {saving ? '收好中…' : '是'}
                                      </button>
                                      <button onClick={() => setConfirmingAttachmentKey(null)} disabled={saving} style={{ fontSize: 10, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>否</button>
                                    </>
                                  ) : (
                                    <button onClick={() => setConfirmingAttachmentKey(key)} style={{ fontSize: 10, color: GOLD, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                                      收好
                                    </button>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {attachmentError && <div style={{ marginTop: 6, fontSize: 10.5, color: '#E0846A' }}>{attachmentError}</div>}
                      </div>
                    ))}
                  </>
                )}
                {customerContext?.customerName && (
                  <div style={{ marginTop: 10, fontSize: 10.5, color: GOLD }}>✓ 已匹配 CRM 客户:{customerContext.customerName}</div>
                )}
              </div>

              {/* Chat */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, border: `1px solid ${BORD}`, borderRadius: 12, background: CARD }}>
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {chatHistory.length === 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {QUICK_PROMPTS.map((q) => (
                        <button
                          key={q.label}
                          onClick={() => handleSend(q.text)}
                          style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {chatHistory.map((turn, i) => (
                    <div key={i} style={{ alignSelf: turn.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                      <div style={{
                        padding: '9px 13px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                        background: turn.role === 'user' ? 'rgba(203,168,92,0.14)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${turn.role === 'user' ? 'rgba(203,168,92,0.35)' : BORD}`,
                        color: TEXT,
                      }}>
                        {turn.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && <div style={{ fontSize: 12, color: MUTED }}>GCI 正在思考…</div>}
                  {chatError && (
                    <div style={{ fontSize: 12, color: RED, padding: '8px 12px', background: 'rgba(224,132,106,0.08)', borderRadius: 8 }}>{chatError}</div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {currentDraft && (
                  <div style={{ margin: '0 14px 12px', padding: '12px 14px', background: 'rgba(203,168,92,0.05)', border: '1px solid rgba(203,168,92,0.25)', borderRadius: 10 }}>
                    <div style={{ fontSize: 10.5, color: GOLD, fontWeight: 700, marginBottom: 8, letterSpacing: '0.05em' }}>
                      回复草稿(未发送) · {currentDraft.language} · {currentDraft.tone}
                    </div>
                    <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 4 }}>To: {currentDraft.to || '(待填写)'}</div>
                    <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 8 }}>Subject: {currentDraft.subject}</div>
                    <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto', background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: '8px 10px' }}>
                      {currentDraft.body}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                      <button
                        disabled
                        title="发送功能将在后续启用"
                        style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORD}`, color: SUBTLE, cursor: 'not-allowed' }}
                      >
                        发送(功能将在后续启用)
                      </button>
                      <span style={{ fontSize: 10.5, color: SUBTLE }}>草稿仅保存在当前页面,刷新后会丢失</span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, padding: '0 14px 14px' }}>
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !chatLoading) handleSend(); }}
                    placeholder="和 GCI 讨论这封邮件…"
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: TEXT, fontSize: 13 }}
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={chatLoading || !chatInput.trim()}
                    style={{ padding: '10px 18px', borderRadius: 9, background: chatLoading ? 'rgba(203,168,92,0.15)' : `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: chatLoading ? GOLD : '#080D1E', fontSize: 13, fontWeight: 700, cursor: chatLoading ? 'not-allowed' : 'pointer' }}
                  >
                    发送
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
