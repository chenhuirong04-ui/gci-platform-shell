// GCI Executive Desk — Task 11.1: Email Chat Assistant.
// Read a real Gmail thread, discuss it with GCI Assistant, draft a reply,
// revise it over multiple turns. Read-only against Gmail (gmail.readonly) —
// this page never sends, drafts-saves, archives, deletes, or labels any
// email. Draft text lives only in this page's component state.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { searchGmail, getGmailThread, type GmailResult, type GmailThreadMessage } from '../lib/googleSearch';
import { getAllCustomerNames } from '../lib/crmSupabase';
import {
  sendEmailAssistantChat, resolveCustomerContext, threadMessagesForChat, extractSenderName,
  summarizeEmailThread, categorizeEmail, EMAIL_CATEGORIES,
  triageEmails, dubaiDateStr, todayDubaiStr, yesterdayDubaiStr,
  type ChatTurn, type DraftShape, type EmailSummary, type EmailCategory, type TriageResult,
} from '../lib/emailAssistant';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const GREEN = '#6FBF8E';
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

  const [category, setCategory] = useState<EmailCategory | 'all'>('all');
  const [emails, setEmails] = useState<GmailResult[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [customerNames, setCustomerNames] = useState<string[]>([]);

  // "今天只看今天" — default landing tab is today's 3-tier triage; 昨天/更早
  // are a deliberate opt-in via this switcher, never crowding the homepage.
  const [dayTab, setDayTab] = useState<'today' | 'yesterday' | 'earlier'>('today');
  const [triageMap, setTriageMap] = useState<Record<string, TriageResult> | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);

  const [selected, setSelected] = useState<GmailResult | null>(null);
  const [threadMessages, setThreadMessages] = useState<GmailThreadMessage[] | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [customerContext, setCustomerContext] = useState<{ summary: string | null; customerName: string | null } | null>(null);
  const [emailSummary, setEmailSummary] = useState<EmailSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

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

  useEffect(() => {
    setEmails(null);
    setListError(null);
    searchGmail(GMAIL_SCOPE_QUERY, GMAIL_SCOPE_MAX).then((res) => {
      if (res.ok) setEmails(res.results);
      else setListError(res.error);
    });
  }, []);

  // Bucket by Asia/Dubai calendar day — today's triage is the default
  // landing view; 昨天/更早 stay one click away instead of crowding it.
  const buckets = useMemo(() => {
    const today = todayDubaiStr();
    const yesterday = yesterdayDubaiStr();
    const t: GmailResult[] = [], y: GmailResult[] = [], e: GmailResult[] = [];
    for (const m of emails || []) {
      const d = dubaiDateStr(m.date);
      if (d === today) t.push(m);
      else if (d === yesterday) y.push(m);
      else e.push(m);
    }
    return { today: t, yesterday: y, earlier: e };
  }, [emails]);

  // One bulk triage call over TODAY's emails only, once, when the list
  // first loads — never per row, never for yesterday/earlier.
  useEffect(() => {
    if (!emails || triageMap || triageLoading) return;
    if (buckets.today.length === 0) {
      setTriageMap({});
      return;
    }
    setTriageLoading(true);
    triageEmails(buckets.today.map((m) => ({ id: m.id, sender: m.sender, subject: m.subject, snippet: m.snippet, date: m.date }))).then((res) => {
      setTriageLoading(false);
      if (res.ok) {
        const map: Record<string, TriageResult> = {};
        res.results.forEach((r) => { map[r.id] = r; });
        setTriageMap(map);
      } else {
        setTriageError(res.error);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails]);

  const mustList = buckets.today.filter((m) => triageMap?.[m.id]?.tier === 'must').slice(0, 5);
  const importantList = buckets.today.filter((m) => triageMap?.[m.id]?.tier === 'important');
  const ignoredList = buckets.today.filter((m) => triageMap?.[m.id]?.tier === 'ignored');

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
          if (sres.ok) setEmailSummary(sres.data);
          else setSummaryError(sres.error);
        });
      } else {
        setThreadError(res.error);
      }
    });
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
          if (sres.ok) setEmailSummary(sres.data);
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
      </div>

      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        {/* ── Left: today's triage, or a date-scoped flat list ── */}
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

          {listError && <div style={{ padding: 16, fontSize: 12.5, color: RED }}>读取失败:{listError}</div>}

          {!listError && dayTab === 'today' && (
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!emails ? (
                <div style={{ padding: 16, fontSize: 12.5, color: MUTED }}>加载中…</div>
              ) : (
                <>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, marginBottom: 8, letterSpacing: '0.04em' }}>
                      今日必须处理{mustList.length > 0 ? ` · ${mustList.length}` : ''}
                    </div>
                    {triageLoading ? (
                      <div style={{ fontSize: 12, color: MUTED, padding: '10px 0' }}>正在分析今天的邮件…</div>
                    ) : triageError ? (
                      <div style={{ fontSize: 12, color: RED, padding: '10px 0' }}>分析失败:{triageError}</div>
                    ) : mustList.length === 0 ? (
                      <div style={{ fontSize: 12, color: MUTED, padding: '10px 0' }}>今天没有必须处理的邮件。</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {mustList.map((m) => {
                          const t = triageMap?.[m.id];
                          const active = selected?.threadId === m.threadId;
                          return (
                            <div
                              key={m.id}
                              onClick={() => openThread(m)}
                              style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', background: active ? 'rgba(203,168,92,0.1)' : CARD, border: `1px solid ${active ? 'rgba(203,168,92,0.4)' : BORD}` }}
                            >
                              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 5 }}>{t?.chineseTitle || m.subject || '(无主题)'}</div>
                              <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.6, marginBottom: 3 }}>{t?.summary}</div>
                              <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.6, marginBottom: 3 }}><span style={{ color: SUBTLE }}>为什么重要:</span>{t?.why}</div>
                              <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.6, marginBottom: 6 }}><span style={{ color: SUBTLE }}>建议下一步:</span>{t?.nextStep}</div>
                              <div style={{ fontSize: 10.5, color: SUBTLE }}>{extractSenderName(m.sender)} · {formatEmailDate(m.date)}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8, letterSpacing: '0.04em' }}>
                      今日重要{importantList.length > 0 ? ` · ${importantList.length}` : ''}
                    </div>
                    {importantList.length === 0 && !triageLoading ? (
                      <div style={{ fontSize: 12, color: MUTED, padding: '4px 0' }}>暂无。</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {importantList.map((m) => {
                          const t = triageMap?.[m.id];
                          const active = selected?.threadId === m.threadId;
                          return (
                            <div
                              key={m.id}
                              onClick={() => openThread(m)}
                              style={{ padding: '9px 12px', borderRadius: 9, cursor: 'pointer', background: active ? 'rgba(203,168,92,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${BORD}` }}
                            >
                              <div style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{extractSenderName(m.sender)} · {m.subject || '(无主题)'}</div>
                              {t?.importantReason && <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{t.importantReason}</div>}
                              <div style={{ fontSize: 10, color: SUBTLE, marginTop: 3 }}>{formatEmailDate(m.date)}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <div
                      onClick={() => setShowIgnored((v) => !v)}
                      style={{ fontSize: 11.5, color: SUBTLE, cursor: 'pointer', userSelect: 'none' }}
                    >
                      已自动忽略 · {ignoredList.length} 封 {ignoredList.length > 0 ? (showIgnored ? '（收起）' : '（展开查看）') : ''}
                    </div>
                    {showIgnored && ignoredList.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {ignoredList.map((m) => (
                          <div key={m.id} onClick={() => openThread(m)} style={{ fontSize: 11, color: SUBTLE, cursor: 'pointer', padding: '4px 0' }}>
                            {extractSenderName(m.sender)} · {m.subject || '(无主题)'} · {formatEmailDate(m.date)}
                          </div>
                        ))}
                      </div>
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
                          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {m.attachments.map((a, ai) => (
                              <span key={ai} style={{ fontSize: 10.5, color: MUTED, background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, borderRadius: 5, padding: '3px 8px' }}>
                                📎 {a.filename}
                              </span>
                            ))}
                          </div>
                        )}
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
