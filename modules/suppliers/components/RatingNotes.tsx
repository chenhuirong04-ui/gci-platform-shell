import React, { useState } from 'react';
import type { Supplier, SupplierRating } from '../types';
import { updateSupplier } from '../lib/suppliersCloud';

const NAVY = '#0B1F44';
const GOLD = '#C9A84C';
const BORDER = '#e2e8f0';
const T2 = '#374151';
const T3 = '#6b7280';
const INP: React.CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1.5px solid #CBD5E1`, fontSize: 13, color: NAVY, background: '#fff', outline: 'none' };
const LBL: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: T2, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' };

const RATINGS: SupplierRating[] = ['A', 'B', 'C', 'D'];
const RATING_DESC: Record<SupplierRating, string> = {
  A: '优质供应商', B: '合格供应商', C: '待改进', D: '风险供应商',
};

interface Props {
  supplier: Supplier;
  onUpdated: (s: Supplier) => void;
}

export default function RatingNotes({ supplier, onUpdated }: Props) {
  const [rating, setRating] = useState<SupplierRating>(supplier.current_rating ?? 'B');
  const [score, setScore] = useState(supplier.current_score ?? '');
  const [owner, setOwner] = useState(supplier.internal_owner ?? '');
  const [notes, setNotes] = useState(supplier.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await updateSupplier(supplier.id!, {
        current_rating: rating,
        current_score: score ? Number(score) : undefined,
        internal_owner: owner,
        notes,
      });
      if (ok) {
        onUpdated({ ...supplier, current_rating: rating, current_score: score ? Number(score) : undefined, internal_owner: owner, notes });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {RATINGS.map(r => (
          <button
            key={r}
            onClick={() => setRating(r)}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, fontWeight: 800, fontSize: 16, cursor: 'pointer',
              border: rating === r ? `2px solid ${GOLD}` : `1.5px solid ${BORDER}`,
              background: rating === r ? NAVY : '#fff',
              color: rating === r ? GOLD : T2,
            }}
          >
            {r}
            <div style={{ fontSize: 11, fontWeight: 500, marginTop: 2, color: rating === r ? '#f0ead2' : '#94a3b8' }}>{RATING_DESC[r]}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <label style={LBL}>综合评分（0–100）</label>
          <input style={INP} type="number" min={0} max={100} value={score} onChange={e => setScore(e.target.value)} placeholder="可选" />
        </div>
        <div>
          <label style={LBL}>GCI 内部对接人</label>
          <input style={INP} value={owner} onChange={e => setOwner(e.target.value)} placeholder="Chris / Lili / Novie" />
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={LBL}>内部备注</label>
        <textarea
          style={{ ...INP, resize: 'vertical', minHeight: 100 }}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="合作历史、注意事项、供应商特点…"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{ padding: '10px 32px', background: NAVY, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
      >
        {saving ? '保存中…' : saved ? '已保存 ✓' : '保存'}
      </button>
    </div>
  );
}
