// GCI Company Documents — direct port of 25H-WorkforceOS's Company Documents module (see
// companyDocumentsService.ts). Flat filterable list per this feature's own spec, rather than
// WorkforceOS's category-cards-then-drill-down home screen — same underlying data/service, a
// different page shape was explicitly requested for GCI. View/upload are open to any authenticated
// user; delete is Active-Admin-only. Enforced for real by RLS (see the migration) — the
// canUpload/isAdmin checks here are convenience only.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@gci/i18n';
import { useAuth } from '../contexts/AuthContext';
import { AccountVault } from '../components/AccountVault';
import {
  fetchCompanyDocuments, uploadCompanyDocument, deleteCompanyDocument, getCompanyDocumentSignedUrl,
  fetchUserDisplayNames, fetchDocumentCategories, createDocumentCategory,
  createPendingCompanyDocument, runDocumentAIRecognition, matchSuggestedCategory, fetchStoredFileForAI,
  confirmAIDocument,
  type CompanyDocument, type CompanyDocumentCategory, type AIDocumentFields,
} from '../lib/companyDocumentsService';
import { workspaceFontFamily } from '@gci/design-system';

// i18n: English for this page's fixed UI text (database values are never translated).
// LANG is set from the language context by the page component on every render.
let LANG: 'zh' | 'en' = 'zh';
const EN: Record<string, string> = {
  "确认删除文件《": "Delete file “",
  "》？此操作不可恢复。": "”? This cannot be undone.",
  "AI 建议：": "AI suggestion: ",
  "（当前分类库中没有，可新建或手动选择）": "(not in the category list yet — create it or choose manually)",
  "✓ 已识别": "✓ Recognised",
  "⚠ 待复核": "⚠ Needs review",
  "✕ 识别失败": "✕ Recognition failed",
  "识别中…": "Recognising…",
  "待识别": "Not recognised yet",
  "请输入分类名称": "Please enter a category name",
  "该分类已存在": "This category already exists",
  "保存失败，请重试": "Save failed, please try again",
  "请选择文件": "Please choose a file",
  "请选择分类": "Please choose a category",
  "请填写文件名称": "Please enter a file name",
  "无法读取原文件": "Could not read the original file",
  "生成链接失败": "Could not create the link",
  "返回": "Back",
  "公司文件": "Company Documents",
  "上传文件": "Upload File",
  "账号与登录": "Accounts & Logins",
  "全部分类": "All categories",
  "搜索文件名…": "Search file name…",
  "全部到期状态": "All expiry states",
  "已过期": "Expired",
  "即将到期(30天)": "Expiring (30 days)",
  "无到期日": "No expiry date",
  "处理方式": "Handling",
  "智能识别并提醒": "Recognise & remind",
  "证照类：营业执照、CIC、保险、车辆证件…": "Licences: trade licence, CIC, insurance, vehicle papers…",
  "仅保存归档": "Archive only",
  "合同、内部文件、留底资料…（默认）": "Contracts, internal files, records… (default)",
  "点击选择文件，或拖拽文件到此处上传（PDF/JPG/PNG 自动识别）": "Click to choose a file, or drag it here (PDF/JPG/PNG are recognised automatically)",
  "点击选择文件，或拖拽文件到此处上传": "Click to choose a file, or drag it here",
  "— 选择分类 —": "— Choose category —",
  "+ 新建分类": "+ New category",
  "新分类名称": "New category name",
  "保存中…": "Saving…",
  "保存": "Save",
  "取消": "Cancel",
  "文件名称": "File name",
  "到期日期（可选）": "Expiry date (optional)",
  "说明 / 备注": "Description / notes",
  "上传中…": "Uploading…",
  "上传": "Upload",
  "正在识别文件…": "Recognising file…",
  "AI 正在读取文件内容，通常几秒钟": "AI is reading the file — this usually takes a few seconds",
  "AI 识别结果": "AI recognition result",
  "置信度": "Confidence",
  "（建议人工核对）": "(please double-check)",
  "AI 识别失败，请手动填写": "AI recognition failed — please fill in manually",
  "文件类型": "Document type",
  "建议分类": "Suggested category",
  "公司名称": "Company name",
  "证件号": "Licence / ID no.",
  "签发日期": "Issue date",
  "到期日期": "Expiry date",
  "签发机构": "Issuing authority",
  "摘要": "Summary",
  "确认并保存": "Confirm & save",
  "重新识别": "Recognise again",
  "加载中…": "Loading…",
  "没有符合条件的文件": "No matching files",
  "文件名": "File name",
  "分类": "Category",
  "说明": "Description",
  "上传人": "Uploaded by",
  "上传时间": "Uploaded at",
  "查看": "View",
  "下载": "Download",
  "AI 识别": "AI recognise",
  "删除": "Delete"
};
const tx = (zh: string): string => (LANG === 'en' ? EN[zh] ?? zh : zh);


const ADD_CATEGORY_VALUE = '__add_new__';

// Company Documents Intelligence V2 Phase 1 — only these 4 MIME types go
// through AI recognition; anything else falls straight to the existing
// manual upload form unchanged (never blocked).
const AI_SUPPORTED_MIME = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

// Task: not every company file needs Gemini. User picks the processing mode
// per upload; only 'smart' ever calls /api/company-documents/parse-document.
type ProcessingMode = 'archive' | 'smart';
// Category names that nudge the toggle to 'smart' when selected — still just
// a suggestion, the user can switch it back. "Ejari / Lease" isn't a live
// category yet (see prior audit), but matching is by name against whatever
// company_document_categories actually returns, so this list just quietly
// does nothing until/unless that category exists — no separate check needed.
const SMART_SUGGESTED_CATEGORIES = [
  'Trade License', 'CIC Card', 'Insurance', 'Vehicles', 'Government Documents', 'HR/Employee', 'Ejari / Lease',
];

type AiStage = 'idle' | 'recognizing' | 'review' | 'manual';

interface ReviewFormState {
  category: string;
  document_name: string;
  document_type: string;
  company_name: string;
  document_number: string;
  issue_date: string;
  expiry_date: string;
  issuing_authority: string;
  ai_summary: string;
  notes: string;
}
const EMPTY_REVIEW: ReviewFormState = {
  category: '', document_name: '', document_type: '', company_name: '', document_number: '',
  issue_date: '', expiry_date: '', issuing_authority: '', ai_summary: '', notes: '',
};

const GOLD = '#7A5F2A';
const RED = '#C53030';
const AMBER = '#B45309';
const MUTED = '#475569';
const CARD = '#FFFFFF';
const BORD = 'rgba(12,27,58,0.07)';

type ExpiryFilter = 'all' | 'expired' | 'soon' | 'none';

const inputSt: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(12,27,58,0.04)',
  border: `1px solid ${BORD}`, color: '#0C1B3A',
};

// Scoped to this page only (className below is unique to it) — native <select> popups ignore
// most inline styling, but Windows Chrome/Edge do honor `color-scheme` plus `option{}` rules, so
// this is enough to stop the default white dropdown/near-invisible text without touching any
// other module's <select>. Same scoped-CSS-via-<style> convention already used by
// InvoicePreview.tsx (INVOICE_SCOPED_CSS).
const COMPANY_DOCUMENTS_SELECT_CSS = `
.gci-cd-select { color-scheme: light; }
.gci-cd-select option {
  background-color: #FFFFFF;
  color: #0C1B3A;
}
.gci-cd-select option:checked,
.gci-cd-select option:hover,
.gci-cd-select option:focus {
  background-color: #7A5F2A;
  color: #1A1206;
}
`;

function formatBytes(n: number | null): string {
  if (n === null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Task: "仅保存归档" files stay ai_status=null forever unless someone later
// clicks "AI 识别" — this badge is how the list distinguishes "never
// touched by AI" (no badge) from an actual recognition outcome.
function aiStatusBadge(status: string | null, isZh: boolean): { label: string; color: string } | null {
  switch (status) {
    case 'completed': return { label: isZh ? tx('✓ 已识别') : '✓ Recognized', color: '#15803D' };
    case 'needs_review': return { label: isZh ? tx('⚠ 待复核') : '⚠ Needs Review', color: '#B45309' };
    case 'failed': return { label: isZh ? tx('✕ 识别失败') : '✕ Failed', color: '#C53030' };
    case 'processing': return { label: isZh ? tx('识别中…') : 'Recognizing…', color: '#475569' };
    case 'pending': return { label: isZh ? tx('待识别') : 'Pending', color: '#475569' };
    default: return null;
  }
}

function expiryStatus(expiry: string | null): 'expired' | 'soon' | 'none' | 'ok' {
  if (!expiry) return 'none';
  const days = (new Date(expiry).getTime() - Date.now()) / 86400000;
  if (days < 0) return 'expired';
  if (days <= 30) return 'soon';
  return 'ok';
}

interface UploadFormState {
  file: File | null;
  category: string;
  document_name: string;
  expiry_date: string;
  notes: string;
}
const EMPTY_UPLOAD: UploadFormState = { file: null, category: '', document_name: '', expiry_date: '', notes: '' };

export function CompanyDocuments() {
  LANG = useI18n().lang; // keep tx() in sync with the language toggle
  const navigate = useNavigate();
  const { profile } = useAuth();
  // Mirrors public.is_active_admin() (role_label='Admin' AND is_active=true) — AuthContext's own
  // loadProfile() already filters .eq('is_active', true), so any loaded profile is guaranteed
  // active; this is a UX convenience only, RLS is the real boundary.
  const isAdmin = profile?.role_label === 'Admin';
  // Mirrors the company_documents UPDATE RLS policy's second exception (see
  // 20260917c_company_documents_ai_fields.sql) — Lili can update/re-run AI on
  // any document, not just her own uploads, same as an Admin. Reuses the
  // profile's own display_name, no hardcoded user id.
  const isLili = profile?.display_name === 'Lili';
  // Upload permission (2026-09): any authenticated user, not just Admin — matches the
  // authenticated-can-INSERT RLS policy (see the migration). loadProfile() only ever returns a
  // row for an active user, so a loaded profile is sufficient here.
  const canUpload = !!profile;
  // Display-only i18n (same convention as Tasks.tsx): switches with the app's EN/中文 toggle via
  // localStorage, no shared i18n dict entries needed for this page's body text.
  const isZh = (localStorage.getItem('gci_platform_language_v1') || 'zh') === 'zh';

  const [docs, setDocs] = useState<CompanyDocument[] | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CompanyDocumentCategory[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryError, setNewCategoryError] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('all');

  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState<UploadFormState>(EMPTY_UPLOAD);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  // Processing mode picker — default "仅保存归档", never calls Gemini unless
  // the user explicitly picks "智能识别并提醒" (or clicks the per-row "AI 识别"
  // button later). Reset to the default each time the upload panel opens.
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('archive');

  // Company Documents Intelligence V2 Phase 1 — AI recognition flow
  const [aiStage, setAiStage] = useState<AiStage>('idle');
  const [aiDocument, setAiDocument] = useState<CompanyDocument | null>(null);
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiFields, setAiFields] = useState<AIDocumentFields | null>(null);
  const [aiError, setAiError] = useState('');
  const [reviewForm, setReviewForm] = useState<ReviewFormState>(EMPTY_REVIEW);
  const [savingReview, setSavingReview] = useState(false);
  const [rowAiBusy, setRowAiBusy] = useState<string | null>(null);

  // Nav final collapse (2026-09-16) — 账号与权限/Access Vault moved off the
  // sidebar into a tab here. It never had a real page (was a path-less
  // "coming soon" placeholder before this round), so its tab below is the
  // same placeholder content, just reachable a different way — not new
  // business functionality.
  const [outerTab, setOuterTab] = useState<'documents' | 'accessVault'>('documents');

  function load() {
    Promise.all([fetchCompanyDocuments(), fetchUserDisplayNames()]).then(([rows, names]) => {
      setDocs(rows);
      setUserNames(names);
    });
  }
  function loadCategories() {
    fetchDocumentCategories().then(setCategories);
  }
  useEffect(() => { load(); loadCategories(); }, []);

  // Shared "+ Add Category" widget between the plain manual form (uploadForm)
  // and the AI review/manual-fallback panel (reviewForm) — only one of the two
  // panels is ever visible at once (aiStage === 'idle' vs not), so which
  // target to write into is just aiStage.
  const handleCategorySelect = (value: string) => {
    if (value === ADD_CATEGORY_VALUE) {
      setAddingCategory(true);
      setNewCategoryName('');
      setNewCategoryError('');
      return;
    }
    if (aiStage === 'idle') {
      setUploadForm(f => ({ ...f, category: value }));
      // Nudge, not force — user can still flip the toggle back afterward.
      if (SMART_SUGGESTED_CATEGORIES.includes(value)) setProcessingMode('smart');
    } else {
      setReviewForm(f => ({ ...f, category: value }));
    }
  };

  const saveNewCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) { setNewCategoryError(isZh ? tx('请输入分类名称') : 'Category name is required'); return; }
    setSavingCategory(true);
    setNewCategoryError('');
    const res = await createDocumentCategory(trimmed);
    setSavingCategory(false);
    if (!res.ok) {
      setNewCategoryError(
        res.error === 'duplicate'
          ? (isZh ? tx('该分类已存在') : 'This category already exists')
          : (isZh ? tx('保存失败，请重试') : 'Failed to save, please retry'),
      );
      return;
    }
    setCategories(prev => [...prev, res.category].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
    if (aiStage === 'idle') setUploadForm(f => ({ ...f, category: res.category.name }));
    else setReviewForm(f => ({ ...f, category: res.category.name }));
    setAddingCategory(false);
    setNewCategoryName('');
  };

  const filtered = useMemo(() => {
    if (!docs) return [];
    return docs.filter(d => {
      if (categoryFilter && d.category !== categoryFilter) return false;
      if (search.trim() && !d.document_name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (expiryFilter !== 'all') {
        const status = expiryStatus(d.expiry_date);
        if (expiryFilter === 'expired' && status !== 'expired') return false;
        if (expiryFilter === 'soon' && status !== 'soon') return false;
        if (expiryFilter === 'none' && status !== 'none') return false;
      }
      return true;
    });
  }, [docs, categoryFilter, search, expiryFilter]);

  const openUpload = () => { setUploadForm(EMPTY_UPLOAD); setUploadError(''); setProcessingMode('archive'); setShowUpload(true); };
  const closeUpload = () => {
    setShowUpload(false);
    setUploadForm(EMPTY_UPLOAD);
    setUploadError('');
    setProcessingMode('archive');
    setAiStage('idle');
    setAiDocument(null);
    setAiFile(null);
    setAiFields(null);
    setAiError('');
    setReviewForm(EMPTY_REVIEW);
  };

  // Populates the review form from a set of AI-extracted fields, matching
  // suggested_category against the live category list (never auto-creates
  // one — see matchSuggestedCategory's own doc comment).
  const applyAIFields = (fields: AIDocumentFields, fallbackName: string) => {
    const matched = matchSuggestedCategory(fields.suggested_category, categories);
    setAiFields(fields);
    setReviewForm({
      category: matched?.name || '',
      document_name: fields.document_type
        ? `${fields.document_type}${fields.company_name ? ' - ' + fields.company_name : ''}`
        : fallbackName,
      document_type: fields.document_type || '',
      company_name: fields.company_name || '',
      document_number: fields.document_number || '',
      issue_date: fields.issue_date || '',
      expiry_date: fields.expiry_date || '',
      issuing_authority: fields.issuing_authority || '',
      ai_summary: fields.summary || '',
      notes: '',
    });
  };

  const acceptFile = async (file: File | undefined) => {
    if (!file) return;
    setShowUpload(true);
    setUploadError('');
    // "仅保存归档" (the default) or a mime type Gemini can't read either way —
    // straight to the manual form, no /api/company-documents/parse-document
    // call at all. "智能识别并提醒" only fires when both the user picked it
    // AND the file is actually a type AI can process.
    if (processingMode === 'archive' || !AI_SUPPORTED_MIME.includes(file.type)) {
      setUploadForm(f => ({ ...f, file, document_name: f.document_name || file.name }));
      return;
    }
    setAiStage('recognizing');
    setAiFile(file);
    setAiError('');
    const created = await createPendingCompanyDocument(file);
    if (!created.ok) {
      setAiStage('idle');
      setUploadError(created.error);
      return;
    }
    setAiDocument(created.document);
    const result = await runDocumentAIRecognition(created.document.id, file);
    if (!result.ok) {
      setAiError(result.error);
      setReviewForm({ ...EMPTY_REVIEW, document_name: file.name });
      setAiStage('manual');
      return;
    }
    applyAIFields(result.fields, file.name);
    setAiStage('review');
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); if (canUpload) setIsDraggingOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (!canUpload) return;
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const submitUpload = async () => {
    if (!uploadForm.file) { setUploadError(isZh ? tx('请选择文件') : 'Please choose a file'); return; }
    if (!uploadForm.category) { setUploadError(isZh ? tx('请选择分类') : 'Please choose a category'); return; }
    if (!uploadForm.document_name.trim()) { setUploadError(isZh ? tx('请填写文件名称') : 'Document name is required'); return; }
    setUploading(true);
    setUploadError('');
    const { error: uploadErr } = await uploadCompanyDocument({
      file: uploadForm.file,
      category: uploadForm.category,
      document_name: uploadForm.document_name.trim(),
      expiry_date: uploadForm.expiry_date || null,
      notes: uploadForm.notes.trim(),
      // Save Only always disables reminders, even if an expiry date was
      // typed in manually — pure archival, per spec. A file that landed
      // here because AI couldn't read its mime type (user picked Smart
      // anyway) still follows the normal "only if a date was actually
      // entered" rule.
      reminder_enabled: processingMode === 'archive' ? false : !!uploadForm.expiry_date,
    });
    setUploading(false);
    if (uploadErr) { setUploadError(uploadErr); return; }
    closeUpload();
    load();
  };

  // "重新识别" — works whether aiFile is already in memory (just-uploaded case)
  // or not (reopened an existing row via the list's "AI 识别" button; lazily
  // re-downloads the file from Storage first).
  const handleReRecognize = async () => {
    if (!aiDocument) return;
    setAiStage('recognizing');
    setAiError('');
    let file = aiFile;
    if (!file) {
      file = await fetchStoredFileForAI(aiDocument);
      if (!file) {
        setAiError(isZh ? tx('无法读取原文件') : 'Could not read the original file');
        setAiStage('manual');
        return;
      }
      setAiFile(file);
    }
    const result = await runDocumentAIRecognition(aiDocument.id, file);
    if (!result.ok) {
      setAiError(result.error);
      setAiStage('manual');
      return;
    }
    applyAIFields(result.fields, file.name);
    setAiStage('review');
  };

  // "AI 识别" button on an existing row. If it already has a completed/needs_review
  // result, reopen the review panel pre-filled from what's stored (no AI call, no
  // extra cost) — "重新识别" inside the panel re-runs it on demand. Otherwise
  // (never processed, or a previous attempt failed) run it fresh now.
  const openReviewForExistingDoc = async (doc: CompanyDocument) => {
    setRowAiBusy(doc.id);
    setAiDocument(doc);
    setAiFile(null);
    setAiError('');
    setShowUpload(true);

    if (doc.ai_status === 'completed' || doc.ai_status === 'needs_review') {
      setAiFields((doc.ai_extracted as unknown as AIDocumentFields) || null);
      setReviewForm({
        category: doc.category,
        document_name: doc.document_name,
        document_type: doc.document_type || '',
        company_name: doc.company_name || '',
        document_number: doc.document_number || '',
        issue_date: doc.issue_date || '',
        expiry_date: doc.expiry_date || '',
        issuing_authority: doc.issuing_authority || '',
        ai_summary: doc.ai_summary || '',
        notes: doc.notes || '',
      });
      setAiStage('review');
      setRowAiBusy(null);
      return;
    }

    setAiStage('recognizing');
    const file = await fetchStoredFileForAI(doc);
    setRowAiBusy(null);
    if (!file) {
      setAiError(isZh ? tx('无法读取原文件') : 'Could not read the original file');
      setReviewForm({
        category: doc.category, document_name: doc.document_name, document_type: '', company_name: '',
        document_number: '', issue_date: '', expiry_date: doc.expiry_date || '', issuing_authority: '',
        ai_summary: '', notes: doc.notes || '',
      });
      setAiStage('manual');
      return;
    }
    setAiFile(file);
    const result = await runDocumentAIRecognition(doc.id, file);
    if (!result.ok) {
      setAiError(result.error);
      setReviewForm({
        category: doc.category, document_name: doc.document_name, document_type: '', company_name: '',
        document_number: '', issue_date: '', expiry_date: doc.expiry_date || '', issuing_authority: '',
        ai_summary: '', notes: doc.notes || '',
      });
      setAiStage('manual');
      return;
    }
    applyAIFields(result.fields, doc.document_name);
    setAiStage('review');
  };

  const handleConfirmSave = async () => {
    if (!aiDocument) return;
    if (!reviewForm.category) { setAiError(isZh ? tx('请选择分类') : 'Please choose a category'); return; }
    if (!reviewForm.document_name.trim()) { setAiError(isZh ? tx('请填写文件名称') : 'Document name is required'); return; }
    setSavingReview(true);
    setAiError('');
    const { error } = await confirmAIDocument(aiDocument.id, {
      category: reviewForm.category,
      document_name: reviewForm.document_name.trim(),
      document_type: reviewForm.document_type.trim() || null,
      company_name: reviewForm.company_name.trim() || null,
      document_number: reviewForm.document_number.trim() || null,
      issue_date: reviewForm.issue_date || null,
      expiry_date: reviewForm.expiry_date || null,
      issuing_authority: reviewForm.issuing_authority.trim() || null,
      ai_summary: reviewForm.ai_summary.trim() || null,
      notes: reviewForm.notes.trim(),
    });
    setSavingReview(false);
    if (error) { setAiError(error); return; }
    closeUpload();
    load();
  };

  const handleView = async (doc: CompanyDocument) => {
    setBusyId(doc.id);
    setRowError(prev => ({ ...prev, [doc.id]: '' }));
    const url = await getCompanyDocumentSignedUrl(doc.storage_path);
    setBusyId(null);
    if (!url) { setRowError(prev => ({ ...prev, [doc.id]: isZh ? tx('生成链接失败') : 'Failed to generate link' })); return; }
    window.open(url, '_blank');
  };

  const handleDownload = async (doc: CompanyDocument) => {
    setBusyId(doc.id);
    setRowError(prev => ({ ...prev, [doc.id]: '' }));
    const url = await getCompanyDocumentSignedUrl(doc.storage_path);
    setBusyId(null);
    if (!url) { setRowError(prev => ({ ...prev, [doc.id]: isZh ? tx('生成链接失败') : 'Failed to generate link' })); return; }
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDelete = async (doc: CompanyDocument) => {
    if (!window.confirm(isZh ? `${tx('确认删除文件《')}${doc.document_name}${tx('》？此操作不可恢复。')}` : `Delete "${doc.document_name}"? This cannot be undone.`)) return;
    setBusyId(doc.id);
    const { error: delErr } = await deleteCompanyDocument(doc.id, doc.storage_path);
    setBusyId(null);
    if (delErr) { setRowError(prev => ({ ...prev, [doc.id]: delErr })); return; }
    load();
  };

  const expiryBadge = (expiry: string | null) => {
    const status = expiryStatus(expiry);
    if (status === 'none') return <span style={{ color: MUTED }}>—</span>;
    const color = status === 'expired' ? RED : status === 'soon' ? AMBER : MUTED;
    return <span style={{ color, fontWeight: status === 'ok' ? 400 : 700 }}>{expiry}</span>;
  };

  return (
    <div style={{ background: '#F5F6FA', minHeight: 'calc(100vh - var(--header-h))', color: '#0C1B3A', fontFamily: workspaceFontFamily }}>
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 32px 80px' }}>
      <style dangerouslySetInnerHTML={{ __html: COMPANY_DOCUMENTS_SELECT_CSS }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <button onClick={() => navigate('/')} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(12,27,58,0.05)', border: '1px solid rgba(12,27,58,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>
          ← {isZh ? tx('返回') : 'Back'}
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0C1B3A', margin: 0, fontFamily: "'Space Grotesk',sans-serif", flex: 1 }}>
          {isZh ? tx('公司文件') : 'Company Documents'}
        </h1>
        {canUpload && outerTab === 'documents' && (
          <button onClick={openUpload} style={{ padding: '9px 18px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: '#080D1E', color: '#FFFFFF', border: 'none' }}>
            {isZh ? tx('上传文件') : 'Upload File'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {([
          { key: 'documents' as const, label: isZh ? tx('公司文件') : 'Documents' },
          { key: 'accessVault' as const, label: isZh ? tx('账号与登录') : 'Accounts & Logins' },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setOuterTab(t.key)}
            style={{
              padding: '8px 16px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer',
              background: outerTab === t.key ? '#080D1E' : 'rgba(12,27,58,0.04)',
              border: `1px solid ${outerTab === t.key ? 'transparent' : BORD}`,
              color: outerTab === t.key ? '#FFFFFF' : MUTED,
              fontWeight: outerTab === t.key ? 700 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {outerTab === 'accessVault' && (
        <AccountVault />
      )}

      {outerTab === 'documents' && (<>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <select className="gci-cd-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={inputSt}>
          <option value="">{isZh ? tx('全部分类') : 'All Categories'}</option>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <input
          placeholder={isZh ? tx('搜索文件名…') : 'Search file name…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputSt, minWidth: 220 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            ['all', isZh ? tx('全部到期状态') : 'All Expiry'],
            ['expired', isZh ? tx('已过期') : 'Expired'],
            ['soon', isZh ? tx('即将到期(30天)') : 'Expiring Soon (30d)'],
            ['none', isZh ? tx('无到期日') : 'No Expiry'],
          ] as [ExpiryFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setExpiryFilter(key)}
              style={{
                padding: '6px 12px', borderRadius: 20, fontSize: 11.5, cursor: 'pointer',
                background: expiryFilter === key ? 'rgba(203,168,92,0.16)' : 'rgba(12,27,58,0.04)',
                border: `1px solid ${expiryFilter === key ? 'rgba(203,168,92,0.5)' : BORD}`,
                color: expiryFilter === key ? GOLD : MUTED, fontWeight: expiryFilter === key ? 700 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Upload panel — manual form (aiStage 'idle', unsupported file types) */}
      {canUpload && showUpload && aiStage === 'idle' && (
        <div style={{ padding: 16, marginBottom: 16, background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, display: 'grid', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 6 }}>{isZh ? tx('处理方式') : 'Processing Mode'}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setProcessingMode('smart')}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
                  background: processingMode === 'smart' ? 'rgba(203,168,92,0.14)' : 'rgba(12,27,58,0.03)',
                  border: `1.5px solid ${processingMode === 'smart' ? GOLD : BORD}`,
                  color: processingMode === 'smart' ? GOLD : MUTED,
                }}
              >
                ✦ {isZh ? tx('智能识别并提醒') : 'Smart Extract & Remind'}
                <div style={{ fontSize: 10.5, fontWeight: 400, marginTop: 2, color: MUTED }}>
                  {isZh ? tx('证照类：营业执照、CIC、保险、车辆证件…') : 'Licenses, CIC, insurance, vehicle docs…'}
                </div>
              </button>
              <button
                onClick={() => setProcessingMode('archive')}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
                  background: processingMode === 'archive' ? 'rgba(203,168,92,0.14)' : 'rgba(12,27,58,0.03)',
                  border: `1.5px solid ${processingMode === 'archive' ? GOLD : BORD}`,
                  color: processingMode === 'archive' ? GOLD : MUTED,
                }}
              >
                {isZh ? tx('仅保存归档') : 'Save Only'}
                <div style={{ fontSize: 10.5, fontWeight: 400, marginTop: 2, color: MUTED }}>
                  {isZh ? tx('合同、内部文件、留底资料…（默认）') : 'Contracts, internal files, references… (default)'}
                </div>
              </button>
            </div>
          </div>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: 18, textAlign: 'center', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, color: MUTED,
              border: `2px dashed ${isDraggingOver ? GOLD : BORD}`,
              background: isDraggingOver ? 'rgba(203,168,92,0.08)' : 'transparent',
            }}
          >
            {uploadForm.file ? uploadForm.file.name : processingMode === 'smart'
              ? (isZh ? tx('点击选择文件，或拖拽文件到此处上传（PDF/JPG/PNG 自动识别）') : 'Click to choose a file, or drag & drop it here (PDF/JPG/PNG auto-recognized)')
              : (isZh ? tx('点击选择文件，或拖拽文件到此处上传') : 'Click to choose a file, or drag & drop it here')}
            <input
              ref={fileInputRef} type="file" style={{ display: 'none' }}
              onChange={e => acceptFile(e.target.files?.[0])}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            <div>
              <select className="gci-cd-select" value={uploadForm.category} onChange={e => handleCategorySelect(e.target.value)} style={{ ...inputSt, width: '100%' }}>
                <option value="">{isZh ? tx('— 选择分类 —') : '— Select Category —'}</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                <option value={ADD_CATEGORY_VALUE}>{isZh ? tx('+ 新建分类') : '+ Add Category'}</option>
              </select>
              {addingCategory && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <input
                    autoFocus
                    placeholder={isZh ? tx('新分类名称') : 'New category name'}
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveNewCategory(); }}
                    style={{ ...inputSt, flex: 1 }}
                  />
                  <button
                    disabled={savingCategory}
                    onClick={saveNewCategory}
                    style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#080D1E', color: '#FFFFFF', border: 'none' }}
                  >
                    {savingCategory ? (isZh ? tx('保存中…') : 'Saving…') : (isZh ? tx('保存') : 'Save')}
                  </button>
                  <button
                    onClick={() => { setAddingCategory(false); setNewCategoryName(''); setNewCategoryError(''); }}
                    style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'rgba(12,27,58,0.04)', border: `1px solid ${BORD}`, color: MUTED }}
                  >
                    {isZh ? tx('取消') : 'Cancel'}
                  </button>
                </div>
              )}
              {newCategoryError && <div style={{ fontSize: 11, color: RED, marginTop: 4 }}>{newCategoryError}</div>}
            </div>
            <input
              placeholder={isZh ? tx('文件名称') : 'Document Name'}
              value={uploadForm.document_name}
              onChange={e => setUploadForm(f => ({ ...f, document_name: e.target.value }))}
              style={inputSt}
            />
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? tx('到期日期（可选）') : 'Expiry Date (optional)'}</label>
              <input type="date" value={uploadForm.expiry_date} onChange={e => setUploadForm(f => ({ ...f, expiry_date: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <input
              placeholder={isZh ? tx('说明 / 备注') : 'Notes'}
              value={uploadForm.notes}
              onChange={e => setUploadForm(f => ({ ...f, notes: e.target.value }))}
              style={inputSt}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              disabled={uploading} onClick={submitUpload}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#080D1E', color: '#FFFFFF', border: 'none' }}
            >
              {uploading ? (isZh ? tx('上传中…') : 'Uploading…') : (isZh ? tx('上传') : 'Upload')}
            </button>
            <button onClick={closeUpload} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'rgba(12,27,58,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
              {isZh ? tx('取消') : 'Cancel'}
            </button>
            {uploadError && <span style={{ fontSize: 12, color: RED }}>{uploadError}</span>}
          </div>
        </div>
      )}

      {/* AI recognizing */}
      {canUpload && showUpload && aiStage === 'recognizing' && (
        <div style={{ padding: 28, marginBottom: 16, background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: GOLD, fontWeight: 600 }}>{isZh ? tx('正在识别文件…') : 'Recognizing file…'}</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>{isZh ? tx('AI 正在读取文件内容，通常几秒钟') : 'AI is reading the file — usually a few seconds'}</div>
        </div>
      )}

      {/* AI review / manual fallback */}
      {canUpload && showUpload && (aiStage === 'review' || aiStage === 'manual') && (
        <div style={{ padding: 16, marginBottom: 16, background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, display: 'grid', gap: 10 }}>
          {aiStage === 'review' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: GOLD }}>{isZh ? tx('AI 识别结果') : 'AI Recognition Result'}</span>
              {aiFields?.confidence !== null && aiFields?.confidence !== undefined && (
                <span style={{ fontSize: 10.5, color: aiFields.confidence < 0.5 ? AMBER : MUTED }}>
                  {isZh ? tx('置信度') : 'Confidence'}: {Math.round(aiFields.confidence * 100)}%
                  {aiFields.confidence < 0.5 ? (isZh ? tx('（建议人工核对）') : ' (please double-check)') : ''}
                </span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, fontWeight: 700, color: AMBER }}>
              {isZh ? tx('AI 识别失败，请手动填写') : 'AI recognition failed — please fill in manually'}
              {aiError && <span style={{ fontSize: 11, color: MUTED, fontWeight: 400, marginLeft: 8 }}>({aiError})</span>}
            </div>
          )}

          {aiFields?.summary && (
            <div style={{ fontSize: 12, color: '#475569', background: 'rgba(203,168,92,0.06)', borderRadius: 8, padding: '8px 12px' }}>
              {aiFields.summary}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? tx('文件类型') : 'Document Type'}</label>
              <input
                placeholder={isZh ? tx('文件类型') : 'Document Type'}
                value={reviewForm.document_type}
                onChange={e => setReviewForm(f => ({ ...f, document_type: e.target.value }))}
                style={{ ...inputSt, width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? tx('建议分类') : 'Suggested Category'}</label>
              <select className="gci-cd-select" value={reviewForm.category} onChange={e => handleCategorySelect(e.target.value)} style={{ ...inputSt, width: '100%' }}>
                <option value="">{isZh ? tx('— 选择分类 —') : '— Select Category —'}</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                <option value={ADD_CATEGORY_VALUE}>{isZh ? tx('+ 新建分类') : '+ Add Category'}</option>
              </select>
              {aiFields?.suggested_category && !categories.some(c => c.name.toLowerCase() === (aiFields.suggested_category || '').toLowerCase()) && (
                <div style={{ fontSize: 10.5, color: AMBER, marginTop: 4 }}>
                  {isZh ? `${tx('AI 建议：')}${aiFields.suggested_category}${tx('（当前分类库中没有，可新建或手动选择）')}` : `AI suggests: ${aiFields.suggested_category} (not in the category list yet — add it or pick manually)`}
                </div>
              )}
              {addingCategory && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <input
                    autoFocus
                    placeholder={isZh ? tx('新分类名称') : 'New category name'}
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveNewCategory(); }}
                    style={{ ...inputSt, flex: 1 }}
                  />
                  <button
                    disabled={savingCategory}
                    onClick={saveNewCategory}
                    style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#080D1E', color: '#FFFFFF', border: 'none' }}
                  >
                    {savingCategory ? (isZh ? tx('保存中…') : 'Saving…') : (isZh ? tx('保存') : 'Save')}
                  </button>
                  <button
                    onClick={() => { setAddingCategory(false); setNewCategoryName(''); setNewCategoryError(''); }}
                    style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'rgba(12,27,58,0.04)', border: `1px solid ${BORD}`, color: MUTED }}
                  >
                    {isZh ? tx('取消') : 'Cancel'}
                  </button>
                </div>
              )}
              {newCategoryError && <div style={{ fontSize: 11, color: RED, marginTop: 4 }}>{newCategoryError}</div>}
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? tx('公司名称') : 'Company Name'}</label>
              <input value={reviewForm.company_name} onChange={e => setReviewForm(f => ({ ...f, company_name: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? tx('证件号') : 'Document No.'}</label>
              <input value={reviewForm.document_number} onChange={e => setReviewForm(f => ({ ...f, document_number: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? tx('签发日期') : 'Issue Date'}</label>
              <input type="date" value={reviewForm.issue_date} onChange={e => setReviewForm(f => ({ ...f, issue_date: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? tx('到期日期') : 'Expiry Date'}</label>
              <input type="date" value={reviewForm.expiry_date} onChange={e => setReviewForm(f => ({ ...f, expiry_date: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? tx('签发机构') : 'Issuing Authority'}</label>
              <input value={reviewForm.issuing_authority} onChange={e => setReviewForm(f => ({ ...f, issuing_authority: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? tx('文件名称') : 'Document Name'}</label>
              <input value={reviewForm.document_name} onChange={e => setReviewForm(f => ({ ...f, document_name: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? tx('摘要') : 'Summary'}</label>
              <input value={reviewForm.ai_summary} onChange={e => setReviewForm(f => ({ ...f, ai_summary: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? tx('说明 / 备注') : 'Notes'}</label>
              <input value={reviewForm.notes} onChange={e => setReviewForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              disabled={savingReview} onClick={handleConfirmSave}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#080D1E', color: '#FFFFFF', border: 'none' }}
            >
              {savingReview ? (isZh ? tx('保存中…') : 'Saving…') : (isZh ? tx('确认并保存') : 'Confirm & Save')}
            </button>
            <button
              onClick={handleReRecognize}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'rgba(12,27,58,0.04)', border: `1px solid ${BORD}`, color: MUTED }}
            >
              {isZh ? tx('重新识别') : 'Re-recognize'}
            </button>
            <button onClick={closeUpload} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'rgba(12,27,58,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
              {isZh ? tx('取消') : 'Cancel'}
            </button>
            {aiStage === 'review' && aiError && <span style={{ fontSize: 12, color: RED }}>{aiError}</span>}
          </div>
        </div>
      )}

      {error && <div style={{ padding: '12px 16px', background: 'rgba(224,132,106,0.08)', border: `1px solid ${RED}40`, borderRadius: 10, color: RED, fontSize: 13, marginBottom: 16 }}>{error}</div>}
      {!docs && !error && <div style={{ color: MUTED, fontSize: 13 }}>{isZh ? tx('加载中…') : 'Loading…'}</div>}
      {docs && filtered.length === 0 && (
        <div style={{ padding: '36px 24px', textAlign: 'center', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>{isZh ? tx('没有符合条件的文件') : 'No documents match this view'}</div>
        </div>
      )}

      {docs && filtered.length > 0 && (
        <div style={{ border: `1px solid ${BORD}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(12,27,58,0.03)' }}>
                {[
                  isZh ? tx('文件名') : 'File Name', isZh ? tx('分类') : 'Category', isZh ? tx('说明') : 'Notes',
                  isZh ? tx('上传人') : 'Uploaded By', isZh ? tx('上传时间') : 'Uploaded At', isZh ? tx('到期日期') : 'Expiry Date', '',
                ].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', fontSize: 10, letterSpacing: '0.1em', color: MUTED, padding: '12px 16px', borderBottom: `1px solid ${BORD}`, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(doc => (
                <tr key={doc.id} style={{ opacity: busyId === doc.id ? 0.5 : 1 }}>
                  <td style={{ fontSize: 13, fontWeight: 600, color: '#0C1B3A', padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>
                    {doc.document_name}
                    <div style={{ fontSize: 10.5, color: MUTED, fontWeight: 400, marginTop: 2 }}>{doc.file_name} · {formatBytes(doc.file_size)}</div>
                    {aiStatusBadge(doc.ai_status, isZh) && (
                      <div style={{ fontSize: 10.5, fontWeight: 700, marginTop: 3, color: aiStatusBadge(doc.ai_status, isZh)!.color }}>
                        {aiStatusBadge(doc.ai_status, isZh)!.label}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: '#475569', padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>{doc.category}</td>
                  <td style={{ fontSize: 12, color: '#475569', padding: '12px 16px', borderBottom: `1px solid ${BORD}`, maxWidth: 220 }}>{doc.notes || '—'}</td>
                  <td style={{ fontSize: 12, color: '#475569', padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>
                    {(doc.uploaded_by && userNames[doc.uploaded_by]) || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: '#475569', padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>{new Date(doc.uploaded_at).toLocaleString()}</td>
                  <td style={{ fontSize: 12, padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>{expiryBadge(doc.expiry_date)}</td>
                  <td style={{ padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button disabled={busyId === doc.id} onClick={() => handleView(doc)} title={isZh ? tx('查看') : 'View'} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(12,27,58,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                        {isZh ? tx('查看') : 'View'}
                      </button>
                      <button disabled={busyId === doc.id} onClick={() => handleDownload(doc)} title={isZh ? tx('下载') : 'Download'} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(12,27,58,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                        {isZh ? tx('下载') : 'Download'}
                      </button>
                      {canUpload && AI_SUPPORTED_MIME.includes(doc.mime_type || '') && (isAdmin || isLili || doc.uploaded_by === profile?.id) && (
                        <button
                          disabled={rowAiBusy === doc.id}
                          onClick={() => openReviewForExistingDoc(doc)}
                          title={isZh ? tx('AI 识别') : 'AI Recognize'}
                          style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(203,168,92,0.1)', border: `1px solid ${GOLD}40`, color: GOLD }}
                        >
                          {rowAiBusy === doc.id ? (isZh ? tx('识别中…') : '…') : (isZh ? tx('AI 识别') : 'AI Recognize')}
                        </button>
                      )}
                      {isAdmin && (
                        <button disabled={busyId === doc.id} onClick={() => handleDelete(doc)} title={isZh ? tx('删除') : 'Delete'} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(224,132,106,0.1)', border: `1px solid ${RED}40`, color: RED }}>
                          {isZh ? tx('删除') : 'Delete'}
                        </button>
                      )}
                      {rowError[doc.id] && <span style={{ fontSize: 10.5, color: RED }}>{rowError[doc.id]}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>)}
    </div>
    </div>
  );
}
