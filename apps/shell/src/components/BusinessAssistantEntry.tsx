// GCI Executive Desk — Home dashboard's GIA entry point. A real input (not
// just a decorative card) that runs the message through the EXACT SAME
// shared router /business-assistant's own top input uses (lib/giaRouter.ts)
// and renders the reply/confirm card IN PLACE on Home — no page navigation.
// A plain name/company lookup (nothing else matched) is the one case Home
// hands off to /business-assistant?customer=, since Home has no Customer-360
// view of its own to show the result in.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { useI18n } from '@gci/i18n';
import { runGiaTopRouter, type GiaRouterState, type PendingDriveFolderCreate } from '../lib/giaRouter';
import { confirmCaptureItem, completeOrCancelTask, rescheduleTask, type ResolvedCaptureItem } from '../lib/businessCapture';
import { BUSINESS_AREA_LABEL, BUSINESS_AREA_LABEL_ZH, ALL_BUSINESS_AREAS, type ExecutiveTask, type TaskBusinessArea } from '../lib/executiveTasks';
import { uploadAndRegisterLocalFile, searchDriveFolders, extractCompanyName, createFolderIfMissing, getDriveFolderName, DEFAULT_TARGET_FOLDER_ID, DEFAULT_TARGET_FOLDER_NAME, type DriveFolderOption } from '../lib/giaFiles';
import {
  findDriveFolderMemory, rememberDriveFolder, findBusinessAreaMemory, rememberBusinessArea, touchMemory, markMemoryStale,
  type DriveFolderMemoryValue, type BusinessAreaMemoryValue,
} from '../lib/giaMemory';
import {
  looksLikeMultiStepDrivePlan, parseDriveActionPlan, resolveDrivePlan, applyRootResolution, isRootResolved,
  getCreateStep, withChildFolderName, executeDrivePlan,
  type DriveActionPlan, type DrivePlanExecutionResult,
} from '../lib/driveActionPlan';
import { findCustomerByName, type CrmCustomer } from '../lib/crmSupabase';
import {
  looksLikeBusinessDocumentDescription, parseBusinessDocumentDescription, todayISO as bizDocTodayISO,
  createBusinessDocumentHistory, supersedeCurrentBusinessDocuments,
  DOC_TYPE_LABEL_ZH, DOC_TYPE_LABEL_EN, STATUS_LABEL_ZH, STATUS_LABEL_EN,
  type BusinessDocumentType, type BusinessDocumentStatus,
} from '../lib/businessDocumentHistory';

const GOLD = '#CBA85C';
const GOLD_L = '#E2C988';
const GREEN = '#6FBF8E';
const RED = '#E0846A';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(203,168,92,0.18)';
const TEXT = colors.textPrimary;

// "写邮件"/"Write email" removed — email is fully retired from GCI/GIA.
// "上传文件"/"Upload file" takes the same slot, wired to a real local-file
// -> Drive intake flow below (the other shortcuts remain decorative,
// unchanged — they all just navigate to /business-assistant).
const SHORTCUTS_ZH = ['查客户', '查报价', '找文件', '记录沟通', '上传文件'];
const SHORTCUTS_EN = ['Search clients', 'Search quotes', 'Find file', 'Log communication', 'Upload file'];
const UPLOAD_SHORTCUT_ZH = '上传文件';
const UPLOAD_SHORTCUT_EN = 'Upload file';

const UPLOAD_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Non-AI, deterministic keyword extraction for file routing — V1 per spec:
// "用户自然语言 + 文件名 → 真实 Drive 搜索", no LLM classification. Prioritizes
// an entity name (customer/supplier/project, via giaFiles.ts's existing
// extractCompanyName — same fallback capitalized-word pattern its rule-based
// file classifier already uses) plus a recognized document-category word.
// Falls back to the raw description text if neither is found, so a folder
// search still runs on whatever the user actually typed.
const ENTITY_HINT_WORDS = ['quotation', 'quote', '报价', 'manpower', 'workforce', '劳务', 'supplier', '供应商', 'contract', '合同', 'project', '项目'];

function extractFileRoutingKeywords(description: string, fileName: string): string {
  const combined = `${description} ${fileName}`.toLowerCase();
  const entityName = extractCompanyName(description) || extractCompanyName(fileName);
  const hint = ENTITY_HINT_WORDS.find((w) => combined.includes(w.toLowerCase()));
  const parts = [entityName, hint].filter((v): v is string => Boolean(v));
  if (parts.length > 0) return parts.join(' ');
  return description.trim() || fileName;
}

export function BusinessAssistantEntry() {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const SHORTCUTS = lang === 'zh' ? SHORTCUTS_ZH : SHORTCUTS_EN;
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileSearchReply, setFileSearchReply] = useState<string | null>(null);
  const [pendingCapture, setPendingCapture] = useState<ResolvedCaptureItem[] | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureDone, setCaptureDone] = useState<Set<number>>(new Set());
  const [captureBusy, setCaptureBusy] = useState<number | 'all' | null>(null);
  const [pendingTaskLifecycle, setPendingTaskLifecycle] = useState<{ action: 'completed' | 'cancelled'; matches: ExecutiveTask[] } | null>(null);
  const [pendingTaskReschedule, setPendingTaskReschedule] = useState<{ whenPhrase: string; resolvedDate: string | null; matches: ExecutiveTask[] } | null>(null);
  // Local file -> Drive upload — a direct tool action, kept fully separate
  // from pendingCapture/Planner state. Never sends the file name to Planner
  // V3, never generates a BUSINESS_TODO.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; driveUrl: string; folderName: string } | null>(null);
  // File routing — "用户负责告诉 GIA 文件是什么；GIA 负责记/找目录":
  //   describe  -> user types what the file is / who it belongs to
  //   suggested -> a single real Drive folder was found (or manually picked)
  //   candidates-> 2-5 real Drive folders matched, user must pick one
  //   no_match  -> nothing reliable matched; defaults to the Inbox
  // selectedFolder is the one real target that will actually be used on
  // upload — always has a value (defaults to the existing GIA intake
  // folder), only ever set to a real folder searchDriveFolders() returned.
  type UploadPhase = 'describe' | 'suggested' | 'candidates' | 'no_match';
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('describe');
  const [fileDescription, setFileDescription] = useState('');
  const [describeBusy, setDescribeBusy] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string }>({ id: DEFAULT_TARGET_FOLDER_ID, name: DEFAULT_TARGET_FOLDER_NAME });
  const [describeCandidates, setDescribeCandidates] = useState<DriveFolderOption[] | null>(null);
  // Manual Folder Picker — fallback only, per spec: "只有用户不接受 GIA 推荐
  // 时才打开真实 Folder Picker". Reads the same real Drive search as the
  // automatic routing above; just a second, explicit entry point into it.
  const [manualPickerOpen, setManualPickerOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [manualCandidates, setManualCandidates] = useState<DriveFolderOption[] | null>(null);
  const [manualSearchBusy, setManualSearchBusy] = useState(false);
  const [manualNotice, setManualNotice] = useState<string | null>(null);
  // Multi-step Drive Plan V1 — only reachable while selectedFile is set
  // (every V1 plan ends in an upload step). Kept fully separate from
  // pendingCapture/Planner state, same discipline as everything else in
  // this file's local-tool-action flows: never touches classify-capture,
  // never generates a BUSINESS_TODO.
  const [pendingDrivePlan, setPendingDrivePlan] = useState<DriveActionPlan | null>(null);
  const [drivePlanBusy, setDrivePlanBusy] = useState(false);
  const [drivePlanError, setDrivePlanError] = useState<string | null>(null);
  const [drivePlanCandidates, setDrivePlanCandidates] = useState<DriveFolderOption[] | null>(null);
  const [drivePlanNotFound, setDrivePlanNotFound] = useState<string | null>(null);
  const [drivePlanEditOpen, setDrivePlanEditOpen] = useState(false);
  const [drivePlanEditChildName, setDrivePlanEditChildName] = useState('');
  const [drivePlanEditParentQuery, setDrivePlanEditParentQuery] = useState('');
  const [drivePlanResult, setDrivePlanResult] = useState<DrivePlanExecutionResult | null>(null);
  // Drive folder creation — a direct tool action, kept fully separate from
  // pendingCapture/Planner state, same discipline as the file upload flow
  // above. folderName===null means GIA is still waiting for a name; the
  // Drive API is never called before an explicit "确认创建" click.
  const [pendingDriveFolderCreate, setPendingDriveFolderCreate] = useState<PendingDriveFolderCreate | null>(null);
  const [folderCreateBusy, setFolderCreateBusy] = useState(false);
  const [folderCreateError, setFolderCreateError] = useState<string | null>(null);
  const [folderCreated, setFolderCreated] = useState<{ name: string; webViewLink: string; alreadyExisted: boolean } | null>(null);
  // Business History / Document Timeline V1 Round 2 — only reachable while
  // selectedFile is set, same discipline as the multi-step Drive plan above:
  // kept fully separate from pendingCapture/Planner state, never generates a
  // BUSINESS_TODO. Only enters this flow when the user's own description
  // names a recognized document type (looksLikeBusinessDocumentDescription);
  // a plain "把这个放到HIGHWAYGLOBAL" never reaches it.
  interface PendingBusinessDocument {
    entityName: string; documentType: BusinessDocumentType; title: string;
    versionNo: number | null; versionLabel: string | null; status: BusinessDocumentStatus;
    amount: number | null; currency: string | null; notes: string | null; documentDate: string;
    customerId: string | null; customerName: string | null; candidateCustomers: CrmCustomer[] | null;
  }
  const [pendingBusinessDocument, setPendingBusinessDocument] = useState<PendingBusinessDocument | null>(null);
  const [businessDocBusy, setBusinessDocBusy] = useState(false);
  const [businessDocError, setBusinessDocError] = useState<string | null>(null);
  const [businessDocSaved, setBusinessDocSaved] = useState<{ title: string; driveUrl: string; folderName: string } | null>(null);
  // GIA Memory V1 — pre-fills each fresh BUSINESS_TODO's business area from
  // a remembered mapping (outranking Planner's own guess for this session,
  // per the read-only design's lookup priority), while leaving the
  // dropdown fully editable — this is a suggestion, never a locked value.
  // memoryAppliedRef dedupes by array identity so this never loops: our own
  // setPendingCapture(next) call below is marked "already processed" before
  // it re-triggers the effect.
  const memoryAppliedRef = useRef<ResolvedCaptureItem[] | null>(null);
  useEffect(() => {
    if (!pendingCapture || pendingCapture === memoryAppliedRef.current) return;
    memoryAppliedRef.current = pendingCapture;
    (async () => {
      let changed = false;
      const next = [...pendingCapture];
      for (let i = 0; i < next.length; i++) {
        const item = next[i];
        if (item.type !== 'BUSINESS_TODO') continue;
        const entityKey = extractCompanyName(item.raw.todo_title || item.raw.raw_fragment);
        if (!entityKey) continue;
        const memory = await findBusinessAreaMemory(entityKey);
        if (!memory) continue;
        const value = memory.value_json as BusinessAreaMemoryValue;
        if (value.businessArea && value.businessArea !== item.raw.todo_business_area) {
          next[i] = { ...item, raw: { ...item.raw, todo_business_area: value.businessArea as TaskBusinessArea } };
          changed = true;
          touchMemory(memory.id);
        }
      }
      if (changed) {
        memoryAppliedRef.current = next;
        setPendingCapture(next);
      }
    })();
  }, [pendingCapture]);
  // Drag & drop — same pending-file preview as the "上传文件" button, just a
  // second on-ramp into it. dragCounter survives dragenter/dragleave firing
  // on child elements as the pointer moves within the box (a plain boolean
  // would flicker off every time the pointer crosses a child's edge).
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [multiDropNotice, setMultiDropNotice] = useState(false);

  // The single dispatcher for "user typed text while a file is pending" —
  // used by BOTH the top input box (go(), below) AND the file-pending
  // card's own inline description box (uploadPhase === 'describe', in the
  // JSX). Those used to be two separate code paths: the inline box called
  // describeAndRouteFile() directly, so a business-document sentence typed
  // there (the box's own placeholder — "例如：这是 SHADI 的劳务合同" — invites
  // exactly that) never reached the Business History check at all and fell
  // straight into plain Drive-folder routing. Routing both boxes through
  // this one function is what forecloses that bug and the earlier
  // "上传文件" BUSINESS_TODO bug alike: text typed while a file preview is
  // showing must never reach classify-capture/runGiaTopRouter, and must be
  // checked against Business History before plain folder routing gets a
  // chance to swallow it.
  // Priority order while a file is pending: 1) Business History (explicit
  // document-type word) 2) Multi-step Drive Plan (create+move cues) 3)
  // plain description / folder routing.
  async function handleFileText(text: string) {
    const v = text.trim();
    if (!v || !selectedFile) return;
    if (pendingDrivePlan || pendingBusinessDocument) {
      // A plan/confirm-card is already up — its own candidate/edit/confirm
      // buttons own the interaction now, not free-typed text.
      return;
    }
    if (looksLikeBusinessDocumentDescription(v)) {
      setFileDescription(v);
      await describeFileAsBusinessDocument(v);
      return;
    }
    if (looksLikeMultiStepDrivePlan(v)) {
      await handleDrivePlanInput(v);
      return;
    }
    setFileDescription(v);
    await describeAndRouteFile(v);
  }

  async function go() {
    const v = value.trim();
    if (!v) { navigate('/business-assistant'); return; }
    if (selectedFile) {
      setValue('');
      await handleFileText(v);
      return;
    }
    // GIA is waiting for a folder name ("在谷歌云新建一个文件夹" with no name
    // given) — this text answers that, never a Planner/capture command.
    if (pendingDriveFolderCreate && !pendingDriveFolderCreate.folderName) {
      setPendingDriveFolderCreate({ ...pendingDriveFolderCreate, folderName: v });
      setValue('');
      return;
    }
    setBusy(true);
    const state: GiaRouterState = {
      currentCustomer: null, // Home has no loaded customer context
      setFileSearchReply, setPendingCapture, setCaptureLoading: setBusy, setCaptureError,
      setCaptureDone, setPendingTaskLifecycle, setPendingTaskReschedule,
      setPendingDriveFolderCreate, lang,
    };
    const consumed = await runGiaTopRouter(v, state);
    setBusy(false);
    if (!consumed) {
      // Plain name/company lookup — Home has no Customer-360 view, hand off
      // to the full page exactly like this used to always do.
      navigate(`/business-assistant?customer=${encodeURIComponent(v)}`);
      return;
    }
    setValue('');
  }

  // GIA Memory V1 — the confirm click is the only trigger that writes
  // business_area memory (never the Planner guess, never the pre-fill
  // suggestion alone). Compared against whatever's currently remembered:
  // matches an existing memory -> 'user_confirmation' (endorsing it as
  // still correct); differs from (or there was no) existing memory ->
  // 'user_correction'/first-time confirmation. Silently no-ops for items
  // with no extractable entity name — never guesses a key.
  async function learnBusinessAreaFromConfirmedItem(item: ResolvedCaptureItem) {
    if (item.type !== 'BUSINESS_TODO') return;
    const entityKey = extractCompanyName(item.raw.todo_title || item.raw.raw_fragment);
    if (!entityKey) return;
    const confirmedArea = item.raw.todo_business_area ?? 'OTHER';
    const existing = await findBusinessAreaMemory(entityKey);
    const existingArea = existing ? (existing.value_json as BusinessAreaMemoryValue).businessArea : null;
    if (existingArea === confirmedArea) {
      if (existing) touchMemory(existing.id);
      return;
    }
    await rememberBusinessArea(entityKey, { businessArea: confirmedArea }, existingArea ? 'user_correction' : 'user_confirmation');
  }

  async function handleConfirmItem(index: number) {
    if (!pendingCapture) return;
    const item = pendingCapture[index];
    setCaptureBusy(index);
    const res = await confirmCaptureItem(item);
    setCaptureBusy(null);
    if (res.ok) {
      setCaptureDone((prev) => new Set(prev).add(index));
      await learnBusinessAreaFromConfirmedItem(item);
    } else {
      setCaptureError(res.error);
    }
  }

  async function handleConfirmAll() {
    if (!pendingCapture) return;
    setCaptureBusy('all');
    const newlyDone = new Set(captureDone);
    for (let i = 0; i < pendingCapture.length; i++) {
      if (newlyDone.has(i)) continue;
      if (pendingCapture[i].candidateCustomers) continue;
      if (pendingCapture[i].needsCustomerName) continue;
      if (pendingCapture[i].needsContent) continue;
      if (pendingCapture[i].crmNoMatchBlocked) continue;
      const res = await confirmCaptureItem(pendingCapture[i]);
      if (res.ok) { newlyDone.add(i); await learnBusinessAreaFromConfirmedItem(pendingCapture[i]); }
      else { setCaptureError(res.error); break; }
    }
    setCaptureDone(newlyDone);
    setCaptureBusy(null);
  }

  function pickCandidateCustomer(index: number, customer: CrmCustomer) {
    if (!pendingCapture) return;
    const next = [...pendingCapture];
    const item = next[index];
    next[index] = {
      ...item,
      type: item.type === 'NEW_CUSTOMER' ? 'CRM_FOLLOWUP' : item.type,
      matchedCustomer: customer,
      candidateCustomers: null,
      isNewCustomer: false,
    };
    setPendingCapture(next);
  }

  // GIA Planner confirm-card business-area editor — pure local state edit,
  // no re-classification/model call. Mutates item.raw.todo_business_area
  // directly, the exact field confirmCaptureItem()'s BUSINESS_TODO branch
  // already reads to build the executive_tasks write — so a manual pick
  // here is what actually gets saved, not Planner's original guess.
  function changeBusinessArea(index: number, area: TaskBusinessArea) {
    if (!pendingCapture) return;
    const next = [...pendingCapture];
    const item = next[index];
    next[index] = { ...item, raw: { ...item.raw, todo_business_area: area } };
    setPendingCapture(next);
  }

  function createAsNewInstead(index: number) {
    if (!pendingCapture) return;
    const next = [...pendingCapture];
    next[index] = { ...next[index], matchedCustomer: null, candidateCustomers: null, isNewCustomer: true, type: 'NEW_CUSTOMER' };
    setPendingCapture(next);
  }

  function cancelFolderCreate() {
    setPendingDriveFolderCreate(null);
    setFolderCreateError(null);
  }

  // Real Drive API call — only ever invoked by an explicit "确认创建" click,
  // never automatically after the name is known. Reuses createFolderIfMissing()
  // (already existed, already wired to /api/google/drive-create-folder) —
  // no second create-folder implementation.
  async function confirmFolderCreate() {
    if (!pendingDriveFolderCreate?.folderName) return;
    setFolderCreateBusy(true);
    setFolderCreateError(null);
    const res = await createFolderIfMissing(pendingDriveFolderCreate.folderName, pendingDriveFolderCreate.parentId);
    setFolderCreateBusy(false);
    if (res.ok) {
      setFolderCreated({ name: pendingDriveFolderCreate.folderName, webViewLink: res.webViewLink, alreadyExisted: !res.created });
      setPendingDriveFolderCreate(null);
    } else {
      setFolderCreateError(res.error);
    }
  }

  async function handleConfirmTaskLifecycle(taskId: string) {
    if (!pendingTaskLifecycle) return;
    setCaptureBusy('all');
    const res = await completeOrCancelTask(taskId, pendingTaskLifecycle.action);
    setCaptureBusy(null);
    if (res.ok) setPendingTaskLifecycle(null);
    else setCaptureError(res.error);
  }

  // Shared by both entry points (button-triggered <input type="file"> and
  // drag & drop below) — exactly one place decides what "a file was picked"
  // means, so the two on-ramps can never drift into different behavior.
  function acceptPickedFile(f: File | null) {
    if (!f) return;
    setUploadError(null);
    setUploadedFile(null);
    setSelectedFile(f);
    // Reset the whole routing flow to its starting phase for each new file —
    // never carry a previous file's description/suggestion over to this one.
    setUploadPhase('describe');
    setFileDescription('');
    setSelectedFolder({ id: DEFAULT_TARGET_FOLDER_ID, name: DEFAULT_TARGET_FOLDER_NAME });
    setDescribeCandidates(null);
    setManualPickerOpen(false);
    setManualQuery('');
    setManualCandidates(null);
    setManualNotice(null);
    // Never carry a previous file's multi-step plan over to a new file.
    setPendingDrivePlan(null);
    setDrivePlanCandidates(null);
    setDrivePlanNotFound(null);
    setDrivePlanEditOpen(false);
    setDrivePlanError(null);
    setDrivePlanResult(null);
    // Clear any leftover Planner/capture confirm card — a stale pendingCapture
    // from an earlier, unrelated chat message rendering below the new upload
    // card is exactly what made an old classification (e.g. a BUSINESS_TODO
    // titled after some earlier text) look like it was produced BY the
    // upload. Starting a file upload always starts with a clean slate.
    setPendingCapture(null);
    setCaptureDone(new Set());
    setCaptureError(null);
    setFileSearchReply(null);
    // Never carry a previous file's business-document confirm card over.
    setPendingBusinessDocument(null);
    setBusinessDocError(null);
    setBusinessDocSaved(null);
  }

  // The core routing step: "用户自然语言 + 文件名 → 真实 Drive 搜索 → 推荐".
  // No AI call — extractFileRoutingKeywords() is pure regex/keyword matching,
  // searchDriveFolders() is the same real Drive search the manual picker
  // below also uses. Never generates a task/BUSINESS_TODO — this text is
  // only ever used to pick a folder.
  async function describeAndRouteFile(description: string) {
    if (!selectedFile || !description.trim()) return;
    setDescribeBusy(true);
    setDescribeCandidates(null);

    // GIA Memory V1 — a real entity the user has confirmed a Drive folder
    // for before outranks a fresh search (priority: this-turn instruction >
    // memory > real search). Never trusted blindly: the remembered folder
    // is re-verified against Drive itself before being recommended, and a
    // folder that's gone is retired instead of recommended forever.
    const entityKey = extractCompanyName(description) || extractCompanyName(selectedFile.name);
    if (entityKey) {
      const memory = await findDriveFolderMemory(entityKey);
      if (memory) {
        const value = memory.value_json as DriveFolderMemoryValue;
        const realName = await getDriveFolderName(value.folderId);
        if (realName) {
          touchMemory(memory.id);
          setSelectedFolder({ id: value.folderId, name: realName });
          setUploadPhase('suggested');
          setDescribeBusy(false);
          return;
        }
        await markMemoryStale(memory.id);
      }
    }

    const keyword = extractFileRoutingKeywords(description, selectedFile.name);
    const results = await searchDriveFolders(keyword);
    setDescribeBusy(false);
    if (results.length === 0) {
      setSelectedFolder({ id: DEFAULT_TARGET_FOLDER_ID, name: DEFAULT_TARGET_FOLDER_NAME });
      setUploadPhase('no_match');
    } else if (results.length === 1) {
      setSelectedFolder({ id: results[0].id, name: results[0].name });
      setUploadPhase('suggested');
    } else {
      setDescribeCandidates(results.slice(0, 5));
      setUploadPhase('candidates');
    }
  }

  function pickDescribeCandidate(f: DriveFolderOption) {
    setSelectedFolder({ id: f.id, name: f.name });
    setDescribeCandidates(null);
    setUploadPhase('suggested');
  }

  // Multi-step Drive Plan V1 — parses the sentence into a plan, then
  // read-only resolves its FIND_FOLDER step (memory -> real Drive search)
  // BEFORE ever showing a confirm card. Never writes to Drive here.
  async function handleDrivePlanInput(text: string) {
    const plan = parseDriveActionPlan(text);
    if (!plan) {
      // Couldn't confidently extract both a root and a new-folder name —
      // fall back to the existing single-step description flow rather than
      // showing a broken/incomplete plan.
      setFileDescription(text);
      await describeAndRouteFile(text);
      return;
    }
    setDrivePlanBusy(true);
    setDrivePlanError(null);
    setDrivePlanNotFound(null);
    setDrivePlanCandidates(null);
    setDrivePlanResult(null);
    const outcome = await resolveDrivePlan(plan);
    setDrivePlanBusy(false);
    if (outcome.ok) {
      setPendingDrivePlan(outcome.plan);
    } else if (outcome.reason === 'ambiguous') {
      setPendingDrivePlan(outcome.plan);
      setDrivePlanCandidates(outcome.candidates);
    } else {
      setPendingDrivePlan(outcome.plan);
      setDrivePlanNotFound(outcome.query);
    }
  }

  function pickDrivePlanRootCandidate(f: DriveFolderOption) {
    if (!pendingDrivePlan) return;
    setPendingDrivePlan(applyRootResolution(pendingDrivePlan, f.id, f.name));
    setDrivePlanCandidates(null);
    setDrivePlanNotFound(null);
  }

  // "修改" — V1 deliberately only allows editing the 3 things spec'd:
  // parent folder (search + pick, same real Drive search), child folder
  // name (plain text edit), and the final upload target — which in V1's
  // fixed 3-step shape always IS the child folder, so there's nothing
  // separate to edit there. No drag-reorder, no add/remove steps.
  function openDrivePlanEdit() {
    if (!pendingDrivePlan) return;
    const createStep = getCreateStep(pendingDrivePlan);
    setDrivePlanEditChildName(createStep?.folderName ?? '');
    setDrivePlanEditParentQuery('');
    setDrivePlanCandidates(null);
    setDrivePlanEditOpen(true);
  }

  async function searchDrivePlanParentEdit() {
    const q = drivePlanEditParentQuery.trim();
    if (!q) return;
    setDrivePlanBusy(true);
    const results = await searchDriveFolders(q);
    setDrivePlanBusy(false);
    setDrivePlanCandidates(results.slice(0, 5));
  }

  function pickDrivePlanEditParent(f: DriveFolderOption) {
    if (!pendingDrivePlan) return;
    setPendingDrivePlan(applyRootResolution(pendingDrivePlan, f.id, f.name));
    setDrivePlanCandidates(null);
    setDrivePlanNotFound(null);
  }

  function applyDrivePlanChildNameEdit() {
    if (!pendingDrivePlan) return;
    const name = drivePlanEditChildName.trim();
    if (!name) return;
    setPendingDrivePlan(withChildFolderName(pendingDrivePlan, name));
  }

  function closeDrivePlanEdit() {
    applyDrivePlanChildNameEdit();
    setDrivePlanEditOpen(false);
    setDrivePlanCandidates(null);
  }

  function cancelDrivePlan() {
    setPendingDrivePlan(null);
    setDrivePlanCandidates(null);
    setDrivePlanNotFound(null);
    setDrivePlanEditOpen(false);
    setDrivePlanError(null);
    setDrivePlanResult(null);
  }

  // Real execution — only ever invoked by an explicit "全部确认" click.
  // executeDrivePlan() itself is strictly serial (no Promise.all) and stops
  // at the first failed step; this function never retries and never
  // fabricates success.
  async function confirmDrivePlan() {
    if (!pendingDrivePlan || !selectedFile || !isRootResolved(pendingDrivePlan)) return;
    setDrivePlanBusy(true);
    setDrivePlanError(null);
    const result = await executeDrivePlan(pendingDrivePlan, selectedFile);
    setDrivePlanBusy(false);
    setDrivePlanResult(result);
    if (result.ok && result.createdFolder) {
      // GIA Memory V1 — remember the newly created child folder's real,
      // verified location, same write-on-confirm discipline as the
      // single-step upload flow. If the user used "修改" to correct the
      // parent, this naturally remembers the corrected outcome, not the
      // original guess.
      await rememberDriveFolder(result.createdFolder.name, { folderId: result.createdFolder.id, folderName: result.createdFolder.name }, 'user_confirmation');
      setPendingDrivePlan(null);
      setSelectedFile(null);
    }
  }

  // Fallback only — opened by "修改位置"/"Change location" when the user
  // doesn't accept GIA's suggestion. Same real Drive search, just a manual,
  // explicit second entry point into it.
  function openManualPicker() {
    setManualPickerOpen(true);
    setManualQuery('');
    setManualCandidates(null);
    setManualNotice(null);
  }

  async function runManualFolderSearch() {
    const q = manualQuery.trim();
    if (!q) return;
    setManualSearchBusy(true);
    setManualNotice(null);
    const results = await searchDriveFolders(q);
    setManualSearchBusy(false);
    if (results.length === 0) {
      setManualCandidates(null);
      setManualNotice(lang === 'zh' ? `未找到匹配"${q}"的文件夹` : `No folder matched "${q}"`);
    } else {
      setManualCandidates(results.slice(0, 5));
    }
  }

  function pickManualFolderCandidate(f: DriveFolderOption) {
    setSelectedFolder({ id: f.id, name: f.name });
    setUploadPhase('suggested');
    setManualPickerOpen(false);
    setManualCandidates(null);
    setManualNotice(null);
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = ''; // allow re-selecting the exact same file later
    acceptPickedFile(f);
  }

  // dragover's preventDefault() is what stops the browser from navigating
  // to/opening the dropped file directly (its default action for a file
  // drag) — required on both dragOver and drop, not just drop.
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounter.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    // Single file only, same as the button — never batch-upload for this round.
    setMultiDropNotice(files.length > 1);
    acceptPickedFile(files[0]);
  }

  function cancelFileUpload() {
    setSelectedFile(null);
    setUploadError(null);
    setMultiDropNotice(false);
    setUploadPhase('describe');
    setFileDescription('');
    setDescribeCandidates(null);
    setManualPickerOpen(false);
    setManualCandidates(null);
    setManualNotice(null);
    setPendingBusinessDocument(null);
    setBusinessDocError(null);
  }

  // Business History / Document Timeline V1 Round 2 — read-only parse +
  // customer lookup, never writes anything yet (that only happens on the
  // explicit "确认保存" click in confirmBusinessDocumentSave below).
  async function describeFileAsBusinessDocument(description: string) {
    if (!selectedFile) return;
    const parsed = parseBusinessDocumentDescription(description);
    if (!parsed) return;
    setBusinessDocBusy(true);
    setBusinessDocError(null);
    const res = await findCustomerByName(parsed.entityName);
    let customerId: string | null = null;
    let customerName: string | null = null;
    let candidateCustomers: CrmCustomer[] | null = null;
    if (res.ok && res.found) {
      customerId = res.customer.id;
      customerName = res.customer.customer_name;
    } else if (res.ok && !res.found && res.multiple) {
      candidateCustomers = res.candidates;
    }
    // A failed CRM lookup (network/query error) never blocks the flow —
    // it just means "尚未关联CRM客户", same as a genuine zero-match.
    setBusinessDocBusy(false);
    setPendingBusinessDocument({
      entityName: parsed.entityName, documentType: parsed.documentType, title: parsed.title,
      versionNo: parsed.versionNo, versionLabel: parsed.versionLabel, status: parsed.status,
      amount: parsed.amount, currency: parsed.currency, notes: parsed.notes,
      documentDate: bizDocTodayISO(), customerId, customerName, candidateCustomers,
    });
  }

  function pickBusinessDocumentCustomer(customer: CrmCustomer) {
    if (!pendingBusinessDocument) return;
    setPendingBusinessDocument({ ...pendingBusinessDocument, customerId: customer.id, customerName: customer.customer_name, candidateCustomers: null });
  }

  function useUnlinkedBusinessDocumentCustomer() {
    if (!pendingBusinessDocument) return;
    setPendingBusinessDocument({ ...pendingBusinessDocument, candidateCustomers: null });
  }

  // "修改" — V1 keeps this to re-typing the description rather than a field-
  // by-field editor; simplest correct behavior for a minimal round, and
  // consistent with "不要复杂查询分析/不要过度设计" for this round.
  function editBusinessDocument() {
    setPendingBusinessDocument(null);
    setBusinessDocError(null);
    setFileDescription('');
  }

  function cancelBusinessDocument() {
    setPendingBusinessDocument(null);
    setBusinessDocError(null);
  }

  // The strict write sequence (spec section 八): upload+register to Drive
  // first (never parallel with the DB writes below), then supersede the old
  // current record for this exact topic, then write the new current record.
  // Any failure after the Drive upload succeeds is reported as a partial
  // success, never disguised as a full failure or a full success.
  async function confirmBusinessDocumentSave() {
    if (!pendingBusinessDocument || !selectedFile || pendingBusinessDocument.candidateCustomers) return;
    setBusinessDocBusy(true);
    setBusinessDocError(null);

    const uploaded = await uploadAndRegisterLocalFile(selectedFile, selectedFolder);
    if (!uploaded.ok) {
      setBusinessDocBusy(false);
      setBusinessDocError(lang === 'zh' ? `上传失败：${uploaded.error}` : `Upload failed: ${uploaded.error}`);
      return;
    }

    const topic = {
      customerId: pendingBusinessDocument.customerId,
      entityName: pendingBusinessDocument.entityName,
      documentType: pendingBusinessDocument.documentType,
      title: pendingBusinessDocument.title,
    };

    const superseded = await supersedeCurrentBusinessDocuments(topic);
    if (!superseded.ok) {
      setBusinessDocBusy(false);
      setBusinessDocError(
        lang === 'zh'
          ? `文件已保存到 Drive，但业务历史登记失败（旧版本状态更新失败：${superseded.error}）`
          : `File saved to Drive, but business history registration failed (could not update the previous version: ${superseded.error})`,
      );
      return;
    }

    const created = await createBusinessDocumentHistory({
      customerId: topic.customerId, entityName: topic.entityName, documentType: topic.documentType, title: topic.title,
      versionNo: pendingBusinessDocument.versionNo, versionLabel: pendingBusinessDocument.versionLabel,
      amount: pendingBusinessDocument.amount, currency: pendingBusinessDocument.currency,
      status: pendingBusinessDocument.status, documentDate: pendingBusinessDocument.documentDate, notes: pendingBusinessDocument.notes,
      driveFileId: uploaded.row.drive_file_id, driveFileName: uploaded.row.file_name,
      driveFolderId: selectedFolder.id, driveUrl: uploaded.row.drive_url,
    });
    setBusinessDocBusy(false);
    if (!created.ok) {
      setBusinessDocError(
        lang === 'zh'
          ? `文件已保存到 Drive，但业务历史登记失败：${created.error}`
          : `File saved to Drive, but business history registration failed: ${created.error}`,
      );
      return;
    }

    setBusinessDocSaved({ title: topic.title, driveUrl: uploaded.row.drive_url, folderName: uploaded.actualFolderName });
    setPendingBusinessDocument(null);
    setSelectedFile(null);
  }

  // Hard upload gate — enforced here regardless of which button/UI path
  // called it: selectedFile must exist, a destination must actually have
  // been resolved (a real search match, a candidate the user picked, or the
  // user's explicit "先存 Inbox" acknowledgment — never just "search
  // failed" or "user pressed Enter"), and selectedFolder must carry a real
  // Drive folder id. 'suggested'/'no_match' are the only two phases where a
  // concrete recommendation has been surfaced for confirmation; 'describe'
  // and 'candidates' are still ambiguous and must never reach upload.
  async function confirmFileUpload() {
    const destinationResolved = uploadPhase === 'suggested' || uploadPhase === 'no_match';
    if (!selectedFile || !destinationResolved || !selectedFolder.id) return;
    setUploadBusy(true);
    setUploadError(null);
    const res = await uploadAndRegisterLocalFile(selectedFile, selectedFolder);
    setUploadBusy(false);
    setMultiDropNotice(false);
    if (res.ok) {
      // res.actualFolderName comes from Drive's own upload response
      // (verified real parent), not the pre-upload selectedFolder guess —
      // this is what the success card must show.
      setUploadedFile({ name: selectedFile.name, driveUrl: res.row.drive_url, folderName: res.actualFolderName });
      // GIA Memory V1 — this explicit "确认上传" click is exactly the
      // trigger the design calls for: only a real, user-confirmed
      // destination is ever remembered, never a guess or a search result
      // alone. Keyed off the same entity extraction used for routing above.
      const entityKey = extractCompanyName(fileDescription) || extractCompanyName(selectedFile.name);
      if (entityKey) {
        await rememberDriveFolder(entityKey, { folderId: selectedFolder.id, folderName: res.actualFolderName }, 'user_confirmation');
      }
      setSelectedFile(null);
      setUploadPhase('describe');
      setFileDescription('');
      setDescribeCandidates(null);
      setManualPickerOpen(false);
    } else {
      setUploadError(res.error);
    }
  }

  async function handleConfirmTaskReschedule(taskId: string) {
    if (!pendingTaskReschedule?.resolvedDate) return;
    setCaptureBusy('all');
    const res = await rescheduleTask(taskId, pendingTaskReschedule.resolvedDate);
    setCaptureBusy(null);
    if (res.ok) setPendingTaskReschedule(null);
    else setCaptureError(res.error);
  }

  return (
    <div style={{ marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span className="font-mono-label" style={{ fontSize: 10.5, letterSpacing: '0.22em', color: GOLD }}>
          GIA · GCI INTELLIGENT ASSISTANT
        </span>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(203,168,92,0.36),transparent)' }} />
      </div>
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ position: 'relative', padding: '18px 20px', background: CARD, border: `1px solid ${isDragging ? 'rgba(203,168,92,0.65)' : BORD}`, borderRadius: 14, boxShadow: '0 0 40px rgba(203,168,92,0.04)' }}
      >
        {isDragging && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,13,30,0.82)', border: `2px dashed ${GOLD}`, borderRadius: 14, pointerEvents: 'none' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>
              {lang === 'zh' ? '松开以上传文件' : 'Drop file to upload'}
            </span>
          </div>
        )}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) go(); }}
            placeholder={
              selectedFile
                ? (lang === 'zh' ? '例如：这是 SHADI 的劳务合同' : "Example: This is SHADI's manpower contract")
                : pendingDriveFolderCreate && !pendingDriveFolderCreate.folderName
                  ? (lang === 'zh' ? '文件夹叫什么名字？例如：HIGHWAYGLOBAL' : 'What should the folder be named? e.g. HIGHWAYGLOBAL')
                  : '问我：MAG现在什么情况？上次报价多少？今天先跟谁？'
            }
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '13px 48px 13px 16px', fontSize: 14.5, color: colors.textPrimary, outline: 'none', boxSizing: 'border-box', fontFamily: "'Space Grotesk',sans-serif" }}
            onFocus={(e) => (e.target.style.borderColor = 'rgba(203,168,92,0.45)')}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.09)')}
          />
          <button
            onClick={go}
            disabled={busy}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, borderRadius: 9, background: value.trim() ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', fontSize: 16 }}
          >{busy ? '…' : '↵'}</button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          onChange={handleFilePicked}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SHORTCUTS.map((s) => (
            <span
              key={s}
              onClick={() => {
                if (s === UPLOAD_SHORTCUT_ZH || s === UPLOAD_SHORTCUT_EN) fileInputRef.current?.click();
                else navigate('/business-assistant');
              }}
              style={{ fontSize: 11.5, color: MUTED, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '5px 12px', cursor: 'pointer' }}
            >
              {s}
            </span>
          ))}
        </div>

        {selectedFile && !pendingDrivePlan && !pendingBusinessDocument && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(203,168,92,0.05)', border: `1px solid ${BORD}`, borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 8 }}>
              {lang === 'zh' ? '准备收纳文件' : 'Ready to store file'}
            </div>
            {multiDropNotice && (
              <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6 }}>
                {lang === 'zh' ? '一次请上传一个文件，已选择第一个文件' : 'Please upload one file at a time — the first file was selected'}
              </div>
            )}
            <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.7, marginBottom: 8 }}>
              <div>{lang === 'zh' ? '文件：' : 'File: '}{selectedFile.name}</div>
              <div>{lang === 'zh' ? '大小：' : 'Size: '}{formatFileSize(selectedFile.size)}</div>
            </div>

            {uploadPhase === 'describe' && (
              <>
                <div style={{ fontSize: 12.5, color: TEXT, marginBottom: 6 }}>
                  {lang === 'zh' ? '告诉 GIA 这份文件属于谁 / 是什么资料：' : 'Tell GIA what this file is or who it belongs to:'}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={fileDescription}
                    onChange={(e) => setFileDescription(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleFileText(fileDescription); } }}
                    placeholder={lang === 'zh' ? '例如：这是 SHADI 的劳务合同' : "Example: This is SHADI's manpower contract"}
                    style={{ flex: 1, fontSize: 12.5, padding: '7px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: TEXT, outline: 'none' }}
                  />
                  <button
                    disabled={describeBusy || !fileDescription.trim()}
                    onClick={() => handleFileText(fileDescription)}
                    style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: '#080D1E', fontWeight: 700 }}
                  >
                    {describeBusy ? (lang === 'zh' ? '搜索中…' : 'Searching…') : (lang === 'zh' ? '继续' : 'Continue')}
                  </button>
                </div>
              </>
            )}

            {uploadPhase === 'candidates' && describeCandidates && (
              <>
                <div style={{ fontSize: 12.5, color: TEXT, marginBottom: 6 }}>
                  {lang === 'zh' ? '我找到几个可能的位置：' : 'I found a few possible locations:'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {describeCandidates.map((f) => (
                    <button key={f.id} onClick={() => pickDescribeCandidate(f)} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT }}>
                      {f.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            {(uploadPhase === 'suggested' || uploadPhase === 'no_match') && (
              <>
                <div style={{ fontSize: 12.5, color: TEXT, marginBottom: 8 }}>
                  {uploadPhase === 'no_match'
                    ? (lang === 'zh' ? '未找到明确对应目录。建议：' : 'No clear matching folder found. Suggested: ')
                    : (lang === 'zh' ? '建议位置：' : 'Suggested location: ')}
                  <strong style={{ color: GOLD }}>{selectedFolder.name}</strong>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    disabled={uploadBusy}
                    onClick={confirmFileUpload}
                    style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: '#080D1E', fontWeight: 700 }}
                  >
                    {uploadBusy
                      ? (lang === 'zh' ? '上传中…' : 'Uploading…')
                      : uploadPhase === 'no_match'
                        ? (lang === 'zh' ? '先存 Inbox' : 'Store in Inbox')
                        : (lang === 'zh' ? '确认上传' : 'Upload')}
                  </button>
                  <button
                    disabled={uploadBusy}
                    onClick={openManualPicker}
                    style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}
                  >
                    {uploadPhase === 'no_match'
                      ? (lang === 'zh' ? '选择其他位置' : 'Choose other location')
                      : (lang === 'zh' ? '修改位置' : 'Change location')}
                  </button>
                </div>
              </>
            )}

            {manualPickerOpen && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORD}` }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={manualQuery}
                    onChange={(e) => setManualQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runManualFolderSearch(); } }}
                    placeholder={lang === 'zh' ? '搜索文件夹' : 'Search folders'}
                    style={{ flex: 1, fontSize: 12, padding: '5px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: TEXT, outline: 'none' }}
                  />
                  <button
                    disabled={manualSearchBusy || !manualQuery.trim()}
                    onClick={runManualFolderSearch}
                    style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT }}
                  >
                    {manualSearchBusy ? (lang === 'zh' ? '搜索中…' : 'Searching…') : (lang === 'zh' ? '选择文件夹' : 'Select folder')}
                  </button>
                </div>
                {manualCandidates && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {manualCandidates.map((f) => (
                      <button key={f.id} onClick={() => pickManualFolderCandidate(f)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT }}>
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
                {manualNotice && <div style={{ marginTop: 6, fontSize: 11.5, color: MUTED }}>{manualNotice}</div>}
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <button onClick={cancelFileUpload} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {uploadError && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: RED }}>
            {lang === 'zh' ? '上传失败，请重试' : 'Upload failed, please try again'}
            {uploadError ? `（${uploadError}）` : ''}
          </div>
        )}

        {uploadedFile && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(111,191,142,0.06)', border: '1px solid rgba(111,191,142,0.3)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 4 }}>
              {lang === 'zh' ? '✓ 已保存' : '✓ Saved'}
            </div>
            <div style={{ fontSize: 12.5, color: TEXT }}>{lang === 'zh' ? '已上传到 Google Drive' : 'Uploaded to Google Drive'}：{uploadedFile.name}</div>
            <div style={{ fontSize: 12.5, color: TEXT, marginBottom: 4 }}>{lang === 'zh' ? '位置：' : 'Location: '}{uploadedFile.folderName}</div>
            <a href={uploadedFile.driveUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: GOLD }}>
              {lang === 'zh' ? '查看文件 →' : 'View file →'}
            </a>
          </div>
        )}

        {pendingDriveFolderCreate && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(203,168,92,0.05)', border: `1px solid ${BORD}`, borderRadius: 10 }}>
            {pendingDriveFolderCreate.folderName === null ? (
              <>
                <div style={{ fontSize: 12.5, color: TEXT, marginBottom: 6 }}>
                  {lang === 'zh' ? '文件夹叫什么名字？' : 'What should the folder be named?'}
                </div>
                <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 8 }}>
                  {lang === 'zh' ? '（在下方输入框回复即可）' : '(reply in the box above)'}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 8 }}>
                  {lang === 'zh' ? '准备创建 Google Drive 文件夹' : 'Ready to create a Google Drive folder'}
                </div>
                <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.7, marginBottom: 8 }}>
                  <div>{lang === 'zh' ? '名称：' : 'Name: '}<strong style={{ color: GOLD }}>{pendingDriveFolderCreate.folderName}</strong></div>
                  <div>{lang === 'zh' ? '位置：' : 'Location: '}{pendingDriveFolderCreate.parentName}</div>
                </div>
                {folderCreateError && (
                  <div style={{ fontSize: 11.5, color: RED, marginBottom: 8 }}>
                    {lang === 'zh' ? '创建失败，请重试' : 'Failed to create, please try again'}（{folderCreateError}）
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    disabled={folderCreateBusy}
                    onClick={confirmFolderCreate}
                    style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: '#080D1E', fontWeight: 700 }}
                  >
                    {folderCreateBusy ? (lang === 'zh' ? '创建中…' : 'Creating…') : (lang === 'zh' ? '确认创建' : 'Create')}
                  </button>
                  <button
                    disabled={folderCreateBusy}
                    onClick={cancelFolderCreate}
                    style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}
                  >
                    {lang === 'zh' ? '取消' : 'Cancel'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {folderCreated && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(111,191,142,0.06)', border: '1px solid rgba(111,191,142,0.3)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 4 }}>
              {lang === 'zh' ? '✓ 文件夹已创建' : '✓ Folder created'}
            </div>
            <div style={{ fontSize: 12.5, color: TEXT, marginBottom: 4 }}>
              {folderCreated.name}
              {folderCreated.alreadyExisted ? (lang === 'zh' ? '（该文件夹已存在，未重复创建）' : ' (already existed — not duplicated)') : ''}
            </div>
            <a href={folderCreated.webViewLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: GOLD }}>
              {lang === 'zh' ? '查看文件夹 →' : 'View folder →'}
            </a>
          </div>
        )}

        {pendingDrivePlan && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(203,168,92,0.05)', border: `1px solid ${BORD}`, borderRadius: 10 }}>
            {drivePlanNotFound && !drivePlanEditOpen && (
              <>
                <div style={{ fontSize: 12.5, color: TEXT, marginBottom: 8 }}>
                  {lang === 'zh' ? `未找到 ${drivePlanNotFound} 文件夹。` : `Could not find a "${drivePlanNotFound}" folder.`}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={openDrivePlanEdit} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT }}>
                    {lang === 'zh' ? '选择其他位置' : 'Choose other location'}
                  </button>
                  <button onClick={cancelDrivePlan} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                    {lang === 'zh' ? '取消' : 'Cancel'}
                  </button>
                </div>
              </>
            )}

            {!drivePlanNotFound && drivePlanCandidates && !drivePlanEditOpen && (
              <>
                <div style={{ fontSize: 12.5, color: TEXT, marginBottom: 6 }}>
                  {lang === 'zh' ? '我找到几个可能的位置：' : 'I found a few possible locations:'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {drivePlanCandidates.map((f) => (
                    <button key={f.id} onClick={() => pickDrivePlanRootCandidate(f)} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT }}>
                      {f.name}
                    </button>
                  ))}
                </div>
                <button onClick={cancelDrivePlan} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                  {lang === 'zh' ? '取消' : 'Cancel'}
                </button>
              </>
            )}

            {!drivePlanNotFound && !drivePlanCandidates && !drivePlanEditOpen && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 8 }}>
                  {lang === 'zh' ? '准备执行' : 'Ready to execute'}
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: TEXT, lineHeight: 1.8 }}>
                  {pendingDrivePlan.steps.map((step, i) => {
                    if (step.type === 'FIND_FOLDER') {
                      return (
                        <li key={i}>
                          {lang === 'zh' ? '找到：' : 'Find: '}
                          {step.resolvedFolderName ?? step.query}
                        </li>
                      );
                    }
                    if (step.type === 'CREATE_FOLDER') {
                      const parent = pendingDrivePlan.steps[step.parentRef];
                      const parentName = parent && parent.type === 'FIND_FOLDER' ? (parent.resolvedFolderName ?? parent.query) : '?';
                      return (
                        <li key={i}>
                          {lang === 'zh' ? `在 ${parentName} 下新建：${step.folderName}` : `Create "${step.folderName}" under ${parentName}`}
                        </li>
                      );
                    }
                    const createStep = getCreateStep(pendingDrivePlan);
                    return (
                      <li key={i}>
                        {lang === 'zh' ? `上传当前文件到：${createStep?.folderName ?? ''}` : `Upload the current file to: ${createStep?.folderName ?? ''}`}
                      </li>
                    );
                  })}
                </ol>
                {drivePlanError && <div style={{ fontSize: 11.5, color: RED, marginTop: 8 }}>{drivePlanError}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    disabled={drivePlanBusy || !isRootResolved(pendingDrivePlan)}
                    onClick={confirmDrivePlan}
                    style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: '#080D1E', fontWeight: 700 }}
                  >
                    {drivePlanBusy ? (lang === 'zh' ? '执行中…' : 'Running…') : (lang === 'zh' ? '全部确认' : 'Confirm all')}
                  </button>
                  <button onClick={openDrivePlanEdit} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                    {lang === 'zh' ? '修改' : 'Edit'}
                  </button>
                  <button onClick={cancelDrivePlan} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                    {lang === 'zh' ? '取消' : 'Cancel'}
                  </button>
                </div>
              </>
            )}

            {drivePlanEditOpen && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 8 }}>
                  {lang === 'zh' ? '修改计划' : 'Edit plan'}
                </div>
                <div style={{ fontSize: 12, color: TEXT, marginBottom: 4 }}>{lang === 'zh' ? '父文件夹：' : 'Parent folder:'}</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input
                    value={drivePlanEditParentQuery}
                    onChange={(e) => setDrivePlanEditParentQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchDrivePlanParentEdit(); } }}
                    placeholder={lang === 'zh' ? '搜索文件夹' : 'Search folders'}
                    style={{ flex: 1, fontSize: 12, padding: '5px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: TEXT, outline: 'none' }}
                  />
                  <button disabled={drivePlanBusy || !drivePlanEditParentQuery.trim()} onClick={searchDrivePlanParentEdit} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT }}>
                    {lang === 'zh' ? '搜索' : 'Search'}
                  </button>
                </div>
                {drivePlanCandidates && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {drivePlanCandidates.map((f) => (
                      <button key={f.id} onClick={() => pickDrivePlanEditParent(f)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT }}>
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 12, color: TEXT, marginBottom: 4 }}>{lang === 'zh' ? '子文件夹名称：' : 'Child folder name:'}</div>
                <input
                  value={drivePlanEditChildName}
                  onChange={(e) => setDrivePlanEditChildName(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '6px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: TEXT, outline: 'none', marginBottom: 10 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={closeDrivePlanEdit} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: '#080D1E', fontWeight: 700 }}>
                    {lang === 'zh' ? '完成' : 'Done'}
                  </button>
                  <button onClick={cancelDrivePlan} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                    {lang === 'zh' ? '取消' : 'Cancel'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {pendingBusinessDocument && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(203,168,92,0.05)', border: `1px solid ${BORD}`, borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 8 }}>
              {lang === 'zh' ? '准备记录业务文件' : 'Ready to record business document'}
            </div>
            <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.8, marginBottom: 8 }}>
              <div>
                {lang === 'zh' ? '客户：' : 'Customer: '}
                {pendingBusinessDocument.customerName ? (
                  pendingBusinessDocument.customerName
                ) : (
                  <span style={{ color: MUTED }}>
                    {pendingBusinessDocument.entityName}
                    {lang === 'zh' ? '（尚未关联CRM客户）' : ' (not linked to a CRM customer)'}
                  </span>
                )}
              </div>
              <div>{lang === 'zh' ? '类型：' : 'Type: '}{lang === 'zh' ? DOC_TYPE_LABEL_ZH[pendingBusinessDocument.documentType] : DOC_TYPE_LABEL_EN[pendingBusinessDocument.documentType]}</div>
              <div>{lang === 'zh' ? '标题：' : 'Title: '}{pendingBusinessDocument.title}</div>
              {pendingBusinessDocument.versionLabel && <div>{lang === 'zh' ? '版本：' : 'Version: '}{pendingBusinessDocument.versionLabel}</div>}
              <div>{lang === 'zh' ? '状态：' : 'Status: '}{lang === 'zh' ? STATUS_LABEL_ZH[pendingBusinessDocument.status] : STATUS_LABEL_EN[pendingBusinessDocument.status]}</div>
              <div>{lang === 'zh' ? '日期：' : 'Date: '}{pendingBusinessDocument.documentDate}</div>
              {pendingBusinessDocument.amount != null && (
                <div>{lang === 'zh' ? '金额：' : 'Amount: '}{pendingBusinessDocument.currency} {pendingBusinessDocument.amount}</div>
              )}
              <div>{lang === 'zh' ? '文件：' : 'File: '}{selectedFile?.name}</div>
              <div>{lang === 'zh' ? '目标Drive目录：' : 'Target Drive folder: '}{selectedFolder.name}</div>
            </div>

            {pendingBusinessDocument.candidateCustomers && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: TEXT, marginBottom: 6 }}>
                  {lang === 'zh' ? '找到多个可能的客户：' : 'Found multiple possible customers:'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {pendingBusinessDocument.candidateCustomers.map((c) => (
                    <button key={c.id} onClick={() => pickBusinessDocumentCustomer(c)} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT }}>
                      {c.customer_name}
                    </button>
                  ))}
                  <button onClick={useUnlinkedBusinessDocumentCustomer} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                    {lang === 'zh' ? '不关联客户' : 'No customer link'}
                  </button>
                </div>
              </div>
            )}

            {businessDocError && <div style={{ fontSize: 11.5, color: RED, marginBottom: 8 }}>{businessDocError}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={businessDocBusy || !!pendingBusinessDocument.candidateCustomers}
                onClick={confirmBusinessDocumentSave}
                style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: '#080D1E', fontWeight: 700 }}
              >
                {businessDocBusy ? (lang === 'zh' ? '保存中…' : 'Saving…') : (lang === 'zh' ? '确认保存' : 'Confirm save')}
              </button>
              <button disabled={businessDocBusy} onClick={editBusinessDocument} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                {lang === 'zh' ? '修改' : 'Edit'}
              </button>
              <button disabled={businessDocBusy} onClick={cancelBusinessDocument} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {businessDocSaved && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(111,191,142,0.06)', border: '1px solid rgba(111,191,142,0.3)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 4 }}>
              {lang === 'zh' ? '✓ 已记录业务文件' : '✓ Business document recorded'}
            </div>
            <div style={{ fontSize: 12.5, color: TEXT }}>{businessDocSaved.title}</div>
            <div style={{ fontSize: 12.5, color: TEXT, marginBottom: 4 }}>{lang === 'zh' ? '位置：' : 'Location: '}{businessDocSaved.folderName}</div>
            <a href={businessDocSaved.driveUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: GOLD }}>
              {lang === 'zh' ? '查看文件 →' : 'View file →'}
            </a>
          </div>
        )}

        {drivePlanResult && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: drivePlanResult.ok ? 'rgba(111,191,142,0.06)' : 'rgba(224,132,106,0.06)', border: `1px solid ${drivePlanResult.ok ? 'rgba(111,191,142,0.3)' : 'rgba(224,132,106,0.35)'}`, borderRadius: 10 }}>
            {drivePlanResult.ok ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 4 }}>
                  {lang === 'zh' ? '✓ 已完成' : '✓ Done'}
                </div>
                {drivePlanResult.createdFolder && (
                  <div style={{ fontSize: 12.5, color: TEXT }}>
                    {lang === 'zh' ? '已创建：' : 'Created: '}{drivePlanResult.createdFolder.name}
                  </div>
                )}
                {drivePlanResult.uploadedFile && (
                  <>
                    <div style={{ fontSize: 12.5, color: TEXT }}>
                      {lang === 'zh' ? '最终位置：My Drive / ' : 'Final location: My Drive / '}{drivePlanResult.uploadedFile.folderName}
                    </div>
                    <a href={drivePlanResult.uploadedFile.driveUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: GOLD }}>
                      {lang === 'zh' ? '查看文件 →' : 'View file →'}
                    </a>
                  </>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 4 }}>
                  {lang === 'zh' ? '执行失败' : 'Execution failed'}
                </div>
                {drivePlanResult.folderCreatedButUploadFailed && (
                  <div style={{ fontSize: 12.5, color: TEXT, marginBottom: 4 }}>
                    {lang === 'zh' ? '文件夹已创建，但文件上传失败。' : 'Folder created, but file upload failed.'}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: MUTED }}>{drivePlanResult.error}</div>
              </>
            )}
          </div>
        )}

        {fileSearchReply && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(203,168,92,0.05)', border: `1px solid ${BORD}`, borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 6 }}>GIA 回复</div>
            <div style={{ fontSize: 12.5, color: TEXT, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{fileSearchReply}</div>
            <button onClick={() => setFileSearchReply(null)} style={{ marginTop: 8, padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>关闭</button>
          </div>
        )}

        {captureError && <div style={{ marginTop: 12, fontSize: 12.5, color: RED }}>{captureError}</div>}

        {pendingTaskLifecycle && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(203,168,92,0.05)', border: `1px solid ${BORD}`, borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 8 }}>
              {pendingTaskLifecycle.matches.length > 1 ? '找到多个匹配的待办，请选择：' : `将标记为${pendingTaskLifecycle.action === 'completed' ? '完成' : '取消'}：`}
            </div>
            {pendingTaskLifecycle.matches.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 7, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: TEXT }}>{t.title}</span>
                <button disabled={captureBusy === 'all'} onClick={() => handleConfirmTaskLifecycle(t.id)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}>确认</button>
              </div>
            ))}
          </div>
        )}

        {pendingTaskReschedule && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(203,168,92,0.05)', border: `1px solid ${BORD}`, borderRadius: 10 }}>
            {!pendingTaskReschedule.resolvedDate ? (
              <div style={{ fontSize: 12, color: RED }}>无法识别日期"{pendingTaskReschedule.whenPhrase}"，请换个说法。</div>
            ) : (
              pendingTaskReschedule.matches.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 7, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: TEXT }}>{t.title}</span>
                  <button disabled={captureBusy === 'all'} onClick={() => handleConfirmTaskReschedule(t.id)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}>确认改期至 {pendingTaskReschedule.resolvedDate}</button>
                </div>
              ))
            )}
          </div>
        )}

        {pendingCapture && pendingCapture.length > 0 && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(203,168,92,0.05)', border: `1px solid ${BORD}`, borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 8 }}>
              商务助理理解为{pendingCapture.length > 1 ? `（共 ${pendingCapture.length} 项）` : ''}：
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {pendingCapture.map((item, i) => {
                const done = captureDone.has(i);
                return (
                  <div key={i} style={{ padding: '8px 12px', background: done ? 'rgba(111,191,142,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${done ? 'rgba(111,191,142,0.3)' : BORD}`, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: '#8FA6D4', marginBottom: 3 }}>[{i + 1}] {item.type}</div>
                    {item.summaryLines
                      .filter((l) => !(item.type === 'BUSINESS_TODO' && l.startsWith('业务领域：')))
                      .map((l, li) => (
                        <div key={li} style={{ fontSize: 12, color: TEXT, lineHeight: 1.5 }}>{l}</div>
                      ))}
                    {item.type === 'BUSINESS_TODO' && (
                      done ? (
                        <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.5 }}>
                          {lang === 'zh' ? '业务领域：' : 'Business area: '}
                          {lang === 'zh' ? BUSINESS_AREA_LABEL_ZH[item.raw.todo_business_area ?? 'OTHER'] : BUSINESS_AREA_LABEL[item.raw.todo_business_area ?? 'OTHER']}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 12, color: TEXT }}>{lang === 'zh' ? '业务领域：' : 'Business area:'}</span>
                          <select
                            value={item.raw.todo_business_area ?? 'OTHER'}
                            onChange={(e) => changeBusinessArea(i, e.target.value as TaskBusinessArea)}
                            style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORD}`, color: TEXT }}
                          >
                            {ALL_BUSINESS_AREAS.map((a) => (
                              // Explicit per-option background+color — the native options
                              // popup does not reliably inherit the <select>'s own dark
                              // background in Chrome/Edge (it defaults to a light system
                              // popup), which left light gold text on a light background
                              // almost unreadable. Each <option> setting its own colors is
                              // the standard cross-browser fix, not a full dropdown rebuild.
                              <option key={a} value={a} style={{ background: '#0B1220', color: '#F2F2F2' }}>{lang === 'zh' ? BUSINESS_AREA_LABEL_ZH[a] : BUSINESS_AREA_LABEL[a]}</option>
                            ))}
                          </select>
                        </div>
                      )
                    )}

                    {item.candidateCustomers && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {item.candidateCustomers.map((c) => (
                          <button key={c.id} onClick={() => pickCandidateCustomer(i, c)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORD}`, color: TEXT }}>
                            使用「{c.customer_name}」
                          </button>
                        ))}
                        <button onClick={() => createAsNewInstead(i)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(203,168,92,0.1)', border: '1px solid rgba(203,168,92,0.3)', color: GOLD }}>
                          创建新客户
                        </button>
                      </div>
                    )}

                    {!item.candidateCustomers && !item.needsCustomerName && !item.needsContent && !item.crmNoMatchBlocked && !done && (
                      <button
                        disabled={captureBusy === i || captureBusy === 'all'}
                        onClick={() => handleConfirmItem(i)}
                        style={{ marginTop: 6, padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(111,191,142,0.14)', border: '1px solid rgba(111,191,142,0.4)', color: GREEN }}
                      >
                        {captureBusy === i ? '写入中…' : '确认此项'}
                      </button>
                    )}
                    {done && <div style={{ marginTop: 4, fontSize: 11, color: GREEN }}>✓ 已保存</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={captureBusy === 'all'}
                onClick={handleConfirmAll}
                style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#E2C988)`, border: 'none', color: '#080D1E', fontWeight: 700 }}
              >
                {captureBusy === 'all' ? '保存中…' : '全部确认'}
              </button>
              <button onClick={() => { setPendingCapture(null); setCaptureDone(new Set()); }} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
