import React, { useEffect, useState } from 'react';
import { useI18n } from '@gci/i18n';
import type { SupplierContact } from '../types';
import { createContact, deleteContact, listContacts, updateContact } from '../lib/suppliersCloud';
import { workspace, fontSizes, radii } from '@gci/design-system';
import { INPUT, LABEL, formGrid, MODAL_OVERLAY, MODAL_PANEL_CLASS, modalPanel, ModalPortal } from '../lib/ui';

const NAVY = workspace.textPrimary;
const GOLD = workspace.accent;
const BORDER = '#e2e8f0';
const T2 = '#374151';
const T3 = '#6b7280';

const INP = INPUT;
const LBL = LABEL;

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
  const { dict } = useI18n();
  const t = dict.suppliers.contacts;
  const c0 = dict.suppliers.common;
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
        <span style={{ fontSize: fontSizes.sm, color: T2 }}>{t.count(contacts.length)}</span>
        <button
          onClick={() => setEditContact(EMPTY_CONTACT(supplierId))}
          style={{ padding: '7px 16px', background: workspace.actionPrimaryBg, color: '#fff', border: 'none', borderRadius: radii.sm, fontSize: fontSizes.sm, fontWeight: 700, cursor: 'pointer' }}
        >
          {t.add}
        </button>
      </div>

      {loading ? (
        <div style={{ color: T3, textAlign: 'center', padding: 40 }}>{c0.loading}</div>
      ) : contacts.length === 0 ? (
        <div style={{ color: T3, textAlign: 'center', padding: 40 }}>{t.empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contacts.map(c => (
            <div key={c.id} style={{ background: '#f8fafc', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: fontSizes.lg, fontWeight: 700, color: NAVY }}>{c.full_name}</span>
                    {c.is_primary && <span style={{ fontSize: fontSizes.xs, fontWeight: 800, color: workspace.accentText, background: GOLD + '18', padding: '2px 7px', borderRadius: 999 }}>{t.primary}</span>}
                    {c.is_decision_maker && <span style={{ fontSize: fontSizes.xs, fontWeight: 700, color: '#7c3aed', background: '#7c3aed18', padding: '2px 7px', borderRadius: 999 }}>{t.decisionMaker}</span>}
                  </div>
                  <div style={{ fontSize: fontSizes.xs, color: T2 }}>{[c.job_title, c.department, c.contact_role].filter(Boolean).join(' · ')}</div>
                  <div style={{ fontSize: fontSizes.xs, color: T3, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {c.mobile && <span>📱 {c.mobile}</span>}
                    {c.whatsapp && <span>💬 WhatsApp: {c.whatsapp}</span>}
                    {c.wechat && <span>{t.fWechat}: {c.wechat}</span>}
                    {c.email && <span>✉ {c.email}</span>}
                  </div>
                  <div style={{ fontSize: fontSizes.xs, color: T3, marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {c.is_commercial_contact && <span>{t.commercial}</span>}
                    {c.is_technical_contact && <span>{t.technical}</span>}
                    {c.is_finance_contact && <span>{t.finance}</span>}
                    {c.is_logistics_contact && <span>{t.logistics}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditContact({ ...c })} style={{ fontSize: fontSizes.xs, color: NAVY, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.edit}</button>
                  {confirmDeleteId === c.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleDelete(c.id!)} style={{ fontSize: fontSizes.xs, color: '#fff', background: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.confirmDelete}</button>
                      <button onClick={() => setConfirmDeleteId(null)} style={{ fontSize: fontSizes.xs, color: T2, background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.cancel}</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(c.id!)} style={{ fontSize: fontSizes.xs, color: '#dc2626', background: 'none', border: `1px solid #fca5a5`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>{c0.delete}</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editContact && (
        <ModalPortal><div style={MODAL_OVERLAY} onClick={e => { if (e.target === e.currentTarget) setEditContact(null); }}>
          <div className={MODAL_PANEL_CLASS} style={{ ...modalPanel(560) }}>
            <div style={{ fontSize: fontSizes.lg, fontWeight: 700, color: NAVY, marginBottom: 20 }}>{editContact.id ? t.modalEdit : t.modalNew}</div>
            <div style={{ ...formGrid(200), gap: 14, marginBottom: 14 }}>
              <F label={t.fName}><input style={INP} value={editContact.full_name ?? ''} onChange={e => setEditContact(v => ({ ...v!, full_name: e.target.value }))} /></F>
              <F label={t.fJobTitle}><input style={INP} value={editContact.job_title ?? ''} onChange={e => setEditContact(v => ({ ...v!, job_title: e.target.value }))} /></F>
              <F label={t.fDepartment}><input style={INP} value={editContact.department ?? ''} onChange={e => setEditContact(v => ({ ...v!, department: e.target.value }))} /></F>
              <F label={t.fRole}><input style={INP} value={editContact.contact_role ?? ''} onChange={e => setEditContact(v => ({ ...v!, contact_role: e.target.value }))} placeholder={t.fRolePlaceholder} /></F>
              <F label={t.fMobile}><input style={INP} value={editContact.mobile ?? ''} onChange={e => setEditContact(v => ({ ...v!, mobile: e.target.value }))} /></F>
              <F label={t.fWhatsapp}><input style={INP} value={editContact.whatsapp ?? ''} onChange={e => setEditContact(v => ({ ...v!, whatsapp: e.target.value }))} /></F>
              <F label={t.fWechat}><input style={INP} value={editContact.wechat ?? ''} onChange={e => setEditContact(v => ({ ...v!, wechat: e.target.value }))} /></F>
              <F label={t.fEmail}><input style={INP} value={editContact.email ?? ''} onChange={e => setEditContact(v => ({ ...v!, email: e.target.value }))} /></F>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              {([['is_primary',t.primary],['is_decision_maker',t.decisionMaker],['is_commercial_contact',t.commercial],['is_technical_contact',t.technical],['is_finance_contact',t.finance],['is_logistics_contact',t.logistics]] as [keyof SupplierContact, string][]).map(([k, l]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: fontSizes.sm, color: NAVY, fontWeight: 600 }}>
                  <input type="checkbox" checked={!!(editContact as any)[k]} onChange={e => setEditContact(v => ({ ...v!, [k]: e.target.checked }))} />
                  {l}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '10px 0', background: workspace.actionPrimaryBg, color: '#fff', border: 'none', borderRadius: radii.sm, fontWeight: 700, cursor: 'pointer' }}>{saving ? c0.saving : c0.save}</button>
              <button onClick={() => setEditContact(null)} style={{ padding: '10px 20px', background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: radii.sm, color: T2, fontWeight: 600, cursor: 'pointer' }}>{c0.cancel}</button>
            </div>
          </div>
        </div></ModalPortal>
      )}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={LBL}>{label}</label>{children}</div>;
}
