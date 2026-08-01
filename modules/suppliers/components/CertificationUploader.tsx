/**
 * CertificationUploader
 * Upload → AI parse (SUPPLIER_CERTIFICATION via /api/bs/parse-document) →
 * editable confirm form → save supplier_certifications + supplier_documents.
 *
 * Reuses the same Gemini Vision endpoint as CustomerDocumentManager (biz-solutions).
 */
import React, { useRef, useState } from 'react';
import { useI18n } from '@gci/i18n';
import type { SupplierProduct } from '../types';
import { uploadSupplierFile, createDocument } from '../lib/documentsCloud';
import { listProducts } from '../lib/suppliersCloud';
import { createCertification } from '../lib/certificationsCloud';

const NAVY = '#0B1F44';
const GOLD = '#C9A84C';
const BORDER = '#CBD5E1';
const T2 = '#374151';
const T3 = '#6b7280';
const INP: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${BORDER}`,
  fontSize: 13, color: NAVY, background: '#fff', outline: 'none',
};
const LBL: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: T2,
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em',
};

const CERT_TYPES = [
  'CE','FDA','ISO9001','ISO14001','ISO22000','HACCP','Halal','SGS',
  'RoHS','REACH','SASO','ESMA','EAC','GSO','BSCI','SEDEX','GMP','其他',
];

type Stage = 'idle' | 'parsing' | 'confirm' | 'saving' | 'done';

interface ParsedFields {
  certification_type?: string;
  standard_number?: string;
  certification_number?: string;
  supplier_name?: string;
  issuing_body?: string;
  issue_date?: string;
  expire_date?: string;
  market_scope?: string;
  covered_products?: string[];
  covered_models?: string[];
  scope_description?: string;
  confidence?: string;
}

interface Props {
  supplierId: string;
  onSaved: () => void;
  onCancel: () => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function inferStatus(fields: ParsedFields): 'available' | 'expired' | 'pending_verification' {
  if (!fields.expire_date && !fields.certification_number) return 'pending_verification';
  if (fields.expire_date) {
    const exp = new Date(fields.expire_date);
    if (!isNaN(exp.getTime()) && exp < new Date()) return 'expired';
  }
  if (fields.certification_number || fields.expire_date) return 'available';
  return 'pending_verification';
}

export default function CertificationUploader({ supplierId, onSaved, onCancel }: Props) {
  const { lang, dict } = useI18n();
  const t = dict.suppliers.certUploader;
  const u = dict.suppliers.uploaderCommon;
  const c0 = dict.suppliers.common;
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<ParsedFields>({});
  const [coveredModelsText, setCoveredModelsText] = useState('');
  const [coveredProductsText, setCoveredProductsText] = useState('');
  const [parseError, setParseError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [parseModel, setParseModel] = useState('');
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [linkedProductId, setLinkedProductId] = useState('');

  const fld = <K extends keyof ParsedFields>(k: K, v: string) =>
    setFields(f => ({ ...f, [k]: v }));

  const handleFile = async (f: File) => {
    setFile(f);
    setParseError('');
    setStage('parsing');
    // Also load supplier products for linking
    const prods = await listProducts(supplierId);
    setProducts(prods);
    try {
      const base64 = await fileToBase64(f);
      const mimeType = f.type || (f.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png');
      const res = await fetch('/api/bs/parse-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType, data: base64, documentType: 'SUPPLIER_CERTIFICATION' }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || u.genericParseError);
      const pf: ParsedFields = data.fields ?? {};
      setFields(pf);
      setCoveredModelsText((pf.covered_models ?? []).join('\n'));
      setCoveredProductsText((pf.covered_products ?? []).join('\n'));
      setParseModel(data.model || '');
      setStage('confirm');
    } catch (e: any) {
      setParseError(e?.message || u.genericParseError);
      setStage('confirm');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleSave = async () => {
    if (!fields.certification_type) { setSaveError(t.savingErr); return; }
    if (!file) return;
    setSaveError('');
    setStage('saving');
    try {
      // 1. Upload file
      const up = await uploadSupplierFile(supplierId, file, '认证证书');
      if (!up) throw new Error(t.uploadFailed);

      // 2. Determine cert status from dates
      const status = inferStatus(fields);

      // 3. Create certification record
      const cert = await createCertification({
        supplier_id: supplierId,
        certification_type: fields.certification_type,
        certification_number: fields.certification_number || undefined,
        status,
        issuing_body: fields.issuing_body || undefined,
        issue_date: fields.issue_date || undefined,
        expire_date: fields.expire_date || undefined,
        market_scope: fields.market_scope || undefined,
        scope_description: fields.scope_description
          || (fields.standard_number ? `Standard: ${fields.standard_number}` : undefined)
          || undefined,
        notes: coveredProductsText ? `Products: ${coveredProductsText}` : undefined,
      });
      if (!cert?.id) throw new Error(t.saveCertFailed);

      // 4. Create document record linked to cert
      const docName = `${fields.certification_type}${fields.certification_number ? ` — ${fields.certification_number}` : ''} ${lang === 'zh' ? '证书' : 'Certificate'}`;
      await createDocument({
        supplier_id: supplierId,
        certification_id: cert.id,
        document_type: '认证证书' as any,
        document_name: docName,
        storage_bucket: up.bucket,
        storage_path: up.path,
        file_url: up.url,
        document_number: fields.certification_number || undefined,
        issuing_authority: fields.issuing_body || undefined,
        issue_date: fields.issue_date || undefined,
        expire_date: fields.expire_date || undefined,
        verification_status: 'unverified',
        is_primary: true,
      });

      setStage('done');
      setTimeout(onSaved, 800);
    } catch (e: any) {
      setSaveError(e?.message || c0.notSet);
      setStage('confirm');
    }
  };

  // ── IDLE ───────────────────────────────────────────────────────────────────
  if (stage === 'idle') {
    return (
      <div>
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${GOLD}`, borderRadius: 12, padding: '40px 24px',
            textAlign: 'center', cursor: 'pointer', background: '#fffbf0',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 10 }}>🏅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
            {t.dropTitle}
          </div>
          <div style={{ fontSize: 12, color: T3 }}>{u.dropSupport}</div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
        </div>
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button onClick={onCancel} style={{ fontSize: 13, color: T3, background: 'none', border: 'none', cursor: 'pointer' }}>{c0.cancel}</button>
        </div>
      </div>
    );
  }

  // ── PARSING ────────────────────────────────────────────────────────────────
  if (stage === 'parsing') {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 16 }}>⟳</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>{u.parsingTitle}</div>
        <div style={{ fontSize: 12, color: T3 }}>{t.parsingSub}</div>
      </div>
    );
  }

  // ── SAVING ─────────────────────────────────────────────────────────────────
  if (stage === 'saving') {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 16 }}>⬆</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{u.savingTitle}</div>
      </div>
    );
  }

  // ── DONE ───────────────────────────────────────────────────────────────────
  if (stage === 'done') {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12, color: '#16a34a' }}>✓</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{t.done}</div>
      </div>
    );
  }

  // ── CONFIRM ────────────────────────────────────────────────────────────────
  const confidence = fields.confidence;

  return (
    <div>
      {parseError ? (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
          {u.parseErrorBanner(parseError)}
        </div>
      ) : (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#166534', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{u.parseOkBanner(parseModel)}</span>
          {confidence && (
            <span style={{ fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 999,
              background: confidence === 'high' ? '#dcfce7' : confidence === 'medium' ? '#fef9ec' : '#fee2e2',
              color: confidence === 'high' ? '#166534' : confidence === 'medium' ? '#92400e' : '#991b1b',
            }}>{u.confidenceLabel(confidence)}</span>
          )}
        </div>
      )}

      <div style={{ fontSize: 12, color: T3, marginBottom: 12 }}>{u.fileLabel(file?.name ?? '')}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <Fld label={t.fType} aiVal={!!fields.certification_type}>
          <select style={aiField(!!fields.certification_type)} value={fields.certification_type ?? ''} onChange={e => fld('certification_type', e.target.value)}>
            <option value="">{c0.pleaseSelect}</option>
            {CERT_TYPES.map(ct => <option key={ct} value={ct}>{ct === '其他' ? (lang === 'zh' ? '其他' : 'Other') : ct}</option>)}
          </select>
        </Fld>
        <Fld label={t.fStandardNumber} aiVal={!!fields.standard_number}>
          <input style={aiField(!!fields.standard_number)} value={fields.standard_number ?? ''} onChange={e => fld('standard_number', e.target.value)} placeholder="ISO 9001:2015" />
        </Fld>
        <Fld label={t.fNumber} aiVal={!!fields.certification_number}>
          <input style={aiField(!!fields.certification_number)} value={fields.certification_number ?? ''} onChange={e => fld('certification_number', e.target.value)} />
        </Fld>
        <Fld label={t.fIssuingBody} aiVal={!!fields.issuing_body}>
          <input style={aiField(!!fields.issuing_body)} value={fields.issuing_body ?? ''} onChange={e => fld('issuing_body', e.target.value)} placeholder="SGS / Bureau Veritas / TUV…" />
        </Fld>
        <Fld label={t.fIssueDate} aiVal={!!fields.issue_date}>
          <input style={aiField(!!fields.issue_date)} type="date" value={fields.issue_date ?? ''} onChange={e => fld('issue_date', e.target.value)} />
        </Fld>
        <Fld label={t.fExpireDate} aiVal={!!fields.expire_date}>
          <input style={aiField(!!fields.expire_date)} type="date" value={fields.expire_date ?? ''} onChange={e => fld('expire_date', e.target.value)} />
        </Fld>
        <Fld label={t.fScope} aiVal={!!fields.market_scope}>
          <input style={aiField(!!fields.market_scope)} value={fields.market_scope ?? ''} onChange={e => fld('market_scope', e.target.value)} placeholder="EU / UAE / Global…" />
        </Fld>
        <Fld label={t.fScopeDesc} aiVal={!!fields.scope_description}>
          <input style={aiField(!!fields.scope_description)} value={fields.scope_description ?? ''} onChange={e => fld('scope_description', e.target.value)} />
        </Fld>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Fld label={t.fCoveredProducts} aiVal={coveredProductsText.length > 0}>
          <textarea style={{ ...aiField(coveredProductsText.length > 0), resize: 'vertical', minHeight: 70 }} value={coveredProductsText} onChange={e => setCoveredProductsText(e.target.value)} />
        </Fld>
        <Fld label={t.fCoveredModels} aiVal={coveredModelsText.length > 0}>
          <textarea style={{ ...aiField(coveredModelsText.length > 0), resize: 'vertical', minHeight: 70 }} value={coveredModelsText} onChange={e => setCoveredModelsText(e.target.value)} />
        </Fld>
      </div>

      {/* Link to existing product */}
      {products.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <label style={LBL}>{t.linkProduct}</label>
          <select style={INP} value={linkedProductId} onChange={e => setLinkedProductId(e.target.value)}>
            <option value="">{t.linkNone}</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.product_name_cn || p.product_name_en || p.supplier_sku || p.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Auto status preview */}
      <div style={{ background: '#f8fafc', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: T2 }}>
        {t.statusPreviewPrefix}
        <strong style={{ marginLeft: 6, color: NAVY }}>
          {inferStatus(fields) === 'available' ? t.statusAvailable
            : inferStatus(fields) === 'expired' ? t.statusExpired
            : t.statusPending}
        </strong>
      </div>

      {saveError && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#991b1b' }}>
          ✗ {saveError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button
          onClick={handleSave}
          style={{ flex: 1, padding: '11px 0', background: NAVY, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          {u.confirmSave}
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          style={{ padding: '11px 16px', background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 8, color: T2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          {u.reupload}
        </button>
        <button
          onClick={onCancel}
          style={{ padding: '11px 16px', background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 8, color: T3, fontSize: 13, cursor: 'pointer' }}
        >
          {c0.cancel}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: T3 }}>
        {u.aiHighlightNote}
      </div>
    </div>
  );
}

function aiField(hasVal: boolean): React.CSSProperties {
  return { ...INP, background: hasVal ? '#f0fdf4' : '#fff', borderColor: hasVal ? '#86efac' : BORDER };
}

function Fld({ label, children, aiVal }: { label: string; children: React.ReactNode; aiVal?: boolean }) {
  return (
    <div>
      <label style={{ ...LBL, color: aiVal ? '#166534' : T2 }}>{label}{aiVal ? ' ✓' : ''}</label>
      {children}
    </div>
  );
}
