import React, { useRef, useState } from 'react';
import type { Supplier, SupplierType, SupplierStatus, SupplierRating, DocumentType } from '../types';
import { createSupplier, generateShortCode, updateSupplier } from '../lib/suppliersCloud';
import { createDocument, moveStorageFile, resolveStorageBucket } from '../lib/documentsCloud';

// ── Design tokens ─────────────────────────────────────────────────────────────
const GOLD    = '#C9A84C';
const NAVY    = '#0c1b3a';
const BG      = '#f5f3ef';
const CBORDER = '#e8e0d0';

const INP: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  padding: '11px 14px', borderRadius: 10, border: '1.5px solid #b0bec5',
  fontSize: 15, color: '#0F172A', background: '#fff', outline: 'none',
};
const SEL: React.CSSProperties = { ...INP, cursor: 'pointer' };
const LBL: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6,
};
const CARD: React.CSSProperties = {
  background: '#fff', borderRadius: 24, padding: 28,
  border: `1px solid ${CBORDER}`, boxShadow: '0 1px 4px rgba(12,27,58,0.06)',
};
const SEC: React.CSSProperties = {
  fontSize: 10, fontWeight: 900, color: GOLD,
  textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20,
};
const R2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 };
const R3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 18 };

// ── Supabase ──────────────────────────────────────────────────────────────────
const SUPA_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcmt2d2h6cGdhaGpnZnVranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTUwNDgsImV4cCI6MjA5NDkzMTA0OH0.i8TGQneIZHTWeJzuzVv-JBiBppaOjYkPbs4E5K73clU';

// ── Types ─────────────────────────────────────────────────────────────────────
type UploadStage = 'idle' | 'uploading' | 'parsing' | 'ready' | 'failed';

/** 9 editable confirmation fields from 营业执照 / 公司注册文件 */
interface LicenseFields {
  document_number: string;
  registration_number: string;
  legal_representative: string;
  registered_address: string;
  business_activities: string; // semicolon-joined
  issuing_authority: string;
  issue_date: string;
  expire_date: string;
  vat_number: string;
}

const EMPTY_LICENSE: LicenseFields = {
  document_number: '', registration_number: '', legal_representative: '',
  registered_address: '', business_activities: '', issuing_authority: '',
  issue_date: '', expire_date: '', vat_number: '',
};

interface UploadedFile {
  origPath: string;  // suppliers/new/{ts}-{safeName}
  bucket: string;
  docType: DocumentType;
  origName: string;
  ts: number;        // reuse for dest path
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function uploadTemp(file: File, bucket: string): Promise<{ path: string; ts: number } | null> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ts = Date.now();
  const path = `suppliers/new/${ts}-${safeName}`;
  try {
    const res = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true',
      },
      body: file,
    });
    return res.ok ? { path, ts } : null;
  } catch { return null; }
}

async function callParse(
  file: File,
  documentType: string,
): Promise<{ ok: boolean; fields?: Record<string, unknown>; model?: string }> {
  try {
    const base64 = await fileToBase64(file);
    const mimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png');
    const res = await fetch('/api/bs/parse-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mimeType, data: base64, documentType }),
    });
    return res.json();
  } catch { return { ok: false }; }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TYPES: SupplierType[] = ['Factory', 'Trading', 'Integrated', 'Service', 'Agent', 'Unknown'];
const STATUSES: { v: SupplierStatus; l: string }[] = [
  { v: 'active', l: '正常' }, { v: 'inactive', l: '停用' },
  { v: 'blacklisted', l: '黑名单' }, { v: 'under_review', l: '审核中' }, { v: 'archived', l: '封存' },
];
const RATINGS: SupplierRating[] = ['A', 'B', 'C', 'D'];

const UPLOAD_BTNS: { label: string; docType: DocumentType; parseType: string | null }[] = [
  { label: '📄 上传营业执照',           docType: '营业执照',    parseType: 'SUPPLIER_TRADE_LICENSE'    },
  { label: '🏛 上传公司注册文件',         docType: '公司注册文件', parseType: 'SUPPLIER_TRADE_LICENSE'    },
  { label: '📁 上传公司简介 / 产品目录',  docType: '公司简介',    parseType: 'SUPPLIER_COMPANY_PROFILE'  },
];

const FORM_INIT = (s?: Supplier) => ({
  supplier_name_display: s?.supplier_name_display ?? '',
  name_cn:               s?.name_cn ?? '',
  name_en:               s?.name_en ?? '',
  supplier_type:         (s?.supplier_type ?? 'Unknown') as SupplierType,
  categoriesRaw:         (s?.product_categories ?? []).join(', '),
  country:               s?.country ?? '',
  city:                  s?.city ?? '',
  is_preferred:          s?.is_preferred ?? false,
  status:                (s?.status ?? 'active') as SupplierStatus,
  current_rating:        (s?.current_rating ?? 'B') as SupplierRating,
  internal_owner:        s?.internal_owner ?? '',
  payment_terms:         s?.payment_terms ?? '',
  default_lead_time_days: s?.default_lead_time_days ? String(s.default_lead_time_days) : '',
  website:               s?.website ?? '',
  established_year:      s?.established_year ? String(s.established_year) : '',
  notes:                 s?.notes ?? '',
});
type FormState = ReturnType<typeof FORM_INIT>;

interface Props {
  supplier?: Supplier;
  onSaved: (s: Supplier) => void;
  onCancel: () => void;
}

// ════════════════════════════════════════════════════════════════════════════
export default function SupplierForm({ supplier, onSaved, onCancel }: Props) {
  const isEdit = !!supplier?.id;

  // ── Upload / parse state ──────────────────────────────────────────────────
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [uploadError, setUploadError] = useState('');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [parseModel, setParseModel]     = useState('');
  const [parseConf, setParseConf]       = useState('');
  const [licenseFields, setLicenseFields] = useState<LicenseFields>(EMPTY_LICENSE);
  const [showLicenseEdit, setShowLicenseEdit] = useState(false);
  const [aiFilledKeys, setAiFilledKeys] = useState<Set<string>>(new Set());
  const [pendingBtn, setPendingBtn]     = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [form, setForm] = useState<FormState>(() => FORM_INIT(supplier));
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState('');

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }));
  const setL = <K extends keyof LicenseFields>(k: K, v: string) =>
    setLicenseFields(f => ({ ...f, [k]: v }));

  // ── Reset upload state ────────────────────────────────────────────────────
  const resetUpload = () => {
    setUploadStage('idle'); setUploadedFile(null);
    setLicenseFields(EMPTY_LICENSE); setAiFilledKeys(new Set());
    setUploadError(''); setShowLicenseEdit(false);
    setParseModel(''); setParseConf('');
  };

  // ── Handle file selection ─────────────────────────────────────────────────
  const handleFile = async (file: File, btnIdx: number) => {
    const btn = UPLOAD_BTNS[btnIdx];
    setUploadError('');
    setUploadStage('uploading');

    const bucket = resolveStorageBucket(btn.docType);
    const up = await uploadTemp(file, bucket);
    if (!up) {
      setUploadError('文件上传失败，请检查网络后重试');
      setUploadStage('failed');
      return;
    }
    setUploadedFile({ origPath: up.path, bucket, docType: btn.docType, origName: file.name, ts: up.ts });

    if (!btn.parseType) {
      setUploadStage('ready');
      return;
    }

    setUploadStage('parsing');
    const result = await callParse(file, btn.parseType);
    const f = (result.fields ?? {}) as Record<string, unknown>;

    if (result.ok && Object.keys(f).length) {
      setParseModel(result.model ?? '');
      setParseConf(String(f.confidence ?? ''));
      const filled = new Set<string>();

      if (btn.parseType === 'SUPPLIER_TRADE_LICENSE') {
        setForm(prev => {
          const next = { ...prev };
          const maybe = (key: keyof FormState, val: unknown) => {
            if (val && !prev[key]) { (next as any)[key] = String(val); filled.add(key); }
          };
          maybe('supplier_name_display', f.legal_name ?? f.name_cn ?? f.name_en);
          maybe('name_cn', f.name_cn);
          maybe('name_en', f.name_en);
          maybe('country', f.country);
          maybe('city', f.city);
          return next;
        });
        setLicenseFields({
          document_number:      String(f.document_number ?? ''),
          registration_number:  String(f.registration_number ?? ''),
          legal_representative: String(f.legal_representative ?? ''),
          registered_address:   String(f.registered_address ?? ''),
          business_activities:  Array.isArray(f.business_activities)
            ? (f.business_activities as string[]).join('; ')
            : String(f.business_activities ?? ''),
          issuing_authority:    String(f.issuing_authority ?? ''),
          issue_date:           String(f.issue_date ?? ''),
          expire_date:          String(f.expire_date ?? ''),
          vat_number:           String(f.vat_number ?? ''),
        });
        setShowLicenseEdit(true);
        setAiFilledKeys(filled);

      } else if (btn.parseType === 'SUPPLIER_COMPANY_PROFILE') {
        setForm(prev => {
          const next = { ...prev };
          const maybe = (key: keyof FormState, val: unknown) => {
            if (val && !prev[key]) { (next as any)[key] = String(val); filled.add(key); }
          };
          maybe('supplier_name_display', f.legal_name ?? f.name_cn ?? f.name_en);
          maybe('name_cn', f.name_cn);
          maybe('name_en', f.name_en);
          maybe('country', f.country);
          maybe('city', f.city);
          maybe('website', f.website);
          maybe('established_year', f.established_year);
          if (Array.isArray(f.product_categories) && f.product_categories.length && !prev.categoriesRaw) {
            next.categoriesRaw = (f.product_categories as string[]).join(', ');
            filled.add('categoriesRaw');
          }
          // Extra info → notes
          const extras: string[] = [];
          if (Array.isArray(f.main_products) && f.main_products.length)
            extras.push(`主要产品: ${(f.main_products as string[]).join('、')}`);
          if (f.contact_name) extras.push(`联系人: ${f.contact_name}`);
          if (f.phone)        extras.push(`电话: ${f.phone}`);
          if (f.email)        extras.push(`邮箱: ${f.email}`);
          if (extras.length && !prev.notes) {
            next.notes = extras.join('\n');
            filled.add('notes');
          }
          return next;
        });
        setAiFilledKeys(filled);
      }
    } else {
      setUploadError('AI 解析失败，文件已上传，请手工填写');
    }
    setUploadStage('ready');
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.supplier_name_display.trim()) { setSaveError('供应商名称不能为空'); return; }
    setSaving(true); setSaveError('');
    try {
      const cats = form.categoriesRaw.split(',').map(s => s.trim()).filter(Boolean);
      const payload: Omit<Supplier, 'id'> = {
        short_code: '',
        supplier_name_display: form.supplier_name_display,
        name_cn:               form.name_cn || undefined,
        name_en:               form.name_en || undefined,
        supplier_type:         form.supplier_type,
        product_categories:    cats,
        country:               form.country || undefined,
        city:                  form.city || undefined,
        is_preferred:          form.is_preferred,
        status:                form.status,
        current_rating:        form.current_rating,
        internal_owner:        form.internal_owner || undefined,
        payment_terms:         form.payment_terms || undefined,
        default_lead_time_days: form.default_lead_time_days ? Number(form.default_lead_time_days) : undefined,
        website:               form.website || undefined,
        established_year:      form.established_year ? Number(form.established_year) : undefined,
        notes:                 form.notes || undefined,
      };

      let saved: Supplier | null = null;

      if (isEdit && supplier?.id) {
        const ok = await updateSupplier(supplier.id, payload);
        if (!ok) { setSaveError('保存失败，请重试'); return; }
        saved = { ...supplier, ...payload };
      } else {
        const code = await generateShortCode('SUP-AUTO');
        saved = await createSupplier({ ...payload, short_code: code, import_source: 'manual' });
        if (!saved?.id) { setSaveError('创建供应商失败，请重试'); return; }
      }

      // Step 2: archive file + create document
      if (uploadedFile && saved!.id) {
        const sid = saved!.id;
        const safeName = uploadedFile.origName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const destPath = `suppliers/${sid}/${uploadedFile.ts}-${safeName}`;

        // Move temp → permanent (best-effort, failure doesn't block navigation)
        const finalPath = await moveStorageFile(uploadedFile.bucket, uploadedFile.origPath, destPath);
        const storagePath = finalPath ?? uploadedFile.origPath;

        // Build notes for supplier_document from license fields that have no dedicated column
        const docNoteLines = [
          licenseFields.registration_number  && `注册号: ${licenseFields.registration_number}`,
          licenseFields.legal_representative && `法定代表人: ${licenseFields.legal_representative}`,
          licenseFields.registered_address   && `注册地址: ${licenseFields.registered_address}`,
          licenseFields.vat_number           && `VAT/税号: ${licenseFields.vat_number}`,
          licenseFields.business_activities  && `经营范围: ${licenseFields.business_activities}`,
        ].filter(Boolean);

        await createDocument({
          supplier_id:        sid,
          document_type:      uploadedFile.docType,
          document_name:      `${form.supplier_name_display} — ${uploadedFile.docType}`,
          storage_bucket:     uploadedFile.bucket,
          storage_path:       storagePath,
          document_number:    licenseFields.document_number || undefined,
          issuing_authority:  licenseFields.issuing_authority || undefined,
          issue_date:         licenseFields.issue_date || undefined,
          expire_date:        licenseFields.expire_date || undefined,
          verification_status: 'unverified',
          notes:              docNoteLines.length ? docNoteLines.join('\n') : undefined,
        });
      }

      onSaved(saved!);
    } catch (e: any) {
      setSaveError(e?.message ?? '保存时出现未知错误');
    } finally {
      setSaving(false);
    }
  };

  // ── Completeness ──────────────────────────────────────────────────────────
  const checks = [
    { label: '供应商名称',          done: !!form.supplier_name_display },
    { label: '中文或英文名称',        done: !!(form.name_cn || form.name_en) },
    { label: '供应商类型',           done: !!form.supplier_type && form.supplier_type !== 'Unknown' },
    { label: '国家',                 done: !!form.country },
    { label: '付款条款',             done: !!form.payment_terms },
    { label: '内部对接人',           done: !!form.internal_owner },
    { label: '营业执照 / 公司文件',   done: !!uploadedFile },
  ];
  const pct = Math.round(checks.filter(c => c.done).length / checks.length * 100);

  const savingDisabled = saving || uploadStage === 'uploading' || uploadStage === 'parsing';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: BG, minHeight: '100vh' }}>
      <div style={{ padding: '24px 28px 64px', maxWidth: 1200, margin: '0 auto' }}>
        <button onClick={onCancel} style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 18 }}>
          ← 返回列表
        </button>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

          {/* ═══ LEFT ═══════════════════════════════════════════════════════ */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Title card */}
            <div style={CARD}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, margin: '0 0 4px' }}>
                {isEdit ? '编辑供应商档案' : '新增供应商'}
              </h2>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                {isEdit ? '修改后保存即可更新档案' : '上传营业执照 / 公司简介可自动识别信息，或手工填写'}
              </p>
            </div>

            {/* ── AI Upload card (new only) ─────────────────────────────────── */}
            {!isEdit && (
              <div style={{ ...CARD, border: uploadedFile ? `1.5px solid ${GOLD}60` : `1.5px solid ${NAVY}25` }}>
                <div style={{ height: 4, background: `linear-gradient(90deg, ${NAVY}, ${GOLD})`, margin: '-28px -28px 24px', borderRadius: '24px 24px 0 0' }} />
                <div style={{ marginBottom: 16 }}>
                  <div style={{ ...SEC, marginBottom: 4 }}>AI 智能创建</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>上传供应商资料，自动识别公司信息</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    营业执照 / 公司注册文件 → 自动填表 + 可编辑确认区 &nbsp;·&nbsp;
                    公司简介 / 产品目录 → 自动填表（名称/地区/产品等）&nbsp;·&nbsp; PDF · PNG · JPG
                  </div>
                </div>

                {uploadStage === 'idle' && (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {UPLOAD_BTNS.map((btn, idx) => (
                      <button key={idx}
                        onClick={() => { setPendingBtn(idx); fileRef.current?.click(); }}
                        style={{
                          padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          background: idx === 0 ? NAVY : '#fff',
                          color: idx === 0 ? '#fff' : NAVY,
                          border: idx === 0 ? 'none' : `1.5px solid ${CBORDER}`,
                        }}
                      >{btn.label}</button>
                    ))}
                    <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f, pendingBtn); e.target.value = ''; }} />
                  </div>
                )}

                {uploadStage === 'uploading' && <Spinner label="上传文件中…" sub="正在上传到 Supabase Storage" />}
                {uploadStage === 'parsing'   && <Spinner label="AI 解析中…" sub="Gemini Vision 正在识别文件内容，通常约 10 秒" icon="🔍" />}

                {uploadStage === 'failed' && !uploadedFile && (
                  <div>
                    <Alert type="error">{uploadError || '上传失败，请重试'}</Alert>
                    <button onClick={resetUpload} style={{ marginTop: 10, fontSize: 13, color: NAVY, background: 'none', border: `1px solid ${CBORDER}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>重新选择文件</button>
                  </div>
                )}

                {uploadStage === 'ready' && uploadedFile && (
                  <div>
                    {uploadError
                      ? <Alert type="warn">{uploadError}</Alert>
                      : showLicenseEdit
                        ? <Alert type="ok">
                            ✓ AI 解析完成（{parseModel}）— 已自动填入表单，执照详情请在下方确认区核对
                            {parseConf && <ConfBadge v={parseConf} />}
                          </Alert>
                        : aiFilledKeys.size > 0
                          ? <Alert type="ok">
                              ✓ 公司资料解析完成（{parseModel}）— 已自动填入表单
                              {parseConf && <ConfBadge v={parseConf} />}
                            </Alert>
                          : <Alert type="ok">✓ 文件已上传（未解析结构化数据，请手工填写）</Alert>
                    }
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>📎 {uploadedFile.origName} · {uploadedFile.docType}</span>
                      <button onClick={resetUpload} style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>重新上传</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── License confirmation (9 editable fields) ──────────────────── */}
            {!isEdit && showLicenseEdit && (
              <div style={{ ...CARD, border: `1.5px solid ${GOLD}50`, background: '#fffdf6' }}>
                <div style={SEC}>营业执照识别结果 — 核对后可直接编辑</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                  保存后这些字段将写入「营业执照与公司文件」Tab，在供应商详情页可见 ↓
                </div>

                <div style={R3}>
                  <FLD label="执照号 / 统一社会信用代码">
                    <input style={INP} value={licenseFields.document_number} onChange={e => setL('document_number', e.target.value)} placeholder="91xxxxxxxxxxxxxxxxxx" />
                  </FLD>
                  <FLD label="注册号（与执照号不同时填）">
                    <input style={INP} value={licenseFields.registration_number} onChange={e => setL('registration_number', e.target.value)} />
                  </FLD>
                  <FLD label="法定代表人">
                    <input style={INP} value={licenseFields.legal_representative} onChange={e => setL('legal_representative', e.target.value)} />
                  </FLD>
                </div>
                <div style={R3}>
                  <FLD label="颁发机构">
                    <input style={INP} value={licenseFields.issuing_authority} onChange={e => setL('issuing_authority', e.target.value)} placeholder="广州市市场监督管理局" />
                  </FLD>
                  <FLD label="签发日期">
                    <input style={INP} type="date" value={licenseFields.issue_date} onChange={e => setL('issue_date', e.target.value)} />
                  </FLD>
                  <FLD label="到期日期">
                    <input style={INP} type="date" value={licenseFields.expire_date} onChange={e => setL('expire_date', e.target.value)} />
                  </FLD>
                </div>
                <div style={R2}>
                  <FLD label="VAT / 税号">
                    <input style={INP} value={licenseFields.vat_number} onChange={e => setL('vat_number', e.target.value)} />
                  </FLD>
                  <FLD label="注册地址">
                    <input style={INP} value={licenseFields.registered_address} onChange={e => setL('registered_address', e.target.value)} />
                  </FLD>
                </div>
                <FLD label="经营范围（多项用分号分隔）">
                  <textarea style={{ ...INP, resize: 'vertical', minHeight: 64 }}
                    value={licenseFields.business_activities}
                    onChange={e => setL('business_activities', e.target.value)}
                    placeholder="经营范围 A; 经营范围 B; …" />
                </FLD>

                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 12, lineHeight: 1.6 }}>
                  写入规则：执照号 → document_number · 颁发机构/签发/到期 → 对应字段 · 注册号/法定代表人/地址/VAT/经营范围 → 文件备注（notes 字段，详情页可见）
                </div>
              </div>
            )}

            {/* ── Divider ───────────────────────────────────────────────────── */}
            {!isEdit && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: CBORDER }} />
                <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap', fontWeight: 600 }}>
                  {uploadedFile ? '核对并补充以下供应商资料' : '没有文件？手工填写供应商资料'}
                </span>
                <div style={{ flex: 1, height: 1, background: CBORDER }} />
              </div>
            )}

            {/* ── 1. Basic info ─────────────────────────────────────────────── */}
            <div style={CARD}>
              <div style={SEC}>{isEdit ? '基础信息' : '1. 基础信息'}</div>
              <div style={R3}>
                <FLD label="主显示名称 *" ai={aiFilledKeys.has('supplier_name_display')}>
                  <input style={{ ...INP, ...aiInp(aiFilledKeys.has('supplier_name_display')), borderColor: !form.supplier_name_display ? '#e53e3e' : undefined }}
                    value={form.supplier_name_display} onChange={e => setF('supplier_name_display', e.target.value)} placeholder="供应商主显示名称" />
                </FLD>
                <FLD label="中文名称" ai={aiFilledKeys.has('name_cn')}>
                  <input style={{ ...INP, ...aiInp(aiFilledKeys.has('name_cn')) }} value={form.name_cn} onChange={e => setF('name_cn', e.target.value)} placeholder="中文名称" />
                </FLD>
                <FLD label="英文名称" ai={aiFilledKeys.has('name_en')}>
                  <input style={{ ...INP, ...aiInp(aiFilledKeys.has('name_en')) }} value={form.name_en} onChange={e => setF('name_en', e.target.value)} placeholder="English Name" />
                </FLD>
              </div>
              <div style={R3}>
                <FLD label="供应商类型">
                  <select style={SEL} value={form.supplier_type} onChange={e => setF('supplier_type', e.target.value as SupplierType)}>
                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </FLD>
                <FLD label="供应品类（逗号分隔）" ai={aiFilledKeys.has('categoriesRaw')}>
                  <input style={{ ...INP, ...aiInp(aiFilledKeys.has('categoriesRaw')) }} value={form.categoriesRaw} onChange={e => setF('categoriesRaw', e.target.value)} placeholder="卫生用品, 家居, FF&E" />
                </FLD>
                <FLD label="成立年份" ai={aiFilledKeys.has('established_year')}>
                  <input style={{ ...INP, ...aiInp(aiFilledKeys.has('established_year')) }} value={form.established_year} onChange={e => setF('established_year', e.target.value)} placeholder="2010" />
                </FLD>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#334155', fontWeight: 600 }}>
                <input type="checkbox" checked={form.is_preferred} onChange={e => setF('is_preferred', e.target.checked)} style={{ width: 16, height: 16 }} />
                常用供应商（标星 ⭐）
              </label>
            </div>

            {/* ── 2. Location ───────────────────────────────────────────────── */}
            <div style={CARD}>
              <div style={SEC}>{isEdit ? '地区' : '2. 地区'}</div>
              <div style={R2}>
                <FLD label="国家" ai={aiFilledKeys.has('country')}>
                  <input style={{ ...INP, ...aiInp(aiFilledKeys.has('country')) }} value={form.country} onChange={e => setF('country', e.target.value)} placeholder="China / UAE" />
                </FLD>
                <FLD label="城市" ai={aiFilledKeys.has('city')}>
                  <input style={{ ...INP, ...aiInp(aiFilledKeys.has('city')) }} value={form.city} onChange={e => setF('city', e.target.value)} placeholder="Guangzhou" />
                </FLD>
              </div>
            </div>

            {/* ── 3. Cooperation ────────────────────────────────────────────── */}
            <div style={CARD}>
              <div style={SEC}>{isEdit ? '合作信息' : '3. 合作信息'}</div>
              <div style={R3}>
                <FLD label="付款条款"><input style={INP} value={form.payment_terms} onChange={e => setF('payment_terms', e.target.value)} placeholder="30%+70% TT" /></FLD>
                <FLD label="默认交期（天）"><input style={INP} type="number" min={0} value={form.default_lead_time_days} onChange={e => setF('default_lead_time_days', e.target.value)} /></FLD>
                <FLD label="GCI 内部对接人"><input style={INP} value={form.internal_owner} onChange={e => setF('internal_owner', e.target.value)} placeholder="Chris / Lili" /></FLD>
              </div>
              <div style={R3}>
                <FLD label="状态">
                  <select style={SEL} value={form.status} onChange={e => setF('status', e.target.value as SupplierStatus)}>
                    {STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                </FLD>
                <FLD label="评级">
                  <select style={SEL} value={form.current_rating} onChange={e => setF('current_rating', e.target.value as SupplierRating)}>
                    {RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </FLD>
                <FLD label="网站" ai={aiFilledKeys.has('website')}>
                  <input style={{ ...INP, ...aiInp(aiFilledKeys.has('website')) }} value={form.website} onChange={e => setF('website', e.target.value)} placeholder="https://..." />
                </FLD>
              </div>
            </div>

            {/* ── 4. Notes ──────────────────────────────────────────────────── */}
            <div style={CARD}>
              <div style={SEC}>{isEdit ? '内部备注' : '4. 内部备注'}</div>
              {aiFilledKeys.has('notes') && (
                <Alert type="ok" style={{ marginBottom: 10 }}>✓ AI 已从公司资料提取：主要产品 / 联系人 / 电话 / 邮箱，已填入备注</Alert>
              )}
              <textarea style={{ ...INP, ...aiInp(aiFilledKeys.has('notes')), resize: 'vertical', minHeight: 80 }}
                value={form.notes} onChange={e => setF('notes', e.target.value)}
                placeholder="内部备注（主要产品、联系人信息、合作说明等）…" />
            </div>

            {saveError && <Alert type="error">✗ {saveError}</Alert>}

            {/* ── Save ──────────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleSave} disabled={savingDisabled}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 10, border: 'none',
                  background: savingDisabled ? '#94a3b8' : NAVY,
                  color: '#fff', fontSize: 15, fontWeight: 700,
                  cursor: savingDisabled ? 'not-allowed' : 'pointer',
                }}>
                {saving ? '保存中…'
                  : uploadedFile ? '确认创建供应商 + 归档文件 + 写入执照信息 →'
                  : isEdit ? '保存修改' : '创建供应商 →'}
              </button>
              <button onClick={onCancel} style={{ padding: '13px 28px', borderRadius: 10, border: `1.5px solid ${CBORDER}`, background: '#fff', color: '#475569', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                取消
              </button>
            </div>

            {aiFilledKeys.size > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
                🟢 绿色高亮字段 = AI 自动识别填入，保存前请核对
              </div>
            )}
          </div>

          {/* ═══ RIGHT — summary ════════════════════════════════════════════ */}
          <div style={{ width: 280, flexShrink: 0, position: 'sticky', top: 24 }}>
            <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={SEC}>档案完整度</div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: '#334155', fontWeight: 600 }}>整体进度</span>
                  <span style={{ color: NAVY, fontWeight: 700 }}>{pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: '#e8e0d0', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 99, background: pct === 100 ? '#16a34a' : GOLD, width: `${pct}%`, transition: 'width .3s' }} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {checks.map(({ label, done }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ color: done ? '#16a34a' : '#cbd5e1', fontSize: 15, flexShrink: 0 }}>{done ? '✓' : '○'}</span>
                    <span style={{ color: done ? '#334155' : '#94a3b8' }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* License detail preview */}
              {showLicenseEdit && (
                <div style={{ borderTop: `1px solid ${CBORDER}`, paddingTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                    营业执照识别
                  </div>
                  {([
                    ['执照号', licenseFields.document_number],
                    ['注册号', licenseFields.registration_number],
                    ['法定代表人', licenseFields.legal_representative],
                    ['颁发机构', licenseFields.issuing_authority],
                    ['签发', licenseFields.issue_date],
                    ['到期', licenseFields.expire_date],
                    ['VAT', licenseFields.vat_number],
                  ] as [string, string][]).filter(([, v]) => v).map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
                      <span style={{ color: '#94a3b8' }}>{l}</span>
                      <span style={{ color: '#334155', fontWeight: 600, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>↑ 保存后写入 supplier_documents</div>
                </div>
              )}

              {!uploadedFile && !isEdit && (
                <div style={{ borderTop: `1px solid ${CBORDER}`, paddingTop: 14 }}>
                  <div style={{ background: `${GOLD}15`, borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
                    💡 保存后可在详情页继续上传认证证书、新增联系人和产品
                  </div>
                </div>
              )}

              {uploadedFile && (
                <div style={{ borderTop: `1px solid ${CBORDER}`, paddingTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>保存后执行顺序</div>
                  {['① createSupplier', '② 归档文件到 suppliers/{id}/...', '③ createDocument', '④ 跳转详情页'].map((s, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#334155', marginBottom: 4 }}>{s}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function FLD({ label, children, ai }: { label: string; children: React.ReactNode; ai?: boolean }) {
  return (
    <div>
      <label style={{ ...LBL, color: ai ? '#166534' : '#334155' }}>{label}{ai ? ' ✓' : ''}</label>
      {children}
    </div>
  );
}

function aiInp(isAi: boolean): React.CSSProperties {
  return isAi ? { background: '#f0fdf4', borderColor: '#86efac' } : {};
}

function Spinner({ label, sub, icon = '⬆' }: { label: string; sub: string; icon?: string }) {
  return (
    <div style={{ padding: '20px 0', textAlign: 'center' }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#64748b' }}>{sub}</div>
    </div>
  );
}

function Alert({ type, children, style: extra }: { type: 'ok' | 'warn' | 'error'; children: React.ReactNode; style?: React.CSSProperties }) {
  const map = { ok: ['#f0fdf4', '#bbf7d0', '#166534'], warn: ['#fef3c7', '#fde68a', '#92400e'], error: ['#fee2e2', '#fca5a5', '#991b1b'] };
  const [bg, border, color] = map[type];
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', ...extra }}>
      {children}
    </div>
  );
}

function ConfBadge({ v }: { v: string }) {
  const isHigh = v === 'high';
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 700,
      background: isHigh ? '#dcfce7' : '#fef9ec', color: isHigh ? '#166534' : '#92400e' }}>
      置信度 {v}
    </span>
  );
}
