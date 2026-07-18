/**
 * TradeLicenseUploader
 * Upload → AI parse (SUPPLIER_TRADE_LICENSE via /api/bs/parse-document) →
 * editable confirm form → save supplier_documents + update suppliers record.
 *
 * Reuses the same Gemini Vision endpoint as CustomerDocumentManager (biz-solutions).
 */
import React, { useRef, useState } from 'react';
import type { Supplier } from '../types';
import { uploadSupplierFile, createDocument } from '../lib/documentsCloud';
import { updateSupplier } from '../lib/suppliersCloud';

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

type Stage = 'idle' | 'parsing' | 'confirm' | 'saving' | 'done';

interface ParsedFields {
  legal_name?: string;
  name_en?: string;
  name_cn?: string;
  document_number?: string;
  registration_number?: string;
  country?: string;
  city?: string;
  registered_address?: string;
  legal_representative?: string;
  business_activities?: string[];
  issuing_authority?: string;
  issue_date?: string;
  expire_date?: string;
  vat_number?: string;
  capital?: string;
  confidence?: string;
}

interface Props {
  supplier: Supplier;
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

export default function TradeLicenseUploader({ supplier, onSaved, onCancel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<ParsedFields>({});
  const [activitiesText, setActivitiesText] = useState('');
  const [parseError, setParseError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [parseModel, setParseModel] = useState('');

  const fld = <K extends keyof ParsedFields>(k: K, v: string) =>
    setFields(f => ({ ...f, [k]: v }));

  const handleFile = async (f: File) => {
    setFile(f);
    setParseError('');
    setStage('parsing');
    try {
      const base64 = await fileToBase64(f);
      const mimeType = f.type || (f.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png');
      const res = await fetch('/api/bs/parse-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType, data: base64, documentType: 'SUPPLIER_TRADE_LICENSE' }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'AI 解析失败');
      const pf: ParsedFields = data.fields ?? {};
      setFields(pf);
      setActivitiesText((pf.business_activities ?? []).join('\n'));
      setParseModel(data.model || '');
      setStage('confirm');
    } catch (e: any) {
      setParseError(e?.message || '解析失败');
      setStage('confirm'); // still allow manual fill
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleSave = async () => {
    if (!file) return;
    setSaveError('');
    setStage('saving');
    try {
      // 1. Upload file to suppliers-private
      const up = await uploadSupplierFile(supplier.id!, file, '营业执照');
      if (!up) throw new Error('文件上传失败，请检查 Storage bucket 是否已创建');

      // 2. Save document record
      const docName = (fields.legal_name || fields.name_cn || file.name).slice(0, 100);
      await createDocument({
        supplier_id: supplier.id!,
        document_type: '营业执照',
        document_name: docName + ' — 营业执照',
        storage_bucket: up.bucket,
        storage_path: up.path,
        file_url: up.url,
        document_number: fields.document_number || undefined,
        issuing_authority: fields.issuing_authority || undefined,
        issue_date: fields.issue_date || undefined,
        expire_date: fields.expire_date || undefined,
        verification_status: 'unverified',
        notes: fields.registered_address || undefined,
      });

      // 3. Update supplier core fields (only non-empty values)
      const patch: Partial<Supplier> = {};
      if (fields.legal_name && !supplier.supplier_name_display) patch.supplier_name_display = fields.legal_name;
      if (fields.name_cn) patch.name_cn = fields.name_cn;
      if (fields.name_en) patch.name_en = fields.name_en;
      if (fields.country && !supplier.country) patch.country = fields.country;
      if (fields.city && !supplier.city) patch.city = fields.city;
      if (Object.keys(patch).length) await updateSupplier(supplier.id!, patch);

      setStage('done');
      setTimeout(onSaved, 800);
    } catch (e: any) {
      setSaveError(e?.message || '保存失败');
      setStage('confirm');
    }
  };

  // ── IDLE: drop zone ────────────────────────────────────────────────────────
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
            transition: 'background .15s',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
            上传营业执照 / Upload Trade License
          </div>
          <div style={{ fontSize: 12, color: T3 }}>
            支持 PDF、PNG、JPG · 拖拽或点击选择
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
        </div>
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button onClick={onCancel} style={{ fontSize: 13, color: T3, background: 'none', border: 'none', cursor: 'pointer' }}>取消</button>
        </div>
      </div>
    );
  }

  // ── PARSING ────────────────────────────────────────────────────────────────
  if (stage === 'parsing') {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 16, animation: 'spin 1s linear infinite' }}>⟳</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>AI 解析中…</div>
        <div style={{ fontSize: 12, color: T3 }}>正在通过 Gemini Vision 提取营业执照信息，请稍候</div>
      </div>
    );
  }

  // ── SAVING ─────────────────────────────────────────────────────────────────
  if (stage === 'saving') {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 16 }}>⬆</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>正在上传与保存…</div>
      </div>
    );
  }

  // ── DONE ───────────────────────────────────────────────────────────────────
  if (stage === 'done') {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12, color: '#16a34a' }}>✓</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>营业执照已保存</div>
      </div>
    );
  }

  // ── CONFIRM ────────────────────────────────────────────────────────────────
  const aiOk = !parseError && !!fields.document_number;
  const confidence = fields.confidence;

  return (
    <div>
      {/* Parse status banner */}
      {parseError ? (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
          ⚠ AI 解析失败：{parseError}。请手动填写以下字段，仍可保存。
        </div>
      ) : (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#166534', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✓ AI 解析完成（{parseModel}）— 请核对并确认以下字段</span>
          {confidence && (
            <span style={{ fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 999,
              background: confidence === 'high' ? '#dcfce7' : confidence === 'medium' ? '#fef9ec' : '#fee2e2',
              color: confidence === 'high' ? '#166534' : confidence === 'medium' ? '#92400e' : '#991b1b',
            }}>置信度 {confidence}</span>
          )}
        </div>
      )}

      <div style={{ fontSize: 12, color: T3, marginBottom: 12 }}>文件：{file?.name}</div>

      {/* Editable fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <Fld label="公司名称（官方注册名）" aiVal={!!fields.legal_name}>
          <input style={aiField(!!fields.legal_name)} value={fields.legal_name ?? ''} onChange={e => fld('legal_name', e.target.value)} placeholder="注册名称" />
        </Fld>
        <Fld label="中文名称" aiVal={!!fields.name_cn}>
          <input style={aiField(!!fields.name_cn)} value={fields.name_cn ?? ''} onChange={e => fld('name_cn', e.target.value)} placeholder="中文名" />
        </Fld>
        <Fld label="英文名称" aiVal={!!fields.name_en}>
          <input style={aiField(!!fields.name_en)} value={fields.name_en ?? ''} onChange={e => fld('name_en', e.target.value)} placeholder="English Name" />
        </Fld>
        <Fld label="营业执照号 / 统一社会信用代码" aiVal={!!fields.document_number}>
          <input style={aiField(!!fields.document_number)} value={fields.document_number ?? ''} onChange={e => fld('document_number', e.target.value)} placeholder="执照编号" />
        </Fld>
        <Fld label="公司注册号（如不同）" aiVal={!!fields.registration_number}>
          <input style={aiField(!!fields.registration_number)} value={fields.registration_number ?? ''} onChange={e => fld('registration_number', e.target.value)} />
        </Fld>
        <Fld label="颁发机构" aiVal={!!fields.issuing_authority}>
          <input style={aiField(!!fields.issuing_authority)} value={fields.issuing_authority ?? ''} onChange={e => fld('issuing_authority', e.target.value)} placeholder="工商局 / DED / DMCC…" />
        </Fld>
        <Fld label="国家" aiVal={!!fields.country}>
          <input style={aiField(!!fields.country)} value={fields.country ?? ''} onChange={e => fld('country', e.target.value)} placeholder="China" />
        </Fld>
        <Fld label="城市" aiVal={!!fields.city}>
          <input style={aiField(!!fields.city)} value={fields.city ?? ''} onChange={e => fld('city', e.target.value)} placeholder="广州" />
        </Fld>
        <Fld label="法定代表人 / 负责人" aiVal={!!fields.legal_representative}>
          <input style={aiField(!!fields.legal_representative)} value={fields.legal_representative ?? ''} onChange={e => fld('legal_representative', e.target.value)} />
        </Fld>
        <Fld label="VAT / 税号（如有）" aiVal={!!fields.vat_number}>
          <input style={aiField(!!fields.vat_number)} value={fields.vat_number ?? ''} onChange={e => fld('vat_number', e.target.value)} />
        </Fld>
        <Fld label="签发日期" aiVal={!!fields.issue_date}>
          <input style={aiField(!!fields.issue_date)} type="date" value={fields.issue_date ?? ''} onChange={e => fld('issue_date', e.target.value)} />
        </Fld>
        <Fld label="到期日期" aiVal={!!fields.expire_date}>
          <input style={aiField(!!fields.expire_date)} type="date" value={fields.expire_date ?? ''} onChange={e => fld('expire_date', e.target.value)} />
        </Fld>
      </div>
      <Fld label="注册地址" aiVal={!!fields.registered_address}>
        <input style={aiField(!!fields.registered_address)} value={fields.registered_address ?? ''} onChange={e => fld('registered_address', e.target.value)} />
      </Fld>
      <div style={{ marginTop: 14 }}>
        <Fld label="经营范围 / 业务活动（每行一条）" aiVal={activitiesText.length > 0}>
          <textarea
            style={{ ...aiField(activitiesText.length > 0), resize: 'vertical', minHeight: 80 }}
            value={activitiesText}
            onChange={e => setActivitiesText(e.target.value)}
          />
        </Fld>
      </div>

      {saveError && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: 13, color: '#991b1b' }}>
          ✗ {saveError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button
          onClick={handleSave}
          style={{ flex: 1, padding: '11px 0', background: NAVY, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          确认并保存 →
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          style={{ padding: '11px 16px', background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 8, color: T2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          重新上传
        </button>
        <button
          onClick={onCancel}
          style={{ padding: '11px 16px', background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 8, color: T3, fontSize: 13, cursor: 'pointer' }}
        >
          取消
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
        ⚠ 绿色高亮 = AI 自动识别字段，请核对后再确认保存。数据库不会在确认前写入任何内容。
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
