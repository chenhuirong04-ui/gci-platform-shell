// GCI Company Documents — direct port of 25H-WorkforceOS's Company Documents module (see
// companyDocumentsService.ts). Flat filterable list per this feature's own spec, rather than
// WorkforceOS's category-cards-then-drill-down home screen — same underlying data/service, a
// different page shape was explicitly requested for GCI. View/upload are open to any authenticated
// user; delete is Active-Admin-only. Enforced for real by RLS (see the migration) — the
// canUpload/isAdmin checks here are convenience only.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchCompanyDocuments, uploadCompanyDocument, deleteCompanyDocument, getCompanyDocumentSignedUrl,
  fetchUserDisplayNames, fetchDocumentCategories, createDocumentCategory,
  createPendingCompanyDocument, runDocumentAIRecognition, matchSuggestedCategory, fetchStoredFileForAI,
  confirmAIDocument,
  type CompanyDocument, type CompanyDocumentCategory, type AIDocumentFields,
} from '../lib/companyDocumentsService';

const ADD_CATEGORY_VALUE = '__add_new__';

// Company Documents Intelligence V2 Phase 1 — only these 4 MIME types go
// through AI recognition; anything else falls straight to the existing
// manual upload form unchanged (never blocked).
const AI_SUPPORTED_MIME = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

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

const GOLD = '#CBA85C';
const RED = '#E0846A';
const AMBER = '#D4A843';
const MUTED = '#7A8494';
const CARD = 'rgba(255,255,255,0.025)';
const BORD = 'rgba(255,255,255,0.07)';

type ExpiryFilter = 'all' | 'expired' | 'soon' | 'none';

const inputSt: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${BORD}`, color: colors.textPrimary,
};

// Scoped to this page only (className below is unique to it) — native <select> popups ignore
// most inline styling, but Windows Chrome/Edge do honor `color-scheme` plus `option{}` rules, so
// this is enough to stop the default white dropdown/near-invisible text without touching any
// other module's <select>. Same scoped-CSS-via-<style> convention already used by
// InvoicePreview.tsx (INVOICE_SCOPED_CSS).
const COMPANY_DOCUMENTS_SELECT_CSS = `
.gci-cd-select { color-scheme: dark; }
.gci-cd-select option {
  background-color: #0F1830;
  color: #F0EAD2;
}
.gci-cd-select option:checked,
.gci-cd-select option:hover,
.gci-cd-select option:focus {
  background-color: #CBA85C;
  color: #1A1206;
}
`;

function formatBytes(n: number | null): string {
  if (n === null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
    if (aiStage === 'idle') setUploadForm(f => ({ ...f, category: value }));
    else setReviewForm(f => ({ ...f, category: value }));
  };

  const saveNewCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) { setNewCategoryError(isZh ? '请输入分类名称' : 'Category name is required'); return; }
    setSavingCategory(true);
    setNewCategoryError('');
    const res = await createDocumentCategory(trimmed);
    setSavingCategory(false);
    if (!res.ok) {
      setNewCategoryError(
        res.error === 'duplicate'
          ? (isZh ? '该分类已存在' : 'This category already exists')
          : (isZh ? '保存失败，请重试' : 'Failed to save, please retry'),
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

  const openUpload = () => { setUploadForm(EMPTY_UPLOAD); setUploadError(''); setShowUpload(true); };
  const closeUpload = () => {
    setShowUpload(false);
    setUploadForm(EMPTY_UPLOAD);
    setUploadError('');
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
    if (!AI_SUPPORTED_MIME.includes(file.type)) {
      // Unsupported type for AI (not PDF/JPG/PNG) — straight to the existing manual form, unblocked.
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
    if (!uploadForm.file) { setUploadError(isZh ? '请选择文件' : 'Please choose a file'); return; }
    if (!uploadForm.category) { setUploadError(isZh ? '请选择分类' : 'Please choose a category'); return; }
    if (!uploadForm.document_name.trim()) { setUploadError(isZh ? '请填写文件名称' : 'Document name is required'); return; }
    setUploading(true);
    setUploadError('');
    const { error: uploadErr } = await uploadCompanyDocument({
      file: uploadForm.file,
      category: uploadForm.category,
      document_name: uploadForm.document_name.trim(),
      expiry_date: uploadForm.expiry_date || null,
      notes: uploadForm.notes.trim(),
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
        setAiError(isZh ? '无法读取原文件' : 'Could not read the original file');
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
      setAiError(isZh ? '无法读取原文件' : 'Could not read the original file');
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
    if (!reviewForm.category) { setAiError(isZh ? '请选择分类' : 'Please choose a category'); return; }
    if (!reviewForm.document_name.trim()) { setAiError(isZh ? '请填写文件名称' : 'Document name is required'); return; }
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
    if (!url) { setRowError(prev => ({ ...prev, [doc.id]: isZh ? '生成链接失败' : 'Failed to generate link' })); return; }
    window.open(url, '_blank');
  };

  const handleDownload = async (doc: CompanyDocument) => {
    setBusyId(doc.id);
    setRowError(prev => ({ ...prev, [doc.id]: '' }));
    const url = await getCompanyDocumentSignedUrl(doc.storage_path);
    setBusyId(null);
    if (!url) { setRowError(prev => ({ ...prev, [doc.id]: isZh ? '生成链接失败' : 'Failed to generate link' })); return; }
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDelete = async (doc: CompanyDocument) => {
    if (!window.confirm(isZh ? `确认删除文件《${doc.document_name}》？此操作不可恢复。` : `Delete "${doc.document_name}"? This cannot be undone.`)) return;
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
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 32px 80px' }}>
      <style dangerouslySetInnerHTML={{ __html: COMPANY_DOCUMENTS_SELECT_CSS }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <button onClick={() => navigate('/')} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>
          ← {isZh ? '返回' : 'Back'}
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.textPrimary, margin: 0, fontFamily: "'Space Grotesk',sans-serif", flex: 1 }}>
          {isZh ? '公司文件' : 'Company Documents'}
        </h1>
        {canUpload && outerTab === 'documents' && (
          <button onClick={openUpload} style={{ padding: '9px 18px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#B8935A)`, color: '#1A1206', border: 'none' }}>
            {isZh ? '上传文件' : 'Upload File'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {([
          { key: 'documents' as const, label: isZh ? '公司文件' : 'Documents' },
          { key: 'accessVault' as const, label: isZh ? '账号与权限' : 'Access Vault' },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setOuterTab(t.key)}
            style={{
              padding: '8px 16px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer',
              background: outerTab === t.key ? `linear-gradient(135deg,${GOLD},#E2C988)` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${outerTab === t.key ? 'transparent' : BORD}`,
              color: outerTab === t.key ? '#080D1E' : MUTED,
              fontWeight: outerTab === t.key ? 700 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {outerTab === 'accessVault' && (
        <div style={{ padding: '18px 20px', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, fontSize: 13, color: MUTED }}>
          {isZh ? '账号与权限即将上线。' : 'Access Vault coming soon.'}
        </div>
      )}

      {outerTab === 'documents' && (<>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <select className="gci-cd-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={inputSt}>
          <option value="">{isZh ? '全部分类' : 'All Categories'}</option>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <input
          placeholder={isZh ? '搜索文件名…' : 'Search file name…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputSt, minWidth: 220 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            ['all', isZh ? '全部到期状态' : 'All Expiry'],
            ['expired', isZh ? '已过期' : 'Expired'],
            ['soon', isZh ? '即将到期(30天)' : 'Expiring Soon (30d)'],
            ['none', isZh ? '无到期日' : 'No Expiry'],
          ] as [ExpiryFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setExpiryFilter(key)}
              style={{
                padding: '6px 12px', borderRadius: 20, fontSize: 11.5, cursor: 'pointer',
                background: expiryFilter === key ? 'rgba(203,168,92,0.16)' : 'rgba(255,255,255,0.04)',
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
            {uploadForm.file ? uploadForm.file.name : (isZh ? '点击选择文件，或拖拽文件到此处上传（PDF/JPG/PNG 自动识别）' : 'Click to choose a file, or drag & drop it here (PDF/JPG/PNG auto-recognized)')}
            <input
              ref={fileInputRef} type="file" style={{ display: 'none' }}
              onChange={e => acceptFile(e.target.files?.[0])}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            <div>
              <select className="gci-cd-select" value={uploadForm.category} onChange={e => handleCategorySelect(e.target.value)} style={{ ...inputSt, width: '100%' }}>
                <option value="">{isZh ? '— 选择分类 —' : '— Select Category —'}</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                <option value={ADD_CATEGORY_VALUE}>{isZh ? '+ 新建分类' : '+ Add Category'}</option>
              </select>
              {addingCategory && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <input
                    autoFocus
                    placeholder={isZh ? '新分类名称' : 'New category name'}
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveNewCategory(); }}
                    style={{ ...inputSt, flex: 1 }}
                  />
                  <button
                    disabled={savingCategory}
                    onClick={saveNewCategory}
                    style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#B8935A)`, color: '#1A1206', border: 'none' }}
                  >
                    {savingCategory ? (isZh ? '保存中…' : 'Saving…') : (isZh ? '保存' : 'Save')}
                  </button>
                  <button
                    onClick={() => { setAddingCategory(false); setNewCategoryName(''); setNewCategoryError(''); }}
                    style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}
                  >
                    {isZh ? '取消' : 'Cancel'}
                  </button>
                </div>
              )}
              {newCategoryError && <div style={{ fontSize: 11, color: RED, marginTop: 4 }}>{newCategoryError}</div>}
            </div>
            <input
              placeholder={isZh ? '文件名称' : 'Document Name'}
              value={uploadForm.document_name}
              onChange={e => setUploadForm(f => ({ ...f, document_name: e.target.value }))}
              style={inputSt}
            />
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? '到期日期（可选）' : 'Expiry Date (optional)'}</label>
              <input type="date" value={uploadForm.expiry_date} onChange={e => setUploadForm(f => ({ ...f, expiry_date: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <input
              placeholder={isZh ? '说明 / 备注' : 'Notes'}
              value={uploadForm.notes}
              onChange={e => setUploadForm(f => ({ ...f, notes: e.target.value }))}
              style={inputSt}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              disabled={uploading} onClick={submitUpload}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#B8935A)`, color: '#1A1206', border: 'none' }}
            >
              {uploading ? (isZh ? '上传中…' : 'Uploading…') : (isZh ? '上传' : 'Upload')}
            </button>
            <button onClick={closeUpload} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
              {isZh ? '取消' : 'Cancel'}
            </button>
            {uploadError && <span style={{ fontSize: 12, color: RED }}>{uploadError}</span>}
          </div>
        </div>
      )}

      {/* AI recognizing */}
      {canUpload && showUpload && aiStage === 'recognizing' && (
        <div style={{ padding: 28, marginBottom: 16, background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: GOLD, fontWeight: 600 }}>{isZh ? '正在识别文件…' : 'Recognizing file…'}</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>{isZh ? 'AI 正在读取文件内容，通常几秒钟' : 'AI is reading the file — usually a few seconds'}</div>
        </div>
      )}

      {/* AI review / manual fallback */}
      {canUpload && showUpload && (aiStage === 'review' || aiStage === 'manual') && (
        <div style={{ padding: 16, marginBottom: 16, background: CARD, border: `1px solid ${BORD}`, borderRadius: 12, display: 'grid', gap: 10 }}>
          {aiStage === 'review' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: GOLD }}>{isZh ? 'AI 识别结果' : 'AI Recognition Result'}</span>
              {aiFields?.confidence !== null && aiFields?.confidence !== undefined && (
                <span style={{ fontSize: 10.5, color: aiFields.confidence < 0.5 ? AMBER : MUTED }}>
                  {isZh ? '置信度' : 'Confidence'}: {Math.round(aiFields.confidence * 100)}%
                  {aiFields.confidence < 0.5 ? (isZh ? '（建议人工核对）' : ' (please double-check)') : ''}
                </span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, fontWeight: 700, color: AMBER }}>
              {isZh ? 'AI 识别失败，请手动填写' : 'AI recognition failed — please fill in manually'}
              {aiError && <span style={{ fontSize: 11, color: MUTED, fontWeight: 400, marginLeft: 8 }}>({aiError})</span>}
            </div>
          )}

          {aiFields?.summary && (
            <div style={{ fontSize: 12, color: colors.textSecondary, background: 'rgba(203,168,92,0.06)', borderRadius: 8, padding: '8px 12px' }}>
              {aiFields.summary}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? '文件类型' : 'Document Type'}</label>
              <input
                placeholder={isZh ? '文件类型' : 'Document Type'}
                value={reviewForm.document_type}
                onChange={e => setReviewForm(f => ({ ...f, document_type: e.target.value }))}
                style={{ ...inputSt, width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? '建议分类' : 'Suggested Category'}</label>
              <select className="gci-cd-select" value={reviewForm.category} onChange={e => handleCategorySelect(e.target.value)} style={{ ...inputSt, width: '100%' }}>
                <option value="">{isZh ? '— 选择分类 —' : '— Select Category —'}</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                <option value={ADD_CATEGORY_VALUE}>{isZh ? '+ 新建分类' : '+ Add Category'}</option>
              </select>
              {aiFields?.suggested_category && !categories.some(c => c.name.toLowerCase() === (aiFields.suggested_category || '').toLowerCase()) && (
                <div style={{ fontSize: 10.5, color: AMBER, marginTop: 4 }}>
                  {isZh ? `AI 建议：${aiFields.suggested_category}（当前分类库中没有，可新建或手动选择）` : `AI suggests: ${aiFields.suggested_category} (not in the category list yet — add it or pick manually)`}
                </div>
              )}
              {addingCategory && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <input
                    autoFocus
                    placeholder={isZh ? '新分类名称' : 'New category name'}
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveNewCategory(); }}
                    style={{ ...inputSt, flex: 1 }}
                  />
                  <button
                    disabled={savingCategory}
                    onClick={saveNewCategory}
                    style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#B8935A)`, color: '#1A1206', border: 'none' }}
                  >
                    {savingCategory ? (isZh ? '保存中…' : 'Saving…') : (isZh ? '保存' : 'Save')}
                  </button>
                  <button
                    onClick={() => { setAddingCategory(false); setNewCategoryName(''); setNewCategoryError(''); }}
                    style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}
                  >
                    {isZh ? '取消' : 'Cancel'}
                  </button>
                </div>
              )}
              {newCategoryError && <div style={{ fontSize: 11, color: RED, marginTop: 4 }}>{newCategoryError}</div>}
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? '公司名称' : 'Company Name'}</label>
              <input value={reviewForm.company_name} onChange={e => setReviewForm(f => ({ ...f, company_name: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? '证件号' : 'Document No.'}</label>
              <input value={reviewForm.document_number} onChange={e => setReviewForm(f => ({ ...f, document_number: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? '签发日期' : 'Issue Date'}</label>
              <input type="date" value={reviewForm.issue_date} onChange={e => setReviewForm(f => ({ ...f, issue_date: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? '到期日期' : 'Expiry Date'}</label>
              <input type="date" value={reviewForm.expiry_date} onChange={e => setReviewForm(f => ({ ...f, expiry_date: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? '签发机构' : 'Issuing Authority'}</label>
              <input value={reviewForm.issuing_authority} onChange={e => setReviewForm(f => ({ ...f, issuing_authority: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? '文件名称' : 'Document Name'}</label>
              <input value={reviewForm.document_name} onChange={e => setReviewForm(f => ({ ...f, document_name: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? '摘要' : 'Summary'}</label>
              <input value={reviewForm.ai_summary} onChange={e => setReviewForm(f => ({ ...f, ai_summary: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{isZh ? '说明 / 备注' : 'Notes'}</label>
              <input value={reviewForm.notes} onChange={e => setReviewForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputSt, width: '100%' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              disabled={savingReview} onClick={handleConfirmSave}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#B8935A)`, color: '#1A1206', border: 'none' }}
            >
              {savingReview ? (isZh ? '保存中…' : 'Saving…') : (isZh ? '确认并保存' : 'Confirm & Save')}
            </button>
            <button
              onClick={handleReRecognize}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}
            >
              {isZh ? '重新识别' : 'Re-recognize'}
            </button>
            <button onClick={closeUpload} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
              {isZh ? '取消' : 'Cancel'}
            </button>
            {aiStage === 'review' && aiError && <span style={{ fontSize: 12, color: RED }}>{aiError}</span>}
          </div>
        </div>
      )}

      {error && <div style={{ padding: '12px 16px', background: 'rgba(224,132,106,0.08)', border: `1px solid ${RED}40`, borderRadius: 10, color: RED, fontSize: 13, marginBottom: 16 }}>{error}</div>}
      {!docs && !error && <div style={{ color: MUTED, fontSize: 13 }}>{isZh ? '加载中…' : 'Loading…'}</div>}
      {docs && filtered.length === 0 && (
        <div style={{ padding: '36px 24px', textAlign: 'center', background: CARD, border: `1px solid ${BORD}`, borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>{isZh ? '没有符合条件的文件' : 'No documents match this view'}</div>
        </div>
      )}

      {docs && filtered.length > 0 && (
        <div style={{ border: `1px solid ${BORD}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {[
                  isZh ? '文件名' : 'File Name', isZh ? '分类' : 'Category', isZh ? '说明' : 'Notes',
                  isZh ? '上传人' : 'Uploaded By', isZh ? '上传时间' : 'Uploaded At', isZh ? '到期日期' : 'Expiry Date', '',
                ].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', fontSize: 10, letterSpacing: '0.1em', color: MUTED, padding: '12px 16px', borderBottom: `1px solid ${BORD}`, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(doc => (
                <tr key={doc.id} style={{ opacity: busyId === doc.id ? 0.5 : 1 }}>
                  <td style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>
                    {doc.document_name}
                    <div style={{ fontSize: 10.5, color: MUTED, fontWeight: 400, marginTop: 2 }}>{doc.file_name} · {formatBytes(doc.file_size)}</div>
                  </td>
                  <td style={{ fontSize: 12, color: colors.textSecondary, padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>{doc.category}</td>
                  <td style={{ fontSize: 12, color: colors.textSecondary, padding: '12px 16px', borderBottom: `1px solid ${BORD}`, maxWidth: 220 }}>{doc.notes || '—'}</td>
                  <td style={{ fontSize: 12, color: colors.textSecondary, padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>
                    {(doc.uploaded_by && userNames[doc.uploaded_by]) || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: colors.textSecondary, padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>{new Date(doc.uploaded_at).toLocaleString()}</td>
                  <td style={{ fontSize: 12, padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>{expiryBadge(doc.expiry_date)}</td>
                  <td style={{ padding: '12px 16px', borderBottom: `1px solid ${BORD}` }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button disabled={busyId === doc.id} onClick={() => handleView(doc)} title={isZh ? '查看' : 'View'} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                        {isZh ? '查看' : 'View'}
                      </button>
                      <button disabled={busyId === doc.id} onClick={() => handleDownload(doc)} title={isZh ? '下载' : 'Download'} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORD}`, color: MUTED }}>
                        {isZh ? '下载' : 'Download'}
                      </button>
                      {canUpload && AI_SUPPORTED_MIME.includes(doc.mime_type || '') && (isAdmin || isLili || doc.uploaded_by === profile?.id) && (
                        <button
                          disabled={rowAiBusy === doc.id}
                          onClick={() => openReviewForExistingDoc(doc)}
                          title={isZh ? 'AI 识别' : 'AI Recognize'}
                          style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(203,168,92,0.1)', border: `1px solid ${GOLD}40`, color: GOLD }}
                        >
                          {rowAiBusy === doc.id ? (isZh ? '识别中…' : '…') : (isZh ? 'AI 识别' : 'AI Recognize')}
                        </button>
                      )}
                      {isAdmin && (
                        <button disabled={busyId === doc.id} onClick={() => handleDelete(doc)} title={isZh ? '删除' : 'Delete'} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(224,132,106,0.1)', border: `1px solid ${RED}40`, color: RED }}>
                          {isZh ? '删除' : 'Delete'}
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
  );
}
