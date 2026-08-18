// GCI Executive Desk — Task 12: Business Assistant / 商务助理.
// Customer-centric orchestration: resolve a customer/company name once,
// aggregate CRM/Gmail/Drive/Quotation/Commitments/Decisions/Boss Actions/
// Calendar, show a fact-based summary + chat. Every write (CRM follow-up,
// reminder, new customer) requires an explicit confirm click. WhatsApp is
// draft-only — never sent. Switching customers always resets chat/drafts.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { createCustomerWithContact, setCustomerActive } from '../lib/crmSupabase';
import {
  resolveBusinessContext, buildBusinessSummaryFacts, buildContextSummaryForAI,
  type BusinessContext,
} from '../lib/businessContext';
import {
  sendBusinessAssistantChat, parseFollowupDraftFromChat, confirmFollowupDraft,
  parseReminderDraftFromChat, confirmReminderDraft,
  type ChatTurn, type WhatsappDraft, type FollowupDraft, type ReminderDraft,
} from '../lib/businessAssistant';
import {
  classifyCapture, resolveCaptureItems, confirmCaptureItem,
  matchTaskLifecycleCommand, findOpenTasksByKeyword, completeOrCancelTask,
  type ResolvedCaptureItem,
} from '../lib/businessCapture';
import {
  classifyFileDescription, uploadFileToDrive, registerFile, findCurrentRegistryEntry,
  searchFileRegistryByQuery, searchDriveFallback, looksLikeFileSeek,
  DEFAULT_TARGET_FOLDER_ID, DEFAULT_TARGET_FOLDER_NAME,
  type FileClassification, type GiaFileRegistryRow,
} from '../lib/giaFiles';
import { getChanyaStatus } from '../lib/chanya';
import { matchChanyaStatusQuery, formatChanyaStatusReply } from '../ai/chanyaAskGciParsers';
import type { ExecutiveTask } from '../lib/executiveTasks';
import type { CrmCustomer } from '../lib/crmSupabase';

const CAPTURABLE = new Set(['NEW_CUSTOMER', 'CRM_FOLLOWUP', 'BUSINESS_TODO', 'COMMITMENT', 'DECISION']);
const LOOKUP_PREFIX_RE = /^(现在看|看看|看一下|查一下|查看|帮我看看|帮我看)\s*/u;

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const GREEN = '#6FBF8E';
const MUTED = '#7A8494';
const SUBTLE = '#5A6A84';
const TEXT = colors.textPrimary;
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

const QUICK_PROMPTS = [
  { label: '现在进展到哪里？', text: '现在进展到哪里？' },
  { label: '上次报价多少？', text: '上次报价多少钱？' },
  { label: '文件在哪里？', text: '相关的方案/合同文件在哪里？' },
  { label: '我答应过什么？', text: '我答应过他什么还没做？' },
  { label: '下一步怎么推进？', text: '下一步该怎么推进？我要不要今天联系他？' },
  { label: '帮我写 WhatsApp', text: '帮我写一条 WhatsApp 给他。' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dubai = new Date(d.getTime() + 4 * 3600 * 1000);
  const mo = String(dubai.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dubai.getUTCDate()).padStart(2, '0');
  return `${mo}/${da}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>{children}</div>;
}

export function BusinessAssistant() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [inputValue, setInputValue] = useState('');
  const [ctx, setCtx] = useState<BusinessContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedAction, setSuggestedAction] = useState<string | null>(null);

  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [whatsappDraft, setWhatsappDraft] = useState<WhatsappDraft | null>(null);

  const [pendingFollowup, setPendingFollowup] = useState<FollowupDraft | null>(null);
  const [pendingReminder, setPendingReminder] = useState<ReminderDraft | null>(null);
  const [writeBusy, setWriteBusy] = useState(false);
  const [writeMsg, setWriteMsg] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  // CRM Customer Archive — soft deactivate/restore, confirm-gated like
  // every other write on this page. Never deletes anything.
  const [showArchiveForm, setShowArchiveForm] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveErr, setArchiveErr] = useState<string | null>(null);

  // Task 16 — Chat-First Business Capture: works with or without a resolved
  // customer context. pendingCapture holds one or more items from a single
  // input (multi-intent split), each confirmed independently or all at once.
  const [captureLoading, setCaptureLoading] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [pendingCapture, setPendingCapture] = useState<ResolvedCaptureItem[] | null>(null);
  const [captureBusy, setCaptureBusy] = useState<number | 'all' | null>(null);
  const [captureDone, setCaptureDone] = useState<Set<number>>(new Set());
  const [pendingTaskLifecycle, setPendingTaskLifecycle] = useState<{ action: 'completed' | 'cancelled'; matches: ExecutiveTask[] } | null>(null);

  // Task 17 — GIA File Inbox: chat-first upload + registry search. Works
  // with or without a resolved customer, same as Business Capture.
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadClassification, setUploadClassification] = useState<FileClassification | null>(null);
  const [uploadIsCurrent, setUploadIsCurrent] = useState(true);
  const [uploadVersionConflict, setUploadVersionConflict] = useState<GiaFileRegistryRow | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{ webViewLink: string; displayName: string } | null>(null);
  const [fileSearchReply, setFileSearchReply] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const didAutoResolve = useRef(false);

  function resetChat() {
    setChatHistory([]);
    setChatInput('');
    setChatError(null);
    setWhatsappDraft(null);
    setPendingFollowup(null);
    setPendingReminder(null);
    setWriteMsg(null);
    setSuggestedAction(null);
    setShowCreateForm(false);
    setCreateErr(null);
    setPendingCapture(null);
    setCaptureError(null);
    setCaptureDone(new Set());
    setPendingTaskLifecycle(null);
    setFileSearchReply(null);
  }

  // Task 16 §18 — "肯尼亚保姆这个事情完成了。" Checked before capture
  // classification since it's a lifecycle command on an EXISTING task, not
  // new content to capture.
  async function tryTaskLifecycleCommand(text: string): Promise<boolean> {
    const m = matchTaskLifecycleCommand(text);
    if (!m) return false;
    const res = await findOpenTasksByKeyword(m.keyword);
    if (!res.ok || res.matches.length === 0) return false;
    setPendingTaskLifecycle({ action: m.action, matches: res.matches });
    return true;
  }

  // Task 17 §6 — "找Highway最新营业执照" / "客户要产品目录" / "找MAG的方案" /
  // "Ray上次报价在哪里". Rule-based only (no AI call), and only "consumed"
  // when a search actually returns a hit — an accidental keyword match on
  // unrelated chat (e.g. bare "要") is harmless and falls through untouched
  // to normal capture/AI handling, so this can never regress existing
  // behavior on an empty or non-matching registry.
  async function tryFileSearch(text: string): Promise<string | null> {
    if (!looksLikeFileSeek(text)) return null;
    const registryHits = await searchFileRegistryByQuery(text);
    if (registryHits.length > 0) {
      const lines = registryHits.slice(0, 5).map((h) => `${h.is_current ? '✓ 当前版本' : '（旧版本）'} ${h.display_name} — ${h.drive_url}`);
      return `在 GIA 文件库中找到：\n${lines.join('\n')}`;
    }
    const driveHits = await searchDriveFallback(text);
    if (driveHits.length > 0) {
      const lines = driveHits.slice(0, 5).map((h) => `${h.name} — ${h.webViewLink}`);
      return `GIA 文件库中暂未登记，但在 Drive 中找到：\n${lines.join('\n')}`;
    }
    return null;
  }

  // Task 18.1 — "Chanya今天有多少新用户？" / "今天有人付款吗？" / "Chanya今天
  // 收入多少？" / "有没有支付失败？" / "有没有用户需要我处理？" / "Chanya系统
  // 有没有异常？". Read-only, always answers when the question is clearly
  // about Chanya (unlike file search, no need to gate on a non-empty result —
  // "not connected yet" is itself a valid, honest answer to show).
  async function tryChanyaStatusQuery(text: string): Promise<string | null> {
    if (!matchChanyaStatusQuery(text)) return null;
    const res = await getChanyaStatus();
    if (res.ok) return formatChanyaStatusReply(res.data, null);
    return formatChanyaStatusReply(null, res.error);
  }

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadFile(e.target.files?.[0] ?? null);
    setUploadClassification(null);
    setUploadResult(null);
    setUploadErr(null);
    setUploadVersionConflict(null);
  }

  function handleClassifyUpload() {
    if (!uploadFile) return;
    setUploadClassification(classifyFileDescription(uploadDescription, uploadFile.name));
    setUploadVersionConflict(null);
    setUploadErr(null);
  }

  // Version rule (Task 17 §7): if this is stated as the latest version and
  // the registry already has a same-type/company current file, confirm
  // first — first click only surfaces the conflict, second click (conflict
  // already shown) proceeds to actually replace it. The old file is never
  // deleted, only flipped to is_current=false.
  async function handleConfirmUpload() {
    if (!uploadFile || !uploadClassification) return;
    setUploadErr(null);

    if (uploadIsCurrent && !uploadVersionConflict) {
      setUploadBusy(true);
      const existing = await findCurrentRegistryEntry(uploadClassification.documentType, uploadClassification.companyName);
      setUploadBusy(false);
      if (existing) {
        setUploadVersionConflict(existing);
        return;
      }
    }

    setUploadBusy(true);
    const up = await uploadFileToDrive(uploadFile, DEFAULT_TARGET_FOLDER_ID, uploadFile.name);
    if (!up.ok) {
      setUploadErr(up.error);
      setUploadBusy(false);
      return;
    }

    const reg = await registerFile({
      fileName: uploadFile.name,
      displayName: uploadClassification.displayName,
      documentType: uploadClassification.documentType,
      businessArea: uploadClassification.businessArea,
      companyName: uploadClassification.companyName,
      customerId: ctx?.customer?.id ?? null,
      driveFileId: up.fileId,
      driveUrl: up.webViewLink,
      driveFolder: DEFAULT_TARGET_FOLDER_NAME,
      isCurrent: uploadIsCurrent,
      tags: uploadClassification.tags,
    });
    setUploadBusy(false);
    if (!reg.ok) {
      setUploadErr(reg.error);
      return;
    }

    setUploadResult({ webViewLink: up.webViewLink, displayName: uploadClassification.displayName });
    setUploadFile(null);
    setUploadDescription('');
    setUploadClassification(null);
    setUploadVersionConflict(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleConfirmTaskLifecycle(taskId: string) {
    if (!pendingTaskLifecycle) return;
    setCaptureBusy('all');
    const res = await completeOrCancelTask(taskId, pendingTaskLifecycle.action);
    setCaptureBusy(null);
    if (res.ok) {
      setChatHistory((prev) => [...prev, { role: 'assistant', content: `✓ 已标记为${pendingTaskLifecycle.action === 'completed' ? '完成' : '取消'}。` }]);
      setPendingTaskLifecycle(null);
    } else {
      setCaptureError(res.error);
    }
  }

  // Task 16 §三/§十二 — the unified router. Runs on both the top input
  // (works with no customer loaded yet) and the chat box (works with a
  // customer already loaded, so "他"/"这个客户" resolves via ctx.customer).
  // Returns true if it consumed the input (capture flow shown or lookup
  // fallback triggered) so callers skip their own default handling.
  async function tryBusinessCapture(text: string, currentCustomer: CrmCustomer | null): Promise<boolean> {
    const t = text.trim();
    if (!t) return false;

    if (await tryTaskLifecycleCommand(t)) return true;

    setCaptureLoading(true);
    setCaptureError(null);
    const cls = await classifyCapture(t, currentCustomer?.customer_name ?? null);
    setCaptureLoading(false);
    if (!cls.ok) {
      setCaptureError(cls.error);
      return false;
    }
    const capturable = cls.intents.filter((it) => CAPTURABLE.has(it.type));
    if (capturable.length === 0) return false;

    const resolved = await resolveCaptureItems(capturable, currentCustomer);
    setCaptureDone(new Set());
    setPendingCapture(resolved);
    return true;
  }

  async function handleConfirmCaptureItem(index: number) {
    if (!pendingCapture) return;
    const item = pendingCapture[index];
    setCaptureBusy(index);
    const res = await confirmCaptureItem(item);
    setCaptureBusy(null);
    if (res.ok) {
      setCaptureDone((prev) => new Set(prev).add(index));
    } else {
      setCaptureError(res.error);
    }
  }

  async function handleConfirmAllCapture() {
    if (!pendingCapture) return;
    setCaptureBusy('all');
    const newlyDone = new Set(captureDone);
    for (let i = 0; i < pendingCapture.length; i++) {
      if (newlyDone.has(i)) continue;
      if (pendingCapture[i].candidateCustomers) continue; // needs Chris to pick first
      const res = await confirmCaptureItem(pendingCapture[i]);
      if (res.ok) newlyDone.add(i);
      else { setCaptureError(res.error); break; }
    }
    setCaptureDone(newlyDone);
    setCaptureBusy(null);
  }

  function pickCandidateCustomer(index: number, customer: CrmCustomer) {
    if (!pendingCapture) return;
    const next = [...pendingCapture];
    const item = next[index];
    // Picking an existing candidate always means "record against this real
    // customer" — never create a duplicate, even if the original text read
    // like a new-customer introduction.
    next[index] = {
      ...item,
      type: item.type === 'NEW_CUSTOMER' ? 'CRM_FOLLOWUP' : item.type,
      matchedCustomer: customer,
      candidateCustomers: null,
      isNewCustomer: false,
    };
    setPendingCapture(next);
  }

  function createAsNewInstead(index: number) {
    if (!pendingCapture) return;
    const next = [...pendingCapture];
    next[index] = { ...next[index], matchedCustomer: null, candidateCustomers: null, isNewCustomer: true, type: 'NEW_CUSTOMER' };
    setPendingCapture(next);
  }

  async function resolve(name: string, autoQuestion?: string) {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    setCtx(null);
    resetChat();

    const result = await resolveBusinessContext(name.trim());
    setCtx(result);
    setLoading(false);

    if (result.found || result.potentialCustomer) {
      const summary = buildContextSummaryForAI(result);
      sendBusinessAssistantChat({
        contextSummary: summary,
        question: '基于以上信息，用一句话给出你建议我接下来采取的动作（这只是你的建议，不是事实）。',
        history: [],
      }).then((res) => { if (res.ok) setSuggestedAction(res.reply); });
    }

    if (autoQuestion) {
      setTimeout(() => handleSendWithContext(result, autoQuestion), 300);
    }
  }

  // Task 16 — the top input is now chat-first: try Business Capture (new
  // customer / follow-up / to-do / commitment / decision / task lifecycle)
  // before falling back to the Task 12 customer/company lookup. Works with
  // no customer loaded yet (ctx may be null).
  // A bare identifier with no punctuation/spaces ("MAG" / "TestCorpMAG16" /
  // "Ray") is always a customer switch, never something to capture — even
  // with a different customer already loaded, the classifier can otherwise
  // mistake a short standalone name for a passing mention and swallow it
  // into a content-free CRM_FOLLOWUP instead of switching context.
  const BARE_NAME_RE = /^[^\s，。！？,.:：；;]{1,24}$/u;

  async function handleTopSubmit(text: string) {
    const t = text.trim();
    if (!t) return;
    setFileSearchReply(null);
    if (BARE_NAME_RE.test(t)) {
      resolve(t);
      return;
    }
    const searchReply = await tryFileSearch(t);
    if (searchReply) {
      setFileSearchReply(searchReply);
      return;
    }
    const chanyaReply = await tryChanyaStatusQuery(t);
    if (chanyaReply) {
      setFileSearchReply(chanyaReply);
      return;
    }
    const consumed = await tryBusinessCapture(t, ctx?.customer ?? null);
    if (consumed) return;
    const stripped = t.replace(LOOKUP_PREFIX_RE, '').trim() || t;
    resolve(stripped);
  }

  useEffect(() => {
    if (didAutoResolve.current) return;
    const customerParam = searchParams.get('customer');
    const qParam = searchParams.get('q');
    if (customerParam) {
      didAutoResolve.current = true;
      setInputValue(customerParam);
      resolve(customerParam, qParam || undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading, pendingFollowup, pendingReminder]);

  async function handleSendWithContext(context: BusinessContext, text: string) {
    const question = text.trim();
    if (!question) return;

    if (context.customer) {
      const followupDraft = parseFollowupDraftFromChat(context.customer.customer_name, question);
      if (followupDraft) {
        setChatHistory((prev) => [...prev, { role: 'user', content: question }]);
        setPendingFollowup(followupDraft);
        return;
      }
      const reminderDraft = parseReminderDraftFromChat(question);
      if (reminderDraft) {
        setChatHistory((prev) => [...prev, { role: 'user', content: question }]);
        setPendingReminder(reminderDraft);
        return;
      }
    }

    // Task 17 — same file-search check as the top input, so it also works
    // mid-conversation ("找一下他的报价单在哪里" while a customer is loaded).
    const searchReply = await tryFileSearch(question);
    if (searchReply) {
      setChatHistory((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: searchReply }]);
      return;
    }

    // Task 18.1 — same Chanya status check as the top input, works mid-
    // conversation too.
    const chanyaReply = await tryChanyaStatusQuery(question);
    if (chanyaReply) {
      setChatHistory((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: chanyaReply }]);
      return;
    }

    // Task 16 — continuous-chat capture: "刚跟他聊了，周四再联系" / "我答应明天给他方案"
    // etc. "他"/"这个客户" resolves via context.customer, passed to the classifier.
    const captured = await tryBusinessCapture(question, context.customer);
    if (captured) {
      setChatHistory((prev) => [...prev, { role: 'user', content: question }]);
      return;
    }

    setChatError(null);
    setWhatsappDraft(null);
    const nextHistory: ChatTurn[] = [...chatHistory, { role: 'user', content: question }];
    setChatHistory(nextHistory);
    setChatLoading(true);

    const res = await sendBusinessAssistantChat({
      contextSummary: buildContextSummaryForAI(context),
      question,
      history: chatHistory,
    });
    setChatLoading(false);
    if (res.ok) {
      setChatHistory((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      if (res.whatsappDraft) setWhatsappDraft(res.whatsappDraft);
    } else {
      setChatError(res.error);
    }
  }

  function handleSend(text?: string) {
    const question = (text ?? chatInput).trim();
    if (!question || !ctx || chatLoading) return;
    setChatInput('');
    handleSendWithContext(ctx, question);
  }

  async function handleConfirmFollowup() {
    if (!ctx?.customer || !pendingFollowup) return;
    setWriteBusy(true);
    const res = await confirmFollowupDraft(ctx.customer.id, pendingFollowup);
    setWriteBusy(false);
    if (res.ok) {
      setCtx((prev) => (prev ? { ...prev, customer: res.customer } : prev));
      setChatHistory((prev) => [...prev, { role: 'assistant', content: '✓ 已记录跟进并更新客户资料。' }]);
      setWriteMsg(null);
    } else {
      setWriteMsg(res.error);
    }
    setPendingFollowup(null);
  }

  async function handleConfirmReminder() {
    if (!ctx?.customer || !pendingReminder) return;
    setWriteBusy(true);
    const res = await confirmReminderDraft(ctx.customer.id, pendingReminder);
    setWriteBusy(false);
    if (res.ok) {
      setCtx((prev) => (prev ? { ...prev, customer: res.customer } : prev));
      setChatHistory((prev) => [...prev, { role: 'assistant', content: `✓ 已设置下次跟进日期:${pendingReminder.targetDate}` }]);
      setWriteMsg(null);
    } else {
      setWriteMsg(res.error);
    }
    setPendingReminder(null);
  }

  async function handleCreateCustomer() {
    if (!ctx) return;
    setCreateBusy(true);
    setCreateErr(null);
    const firstEmail = ctx.emails[0];
    const res = await createCustomerWithContact({
      customerName: ctx.queryName,
      email: firstEmail ? firstEmail.sender.match(/<([^>]+)>/)?.[1] || undefined : undefined,
    });
    setCreateBusy(false);
    if (res.ok) {
      resolve(ctx.queryName);
    } else {
      setCreateErr(res.error);
    }
  }

  async function handleArchiveCustomer() {
    if (!ctx?.customer) return;
    setArchiveBusy(true);
    setArchiveErr(null);
    const res = await setCustomerActive(ctx.customer.id, false, archiveReason.trim() || undefined);
    setArchiveBusy(false);
    if (res.ok) {
      setCtx((prev) => (prev ? { ...prev, customer: res.customer } : prev));
      setShowArchiveForm(false);
      setArchiveReason('');
    } else {
      setArchiveErr(res.error);
    }
  }

  async function handleRestoreCustomer() {
    if (!ctx?.customer) return;
    setArchiveBusy(true);
    setArchiveErr(null);
    const res = await setCustomerActive(ctx.customer.id, true);
    setArchiveBusy(false);
    if (res.ok) {
      setCtx((prev) => (prev ? { ...prev, customer: res.customer } : prev));
    } else {
      setArchiveErr(res.error);
    }
  }

  const facts = ctx ? buildBusinessSummaryFacts(ctx) : null;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 28px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}
        >
          ← 返回
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>
          GIA｜GCI 智能商务助理
        </h1>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && inputValue.trim() && !captureLoading) handleTopSubmit(inputValue); }}
          placeholder="输入客户/公司，或直接告诉我发生了什么…例如 MAG / 今天认识了新客户MAG，需要80个工人 / 肯尼亚保姆这周再跟一下"
          style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: TEXT, fontSize: 14 }}
        />
        <button
          onClick={() => handleTopSubmit(inputValue)}
          disabled={!inputValue.trim() || loading || captureLoading}
          style={{ padding: '12px 22px', borderRadius: 10, background: `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: '#080D1E', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          {captureLoading ? '理解中…' : '发送'}
        </button>
        <button
          onClick={() => setShowUploadPanel((v) => !v)}
          style={{ padding: '12px 16px', borderRadius: 10, background: showUploadPanel ? 'rgba(203,168,92,0.14)' : 'rgba(255,255,255,0.05)', border: `1px solid ${showUploadPanel ? 'rgba(203,168,92,0.4)' : 'rgba(255,255,255,0.12)'}`, color: showUploadPanel ? GOLD : MUTED, fontSize: 13, cursor: 'pointer' }}
        >
          📎 文件
        </button>
      </div>

      {showUploadPanel && (
        <div style={{ padding: '16px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: GOLD, marginBottom: 10 }}>GIA 文件收纳 · 上传并登记</div>
          <input ref={fileInputRef} type="file" onChange={handlePickFile} style={{ marginBottom: 10, fontSize: 12.5, color: MUTED, display: 'block' }} />
          <input
            value={uploadDescription}
            onChange={(e) => setUploadDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && uploadFile) handleClassifyUpload(); }}
            placeholder="这是什么文件？例如：Highway 营业执照 / GCI 产品目录 最新版"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: TEXT, fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }}
          />
          <button disabled={!uploadFile} onClick={handleClassifyUpload} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, cursor: uploadFile ? 'pointer' : 'not-allowed', background: 'rgba(203,168,92,0.14)', border: '1px solid rgba(203,168,92,0.4)', color: GOLD, opacity: uploadFile ? 1 : 0.5 }}>
            识别
          </button>

          {uploadClassification && (
            <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 9, border: `1px solid ${BORD}` }}>
              <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 4 }}>文件名:<span style={{ color: TEXT }}> {uploadFile?.name}</span></div>
              <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 4 }}>类型:<span style={{ color: TEXT }}> {uploadClassification.documentTypeLabel}</span></div>
              <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 4 }}>公司:<span style={{ color: TEXT }}> {uploadClassification.companyName || '未识别'}</span></div>
              <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 4 }}>业务:<span style={{ color: TEXT }}> {uploadClassification.businessArea || '未分类'}</span></div>
              <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 4 }}>目标目录:<span style={{ color: TEXT }}> GCI_MASTER_LIBRARY / {DEFAULT_TARGET_FOLDER_NAME}</span></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: MUTED, marginTop: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={uploadIsCurrent} onChange={(e) => { setUploadIsCurrent(e.target.checked); setUploadVersionConflict(null); }} />
                设为该类型/公司的最新版本
              </label>

              {uploadVersionConflict && (
                <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(212,168,67,0.08)', borderRadius: 7 }}>
                  <div style={{ fontSize: 11.5, color: AMBER }}>
                    已存在当前版本「{uploadVersionConflict.display_name}」，确认后将替换为最新（旧文件不会被删除，仍可在 Drive 中打开）。
                  </div>
                </div>
              )}

              {uploadErr && <div style={{ fontSize: 11.5, color: RED, marginTop: 8 }}>{uploadErr}</div>}

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button disabled={uploadBusy} onClick={handleConfirmUpload} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}>
                  {uploadBusy ? '处理中…' : uploadVersionConflict ? '确认替换并上传' : '确认上传并登记'}
                </button>
                <button onClick={() => { setUploadClassification(null); setUploadVersionConflict(null); }} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>取消</button>
              </div>
            </div>
          )}

          {uploadResult && (
            <div style={{ marginTop: 10, fontSize: 12, color: GREEN }}>
              ✓ 已上传并登记:{uploadResult.displayName} — <a href={uploadResult.webViewLink} target="_blank" rel="noreferrer" style={{ color: GOLD }}>在 Drive 中打开</a>
            </div>
          )}
        </div>
      )}

      {fileSearchReply && (
        <div style={{ padding: '16px 20px', background: 'rgba(203,168,92,0.05)', border: '1px solid rgba(203,168,92,0.25)', borderRadius: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: GOLD, marginBottom: 8 }}>GIA 文件查找结果</div>
          <div style={{ fontSize: 12.5, color: TEXT, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{fileSearchReply}</div>
          <button onClick={() => setFileSearchReply(null)} style={{ marginTop: 10, padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>关闭</button>
        </div>
      )}

      {captureLoading && <div style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>正在理解…</div>}
      {captureError && <div style={{ fontSize: 13, color: RED, marginBottom: 16 }}>{captureError}</div>}

      {pendingTaskLifecycle && (
        <div style={{ padding: '16px 20px', background: 'rgba(203,168,92,0.05)', border: '1px solid rgba(203,168,92,0.25)', borderRadius: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: GOLD, marginBottom: 8 }}>
            {pendingTaskLifecycle.matches.length > 1 ? '找到多个匹配的待办，请选择：' : `将标记为${pendingTaskLifecycle.action === 'completed' ? '完成' : '取消'}：`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pendingTaskLifecycle.matches.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                <span style={{ fontSize: 12.5, color: TEXT }}>{t.title}</span>
                <button disabled={captureBusy === 'all'} onClick={() => handleConfirmTaskLifecycle(t.id)} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}>确认</button>
              </div>
            ))}
          </div>
          <button onClick={() => setPendingTaskLifecycle(null)} style={{ marginTop: 8, padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>取消</button>
        </div>
      )}

      {pendingCapture && pendingCapture.length > 0 && (
        <div style={{ padding: '16px 20px', background: 'rgba(203,168,92,0.05)', border: '1px solid rgba(203,168,92,0.25)', borderRadius: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: GOLD, marginBottom: 10 }}>
            商务助理理解为{pendingCapture.length > 1 ? `（共 ${pendingCapture.length} 项）` : ''}：
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {pendingCapture.map((item, i) => {
              const done = captureDone.has(i);
              return (
                <div key={i} style={{ padding: '10px 14px', background: done ? 'rgba(111,191,142,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${done ? 'rgba(111,191,142,0.3)' : BORD}`, borderRadius: 9 }}>
                  <div style={{ fontSize: 10, color: '#8FA6D4', marginBottom: 4 }}>[{i + 1}] {item.type}</div>
                  {item.summaryLines.map((l, li) => (
                    <div key={li} style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.6 }}>{l}</div>
                  ))}

                  {item.candidateCustomers && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11.5, color: AMBER, marginBottom: 6 }}>我找到可能已有的客户：</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {item.candidateCustomers.map((c) => (
                          <button key={c.id} onClick={() => pickCandidateCustomer(i, c)} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT }}>
                            使用「{c.customer_name}」
                          </button>
                        ))}
                        <button onClick={() => createAsNewInstead(i)} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(203,168,92,0.1)', border: '1px solid rgba(203,168,92,0.3)', color: GOLD }}>
                          创建新客户
                        </button>
                      </div>
                    </div>
                  )}

                  {!item.candidateCustomers && !done && (
                    <button
                      disabled={captureBusy === i || captureBusy === 'all'}
                      onClick={() => handleConfirmCaptureItem(i)}
                      style={{ marginTop: 8, padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}
                    >
                      {captureBusy === i ? '写入中…' : '确认此项'}
                    </button>
                  )}
                  {done && <div style={{ marginTop: 6, fontSize: 11.5, color: GREEN }}>✓ 已保存</div>}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={captureBusy === 'all'}
              onClick={handleConfirmAllCapture}
              style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: '#080D1E', fontWeight: 700 }}
            >
              {captureBusy === 'all' ? '保存中…' : '全部确认'}
            </button>
            <button onClick={() => { setPendingCapture(null); setCaptureDone(new Set()); }} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
              取消
            </button>
          </div>
        </div>
      )}

      {loading && <div style={{ fontSize: 13, color: MUTED }}>正在聚合客户数据…</div>}
      {error && <div style={{ fontSize: 13, color: RED }}>读取失败:{error}</div>}

      {ctx && !ctx.found && !ctx.potentialCustomer && (
        <div style={{ padding: '18px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 13, color: MUTED }}>
          未找到与「{ctx.queryName}」相关的 CRM 记录、邮件或文件。
        </div>
      )}

      {ctx && ctx.potentialCustomer && (
        <div style={{ padding: '16px 20px', background: 'rgba(203,168,92,0.05)', border: '1px solid rgba(203,168,92,0.25)', borderRadius: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: GOLD, marginBottom: 6 }}>未建档客户 / Potential Customer</div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
            「{ctx.queryName}」尚未在 CRM 建档,但在 Gmail/Drive 中找到 {ctx.emails.length} 封邮件、{ctx.driveFiles.length} 个文件。
          </div>
          {!showCreateForm ? (
            <button onClick={() => setShowCreateForm(true)} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'rgba(203,168,92,0.14)', border: '1px solid rgba(203,168,92,0.4)', color: GOLD }}>
              创建为 CRM 客户
            </button>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: TEXT, marginBottom: 8 }}>将以「{ctx.queryName}」创建新 CRM 客户{ctx.emails[0] ? `,联系邮箱取自最近邮件` : ''}。</div>
              {createErr && <div style={{ fontSize: 12, color: RED, marginBottom: 8 }}>{createErr}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={createBusy} onClick={handleCreateCustomer} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}>
                  {createBusy ? '创建中…' : '确认创建'}
                </button>
                <button onClick={() => setShowCreateForm(false)} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>取消</button>
              </div>
            </div>
          )}
        </div>
      )}

      {ctx && (ctx.found || ctx.potentialCustomer) && facts && (
        <div style={{ display: 'flex', gap: 20 }}>
          {/* ── Left: summary + data sections ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ padding: '18px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, marginBottom: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 10 }}>{ctx.customer?.customer_name || ctx.queryName}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 12.5, color: MUTED }}>
                <div>当前阶段:<span style={{ color: TEXT }}> {facts.stage || '未知'}</span></div>
                <div>业务类别:<span style={{ color: TEXT }}> {facts.businessCategory || '未分类'}</span></div>
                <div>最近联系:<span style={{ color: TEXT }}> {formatDate(facts.lastContact)}</span></div>
                <div>最近邮件:<span style={{ color: TEXT }}> {formatDate(facts.lastEmail)}</span></div>
                <div>最近报价:<span style={{ color: TEXT }}> {facts.lastQuoteAmount != null ? `${facts.lastQuoteCurrency || 'AED'} ${facts.lastQuoteAmount}` : '无'}</span></div>
                <div>未完成承诺:<span style={{ color: TEXT }}> {facts.openCommitments}</span></div>
                <div>下次跟进:<span style={{ color: TEXT }}> {formatDate(facts.nextFollowUp)}</span></div>
                <div>风险:<span style={{ color: facts.riskNote ? RED : TEXT }}> {facts.riskNote || '暂无明确风险'}</span></div>
              </div>
              {suggestedAction && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORD}`, fontSize: 12.5, color: GOLD }}>
                  <strong>AI 建议动作:</strong> {suggestedAction}
                </div>
              )}
            </div>

            {ctx.customer && !ctx.customer.is_active && (
              <div style={{ padding: '12px 16px', background: 'rgba(224,132,106,0.06)', border: `1px solid ${RED}40`, borderRadius: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: RED, marginBottom: 4 }}>此客户已停用</div>
                <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 8 }}>
                  {ctx.customer.archived_at ? `停用于 ${formatDate(ctx.customer.archived_at)}` : ''}
                  {ctx.customer.archive_reason ? ` · ${ctx.customer.archive_reason}` : ''}
                  ——历史跟进/报价/承诺记录均未删除，随时可恢复。
                </div>
                {archiveErr && <div style={{ fontSize: 11.5, color: RED, marginBottom: 6 }}>{archiveErr}</div>}
                <button disabled={archiveBusy} onClick={handleRestoreCustomer} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}>
                  {archiveBusy ? '恢复中…' : '恢复客户'}
                </button>
              </div>
            )}

            {ctx.customer && (
              <div style={{ padding: '14px 16px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, marginBottom: 14 }}>
                <SectionLabel>CRM</SectionLabel>
                <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.7 }}>
                  负责人:{ctx.customer.owner || '未知'} · 优先级:{ctx.customer.priority || '未知'}<br />
                  {ctx.customer.next_action && <>下一步:{ctx.customer.next_action}<br /></>}
                  {ctx.contacts.length > 0 && <>联系人:{ctx.contacts.map((c) => c.contact_name).filter(Boolean).join('、')}</>}
                </div>
                {ctx.customer.is_active && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORD}` }}>
                    {!showArchiveForm ? (
                      <span onClick={() => setShowArchiveForm(true)} style={{ fontSize: 11, color: MUTED, cursor: 'pointer' }}>
                        停用客户…
                      </span>
                    ) : (
                      <div>
                        <input
                          value={archiveReason}
                          onChange={(e) => setArchiveReason(e.target.value)}
                          placeholder="停用原因（可选）"
                          style={{ width: '100%', padding: '6px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: TEXT, fontSize: 11.5, marginBottom: 6, boxSizing: 'border-box' }}
                        />
                        {archiveErr && <div style={{ fontSize: 11.5, color: RED, marginBottom: 6 }}>{archiveErr}</div>}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button disabled={archiveBusy} onClick={handleArchiveCustomer} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(224,132,106,0.12)', border: `1px solid ${RED}40`, color: RED }}>
                            {archiveBusy ? '停用中…' : '确认停用'}
                          </button>
                          <button onClick={() => { setShowArchiveForm(false); setArchiveReason(''); }} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>取消</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {ctx.emails.length > 0 && (
              <div style={{ padding: '14px 16px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, marginBottom: 14 }}>
                <SectionLabel>最近邮件 · {ctx.emails.length}</SectionLabel>
                {ctx.emails.slice(0, 5).map((m) => (
                  <a key={m.id} href={`/email-assistant?threadId=${encodeURIComponent(m.threadId)}`} style={{ display: 'block', fontSize: 12, color: TEXT, textDecoration: 'none', padding: '6px 0', borderBottom: `1px solid ${BORD}` }}>
                    <span style={{ color: GOLD }}>{m.subject || '(无主题)'}</span> <span style={{ color: SUBTLE }}>· {m.sender} · {m.date}</span>
                  </a>
                ))}
              </div>
            )}

            {ctx.driveFiles.length > 0 && (
              <div style={{ padding: '14px 16px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, marginBottom: 14 }}>
                <SectionLabel>相关文件 · {ctx.driveFiles.length}</SectionLabel>
                {ctx.driveFiles.slice(0, 5).map((f) => (
                  <a key={f.id} href={f.webViewLink} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12, color: TEXT, textDecoration: 'none', padding: '6px 0', borderBottom: `1px solid ${BORD}` }}>
                    📄 {f.name}
                  </a>
                ))}
              </div>
            )}

            {ctx.quotations && ctx.quotations.quotes.length > 0 && (
              <div style={{ padding: '14px 16px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, marginBottom: 14 }}>
                <SectionLabel>历史报价 · {ctx.quotations.total}</SectionLabel>
                {ctx.quotations.quotes.slice(0, 5).map((q) => (
                  <div key={q.id} style={{ fontSize: 12, color: MUTED, padding: '6px 0', borderBottom: `1px solid ${BORD}` }}>
                    {q.quoteDate || q.createdAt} · {q.quoteNo} · <span style={{ color: TEXT }}>{q.grandTotal ?? q.sellingTotal ?? '—'} {q.currency}</span> · {q.statusZh || q.status}
                  </div>
                ))}
                <a href="/trade?tab=history" style={{ fontSize: 11, color: GOLD, textDecoration: 'none' }}>查看全部报价 →</a>
              </div>
            )}

            {(ctx.commitments.length > 0 || ctx.decisions.length > 0) && (
              <div style={{ padding: '14px 16px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, marginBottom: 14 }}>
                {ctx.commitments.length > 0 && (
                  <>
                    <SectionLabel>未完成承诺 · {ctx.commitments.length}</SectionLabel>
                    {ctx.commitments.map((c) => (
                      <div key={c.id} style={{ fontSize: 12, color: MUTED, padding: '4px 0' }}>{c.commitment_text}{c.due_at ? ` (${formatDate(c.due_at)})` : ''}</div>
                    ))}
                    <a href="/commitments" style={{ fontSize: 11, color: GOLD, textDecoration: 'none' }}>查看承诺事项 →</a>
                  </>
                )}
                {ctx.decisions.length > 0 && (
                  <>
                    <div style={{ marginTop: ctx.commitments.length > 0 ? 10 : 0 }}><SectionLabel>相关决定 · {ctx.decisions.length}</SectionLabel></div>
                    {ctx.decisions.slice(0, 3).map((d) => (
                      <div key={d.id} style={{ fontSize: 12, color: MUTED, padding: '4px 0' }}>{d.title}({d.status})</div>
                    ))}
                    <a href="/decisions" style={{ fontSize: 11, color: GOLD, textDecoration: 'none' }}>查看决定 →</a>
                  </>
                )}
              </div>
            )}

            {ctx.bossActions.length > 0 && (
              <div style={{ padding: '14px 16px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, marginBottom: 14 }}>
                <SectionLabel>相关待办 (Boss Action Center)</SectionLabel>
                {ctx.bossActions.slice(0, 5).map((a) => (
                  <div key={a.id} style={{ fontSize: 12, color: MUTED, padding: '4px 0' }}>[{a.priority}] {a.title}</div>
                ))}
                <a href="/actions" style={{ fontSize: 11, color: GOLD, textDecoration: 'none' }}>查看全部待办 →</a>
              </div>
            )}

            {ctx.upcomingMeeting && (
              <div style={{ padding: '14px 16px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12 }}>
                <SectionLabel>近期会议</SectionLabel>
                <div style={{ fontSize: 12, color: TEXT }}>{ctx.upcomingMeeting.title} · {ctx.upcomingMeeting.start}</div>
              </div>
            )}
          </div>

          {/* ── Right: chat ── */}
          <div style={{ width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column', border: `1px solid ${BORD}`, borderRadius: 12, background: CARD, maxHeight: 'calc(100vh - 220px)' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {chatHistory.length === 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {QUICK_PROMPTS.map((q) => (
                    <button key={q.label} onClick={() => handleSend(q.text)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                      {q.label}
                    </button>
                  ))}
                </div>
              )}
              {chatHistory.map((turn, i) => (
                <div key={i} style={{ alignSelf: turn.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
                  <div style={{ padding: '9px 13px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', background: turn.role === 'user' ? 'rgba(203,168,92,0.14)' : 'rgba(255,255,255,0.04)', border: `1px solid ${turn.role === 'user' ? 'rgba(203,168,92,0.35)' : BORD}`, color: TEXT }}>
                    {turn.content}
                  </div>
                </div>
              ))}
              {chatLoading && <div style={{ fontSize: 12, color: MUTED }}>GCI 正在思考…</div>}
              {chatError && <div style={{ fontSize: 12, color: RED, padding: '8px 12px', background: 'rgba(224,132,106,0.08)', borderRadius: 8 }}>{chatError}</div>}

              {pendingFollowup && (
                <div style={{ padding: '12px 14px', background: 'rgba(203,168,92,0.05)', border: '1px solid rgba(203,168,92,0.25)', borderRadius: 10 }}>
                  <div style={{ fontSize: 10.5, color: GOLD, fontWeight: 700, marginBottom: 6 }}>确认记录跟进</div>
                  <div style={{ fontSize: 12, color: TEXT, marginBottom: 4 }}>内容:{pendingFollowup.notes}</div>
                  {pendingFollowup.nextAction && <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>下一步:{pendingFollowup.nextAction}</div>}
                  {pendingFollowup.nextFollowUpAt && <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>下次跟进:{pendingFollowup.nextFollowUpAt}</div>}
                  {writeMsg && <div style={{ fontSize: 11.5, color: RED, marginBottom: 6 }}>{writeMsg}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button disabled={writeBusy} onClick={handleConfirmFollowup} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}>{writeBusy ? '写入中…' : '确认写入 CRM'}</button>
                    <button onClick={() => setPendingFollowup(null)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>取消</button>
                  </div>
                </div>
              )}

              {pendingReminder && (
                <div style={{ padding: '12px 14px', background: 'rgba(203,168,92,0.05)', border: '1px solid rgba(203,168,92,0.25)', borderRadius: 10 }}>
                  <div style={{ fontSize: 10.5, color: GOLD, fontWeight: 700, marginBottom: 6 }}>确认设置下次跟进(CRM)</div>
                  <div style={{ fontSize: 12, color: TEXT, marginBottom: 8 }}>{pendingReminder.targetDate}</div>
                  {writeMsg && <div style={{ fontSize: 11.5, color: RED, marginBottom: 6 }}>{writeMsg}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button disabled={writeBusy} onClick={handleConfirmReminder} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}>{writeBusy ? '写入中…' : '确认写入 CRM'}</button>
                    <button onClick={() => setPendingReminder(null)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>取消</button>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {whatsappDraft && (
              <div style={{ margin: '0 14px 12px', padding: '12px 14px', background: 'rgba(203,168,92,0.05)', border: '1px solid rgba(203,168,92,0.25)', borderRadius: 10 }}>
                <div style={{ fontSize: 10.5, color: GOLD, fontWeight: 700, marginBottom: 8 }}>WhatsApp 草稿(未发送)</div>
                <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6 }}>To: {whatsappDraft.to || '(待填写)'}</div>
                <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: '8px 10px' }}>{whatsappDraft.body}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <button disabled title="发送功能将在后续启用" style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORD}`, color: SUBTLE, cursor: 'not-allowed' }}>发送(功能将在后续启用)</button>
                  <span style={{ fontSize: 10.5, color: SUBTLE }}>草稿仅保存在当前页面</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, padding: '0 14px 14px' }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !chatLoading) handleSend(); }}
                placeholder="继续问 GCI…"
                style={{ flex: 1, padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: TEXT, fontSize: 13 }}
              />
              <button onClick={() => handleSend()} disabled={chatLoading || !chatInput.trim()} style={{ padding: '10px 18px', borderRadius: 9, background: chatLoading ? 'rgba(203,168,92,0.15)' : `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: chatLoading ? GOLD : '#080D1E', fontSize: 13, fontWeight: 700, cursor: chatLoading ? 'not-allowed' : 'pointer' }}>
                发送
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
