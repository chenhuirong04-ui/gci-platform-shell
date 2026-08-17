// GCI Executive Desk — Task 11.1: Email Chat Assistant.
// Read a real Gmail thread, discuss it with GCI Assistant, draft a reply,
// revise it over multiple turns. Read-only against Gmail (gmail.readonly) —
// this page never sends, drafts-saves, archives, deletes, or labels any
// email. Draft text lives only in this page's component state.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { searchGmail, getImportantEmails, getGmailThread, type GmailResult, type GmailThreadMessage } from '../lib/googleSearch';
import { getAllCustomerNames } from '../lib/crmSupabase';
import { sendEmailAssistantChat, resolveCustomerContext, threadMessagesForChat, extractSenderName, type ChatTurn, type DraftShape } from '../lib/emailAssistant';

const GOLD = '#CBA85C';
const RED = '#E0846A';
const MUTED = '#7A8494';
const SUBTLE = '#5A6A84';
const TEXT = colors.textPrimary;
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

type ListFilter = 'recent' | 'important' | 'unread' | 'customer';

const FILTERS: { key: ListFilter; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'important', label: 'Important' },
  { key: 'unread', label: 'Unread' },
  { key: 'customer', label: 'Customer' },
];

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

  const [filter, setFilter] = useState<ListFilter>('recent');
  const [emails, setEmails] = useState<GmailResult[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [customerNames, setCustomerNames] = useState<string[]>([]);

  const [selected, setSelected] = useState<GmailResult | null>(null);
  const [threadMessages, setThreadMessages] = useState<GmailThreadMessage[] | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [customerContext, setCustomerContext] = useState<{ summary: string | null; customerName: string | null } | null>(null);

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
    let query: Promise<{ ok: true; results: GmailResult[] } | { ok: false; error: string }>;
    if (filter === 'important') {
      query = getImportantEmails();
    } else if (filter === 'unread') {
      query = searchGmail('is:unread newer_than:30d');
    } else {
      query = searchGmail('newer_than:14d in:inbox');
    }
    query.then((res) => {
      if (res.ok) setEmails(res.results);
      else setListError(res.error);
    });
  }, [filter]);

  const displayedEmails = useMemo(() => {
    if (!emails) return [];
    if (filter !== 'customer') return emails;
    return emails.filter((m) => customerNames.some((name) => name.length >= 2 && m.sender.toLowerCase().includes(name.toLowerCase())));
  }, [emails, filter, customerNames]);

  function isCustomerMatch(sender: string): string | null {
    return customerNames.find((name) => name.length >= 2 && sender.toLowerCase().includes(name.toLowerCase())) || null;
  }

  function openThread(email: GmailResult) {
    setSelected(email);
    setThreadMessages(null);
    setThreadError(null);
    setCustomerContext(null);
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
        {/* ── Left: email list ── */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '5px 11px', borderRadius: 16, fontSize: 11.5, cursor: 'pointer',
                  background: filter === f.key ? 'rgba(203,168,92,0.16)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${filter === f.key ? 'rgba(203,168,92,0.5)' : BORD}`,
                  color: filter === f.key ? GOLD : MUTED,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', border: `1px solid ${BORD}`, borderRadius: 12, background: CARD }}>
            {listError ? (
              <div style={{ padding: 16, fontSize: 12.5, color: RED }}>读取失败:{listError}</div>
            ) : !emails ? (
              <div style={{ padding: 16, fontSize: 12.5, color: MUTED }}>加载中…</div>
            ) : displayedEmails.length === 0 ? (
              <div style={{ padding: 16, fontSize: 12.5, color: MUTED }}>暂无邮件</div>
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
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                );
              })
            )}
          </div>
        </div>

        {/* ── Right: thread + chat ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 14 }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 13, border: `1px solid ${BORD}`, borderRadius: 12, background: CARD }}>
              从左侧选择一封邮件开始
            </div>
          ) : (
            <>
              {/* Thread detail */}
              <div style={{ maxHeight: '38%', overflowY: 'auto', border: `1px solid ${BORD}`, borderRadius: 12, background: CARD, padding: '14px 16px', flexShrink: 0 }}>
                {threadError ? (
                  <div style={{ fontSize: 12.5, color: RED }}>读取失败:{threadError}</div>
                ) : !threadMessages ? (
                  <div style={{ fontSize: 12.5, color: MUTED }}>加载邮件内容…</div>
                ) : (
                  threadMessages.map((m, i) => (
                    <div key={m.id} style={{ marginBottom: i < threadMessages.length - 1 ? 16 : 0, paddingBottom: i < threadMessages.length - 1 ? 14 : 0, borderBottom: i < threadMessages.length - 1 ? `1px solid ${BORD}` : 'none' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{m.subject || '(无主题)'}</div>
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
                  ))
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
