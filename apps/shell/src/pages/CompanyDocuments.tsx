// GCI Company Documents — direct port of 25H-WorkforceOS's Company Documents module (see
// companyDocumentsService.ts). Flat filterable list per this feature's own spec, rather than
// WorkforceOS's category-cards-then-drill-down home screen — same underlying data/service, a
// different page shape was explicitly requested for GCI. View is open to any authenticated user;
// upload/delete are Active-Admin-only, enforced for real by RLS (see the migration) — the isAdmin
// check here is convenience only.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '@gci/design-system';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchCompanyDocuments, uploadCompanyDocument, deleteCompanyDocument, getCompanyDocumentSignedUrl,
  fetchUserDisplayNames, COMPANY_DOCUMENT_CATEGORIES,
  type CompanyDocument,
} from '../lib/companyDocumentsService';

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
  // Display-only i18n (same convention as Tasks.tsx): switches with the app's EN/中文 toggle via
  // localStorage, no shared i18n dict entries needed for this page's body text.
  const isZh = (localStorage.getItem('gci_platform_language_v1') || 'zh') === 'zh';

  const [docs, setDocs] = useState<CompanyDocument[] | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

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

  function load() {
    Promise.all([fetchCompanyDocuments(), fetchUserDisplayNames()]).then(([rows, names]) => {
      setDocs(rows);
      setUserNames(names);
    });
  }
  useEffect(() => { load(); }, []);

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
  const closeUpload = () => { setShowUpload(false); setUploadForm(EMPTY_UPLOAD); setUploadError(''); };

  const acceptFile = (file: File | undefined) => {
    if (!file) return;
    setUploadForm(f => ({ ...f, file, document_name: f.document_name || file.name }));
    setShowUpload(true);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); if (isAdmin) setIsDraggingOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (!isAdmin) return;
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <button onClick={() => navigate('/')} style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: MUTED, fontSize: 13, cursor: 'pointer' }}>
          ← {isZh ? '返回' : 'Back'}
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.textPrimary, margin: 0, fontFamily: "'Space Grotesk',sans-serif", flex: 1 }}>
          {isZh ? '公司文件' : 'Company Documents'}
        </h1>
        {isAdmin && (
          <button onClick={openUpload} style={{ padding: '9px 18px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: `linear-gradient(135deg,${GOLD},#B8935A)`, color: '#1A1206', border: 'none' }}>
            {isZh ? '上传文件' : 'Upload File'}
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={inputSt}>
          <option value="">{isZh ? '全部分类' : 'All Categories'}</option>
          {COMPANY_DOCUMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
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

      {/* Upload panel */}
      {isAdmin && showUpload && (
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
            {uploadForm.file ? uploadForm.file.name : (isZh ? '点击选择文件，或拖拽文件到此处上传' : 'Click to choose a file, or drag & drop it here')}
            <input
              ref={fileInputRef} type="file" style={{ display: 'none' }}
              onChange={e => acceptFile(e.target.files?.[0])}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            <select value={uploadForm.category} onChange={e => setUploadForm(f => ({ ...f, category: e.target.value }))} style={inputSt}>
              <option value="">{isZh ? '— 选择分类 —' : '— Select Category —'}</option>
              {COMPANY_DOCUMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
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
    </div>
  );
}
