import React, { useEffect, useState } from 'react';
import type { SupplierContact } from '../types';
import { createContact, deleteContact, listContacts, updateContact } from '../lib/suppliersCloud';

const NAVY = '#0B1F44';
const GOLD = '#C9A84C';
const BORDER = '#CBD5E1';
const T2 = '#475569';
const T3 = '#94a3b8';

const INP: React.CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${BORDER}`, fontSize: 13, color: NAVY, background: '#fff', outline: 'none' };
const LBL: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: T2, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' };

const EMPTY_CONTACT = (supplierId: string): Omit<SupplierContact, 'id'> => ({
  supplier_id: supplierId, full_name: '', job_title: '', department: '',
  contact_role: '', phone: '', mobile: '', whatsapp: '', wechat: '', email: '',
  preferred_language: 'zh', is_primary: false, is_decision_maker: false,
  is_commercial_contact: false, is_technical_contact: false,
  is_finance_contact: false, is_logistics_contact: false,
  status: 'active', notes: '',
});

interface Props { supplierId: string; }

export default function ContactManager({ supplierId }: Props) {
  const [contacts, setContacts] = useState<SupplierContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editContact, setEditContact] = useState<Partial<SupplierContact> | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setContacts(await listContacts(supplierId));
    setLoading(false);
  };
  useEffect(() => { load(); }, [supplierId]);

  const handleSave = async () => {
    if (!editContact?.full_name?.trim()) return;
    setSaving(true);
    try {
      if (editContact.id) {
        await updateContact(editContact.id, editContact);
      } else {
        await createContact({ ...EMPTY_CONTACT(supplierId), ...editContact, supplier_id: supplierId });
      }
      setEditContact(null);
      await load();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await deleteContact(id);
    setConfirmDeleteId(null);
    await load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: T2 }}>{contacts.length} 位联系人</span>
        <button
          onClick={() => setEditContact(EMPTY_CONTACT(supplierId))}
          style={{ padding: '7px 16px', background: NAVY, color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          + 新增联系人
        </button>
      </div>

      {loading ? (
        <div style={{ color: T3, textAlign: 'center', padding: 40 }}>加载中…</div>
      ) : contacts.length === 0 ? (
        <div style={{ color: T3, textAlign: 'center', padding: 40 }}>暂无联系人，请新增</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contacts.map(c => (
            <div key={c.id} style={{ background: '#f8fafc', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{c.full_name}</span>
                    {c.is_primary && <span style={{ fontSize: 10, fontWeight: 800, color: GOLD, background: GOLD + '18', padding: '2px 7px', borderRadius: 999 }}>主联系人</span>}
                    {c.is_decision_maker && <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#7c3aed18', padding: '2px 7px', borderRadius: 999 }}>决策人</span>}
                  </div>
                  <div style={{ fontSize: 12, color: T2 }}>{[c.job_title, c.department, c.contact_role].filter(Boolean).join(' · ')}</div>
                  <div style={{ fontSize: 12, color: T3, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {c.mobile && <span>📱 {c.mobile}</span>}
                    {c.whatsapp && <span>💬 WhatsApp: {c.whatsapp}</span>}
                    {c.wechat && <span>微信: {c.wechat}</span>}
                    {c.email && <span>✉ {c.email}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: T3, marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {c.is_commercial_contact && <span>商务</span>}
                    {c.is_technical_contact && <span>技术</span>}
                    {c.is_finance_contact && <span>财务</span>}
                    {c.is_logistics_contact && <span>物流</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditContact({ ...c })} style={{ fontSize: 12, color: NAVY, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>编辑</button>
                  {confirmDeleteId === c.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleDelete(c.id!)} style={{ fontSize: 12, color: '#fff', background: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>确认删除</button>
                      <button onClick={() => setConfirmDeleteId(null)} style={{ fontSize: 12, color: T2, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>取消</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(c.id!)} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: `1px solid #fca5a5`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>删除</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editContact && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setEditContact(null); }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 560, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 20 }}>{editContact.id ? '编辑联系人' : '新增联系人'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <F label="姓名 *"><input style={INP} value={editContact.full_name ?? ''} onChange={e => setEditContact(v => ({ ...v!, full_name: e.target.value }))} /></F>
              <F label="职位"><input style={INP} value={editContact.job_title ?? ''} onChange={e => setEditContact(v => ({ ...v!, job_title: e.target.value }))} /></F>
              <F label="部门"><input style={INP} value={editContact.department ?? ''} onChange={e => setEditContact(v => ({ ...v!, department: e.target.value }))} /></F>
              <F label="角色"><input style={INP} value={editContact.contact_role ?? ''} onChange={e => setEditContact(v => ({ ...v!, contact_role: e.target.value }))} placeholder="销售/财务/老板…" /></F>
              <F label="手机"><input style={INP} value={editContact.mobile ?? ''} onChange={e => setEditContact(v => ({ ...v!, mobile: e.target.value }))} /></F>
              <F label="WhatsApp"><input style={INP} value={editContact.whatsapp ?? ''} onChange={e => setEditContact(v => ({ ...v!, whatsapp: e.target.value }))} /></F>
              <F label="微信"><input style={INP} value={editContact.wechat ?? ''} onChange={e => setEditContact(v => ({ ...v!, wechat: e.target.value }))} /></F>
              <F label="电子邮件"><input style={INP} value={editContact.email ?? ''} onChange={e => setEditContact(v => ({ ...v!, email: e.target.value }))} /></F>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              {([['is_primary','主联系人'],['is_decision_maker','决策人'],['is_commercial_contact','商务'],['is_technical_contact','技术'],['is_finance_contact','财务'],['is_logistics_contact','物流']] as [keyof SupplierContact, string][]).map(([k, l]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: NAVY, fontWeight: 600 }}>
                  <input type="checkbox" checked={!!(editContact as any)[k]} onChange={e => setEditContact(v => ({ ...v!, [k]: e.target.checked }))} />
                  {l}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '10px 0', background: NAVY, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>{saving ? '保存中…' : '保存'}</button>
              <button onClick={() => setEditContact(null)} style={{ padding: '10px 20px', background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 8, color: T2, fontWeight: 600, cursor: 'pointer' }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={LBL}>{label}</label>{children}</div>;
}
