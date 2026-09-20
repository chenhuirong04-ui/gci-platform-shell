/**
 * Customer / Project Linking V1 (2026-09-15) — the ONE shared selector for
 * "which real customer (and, where required, which real project) is this
 * business document for" across every sales-side entry point (BOQ, PI,
 * Business Solutions, Finance). Do not fork/copy this per module.
 *
 * Design:
 *   - The CRM (crm_customers + crm_contacts) is the single source of truth. Search is fuzzy over company name, contact name, phone,
 *     WhatsApp and email; each result shows company · contact · phone/email · country.
 *   - Selecting a customer only READS: the returned selection carries the real crm_customers.id plus a name/contact snapshot
 *     (callers store the id as the link and the snapshot for display). No customer data is copied into any other table.
 *   - No match: "+ Create customer «name»" opens a modal (in place, the quotation draft behind it is untouched). It writes the real
 *     crm_customers row (+ crm_contacts row when contact details are given), refuses a same-name duplicate (offers the existing one),
 *     and selects the new customer.
 *   - "Temporary customer": the same create flow with stage 待建档 (existing crm_customers.status field, no new mechanism). The
 *     selector shows 「尚未完成正式客户建档」 and lets the user convert it to a formal customer or link a different existing customer.
 *   - requireProject=true (BOQ/engineering-type work) forces a project pick; Quick Create Project always creates under the selected
 *     customer's id.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Check, Plus, User, Building2, X } from 'lucide-react';
import { useI18n } from '@gci/i18n';
import {
  searchCustomers, listContactsForCustomer, listProjectsForCustomer, quickCreateCustomer, quickCreateProject, markCustomerFormal,
  DuplicateCustomerError, isUnregisteredLead, type CrmProject, type CustomerSearchHit,
} from '../lib/crmProjects';
import type { CrmCustomer, CrmContact } from '../lib/crmSupabase';

export interface CustomerProjectSelection {
  customerId: string | null;
  customerName: string;
  projectId: string | null;
  projectName: string;
  contactName: string;
  phone: string;
  whatsapp: string;
  email: string;
  /** crm_customers.country of the selected customer (display / snapshot only) */
  country?: string;
  /** true while the customer is still at the 待建档 stage (created from a quotation, no formal profile yet) */
  isLead?: boolean;
}

export const emptyCustomerProjectSelection = (): CustomerProjectSelection => ({
  customerId: null,
  customerName: '',
  projectId: null,
  projectName: '',
  contactName: '',
  phone: '',
  whatsapp: '',
  email: '',
  country: '',
  isLead: false,
});

interface CustomerProjectSelectorProps {
  value: CustomerProjectSelection;
  onChange: (next: CustomerProjectSelection) => void;
  /** BOQ/engineering-type work: true (project pick required). Plain PI / product sales: false (default). */
  requireProject?: boolean;
  className?: string;
}

const inputCls = 'w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-[#CBA85C] text-sm font-bold text-gray-700 bg-white min-w-0';
const labelCls = 'text-[10px] font-black text-gray-400 uppercase tracking-widest';

function selectionFrom(c: CrmCustomer, contact: CrmContact | null): CustomerProjectSelection {
  return {
    customerId: c.id,
    customerName: c.customer_name,
    projectId: null,
    projectName: '',
    contactName: contact?.contact_name || '',
    phone: contact?.phone || '',
    whatsapp: contact?.whatsapp || '',
    email: contact?.email || '',
    country: (c.country as string) || '',
    isLead: isUnregisteredLead(c),
  };
}

export function CustomerProjectSelector({ value, onChange, requireProject, className }: CustomerProjectSelectorProps) {
  const { dict } = useI18n();
  const cp = dict.quotation.customerPicker;
  const [query, setQuery] = useState(value.customerName || '');
  const [results, setResults] = useState<CustomerSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [projects, setProjects] = useState<CrmProject[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', country: '', contactName: '', mobile: '', email: '', type: '', source: '' });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [duplicate, setDuplicate] = useState<CrmCustomer | null>(null);
  const [converting, setConverting] = useState(false);

  const [showQuickCreateProject, setShowQuickCreateProject] = useState(false);
  const [qpName, setQpName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchSeq = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Live search, debounced — only when nothing is selected yet or the user is actively retyping.
  useEffect(() => {
    if (value.customerId && query === value.customerName) {
      setResults([]);
      return;
    }
    clearTimeout(searchTimer.current);
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    searchTimer.current = setTimeout(async () => {
      const rows = await searchCustomers(query, 8);
      if (seq !== searchSeq.current) return; // a newer keystroke superseded this search
      setResults(rows);
      setSearching(false);
    }, 250);
    return () => clearTimeout(searchTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Load contacts + projects whenever the selected customer changes.
  useEffect(() => {
    if (!value.customerId) {
      setContacts([]);
      setProjects([]);
      return;
    }
    listContactsForCustomer(value.customerId).then(setContacts);
    listProjectsForCustomer(value.customerId).then(setProjects);
  }, [value.customerId]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const pick = (c: CrmCustomer, contact: CrmContact | null) => {
    setQuery(c.customer_name);
    setDropdownOpen(false);
    setShowModal(false);
    setDuplicate(null);
    onChange(selectionFrom(c, contact));
  };

  // If the contact list of a freshly selected customer arrives later than the selection, fill the primary contact once (never clobbers edits).
  useEffect(() => {
    if (!value.customerId || contacts.length === 0) return;
    if (value.contactName || value.phone || value.whatsapp || value.email) return;
    const primary = contacts.find(c => c.is_primary) || contacts[0];
    onChange({ ...value, contactName: primary.contact_name || '', phone: primary.phone || '', whatsapp: primary.whatsapp || '', email: primary.email || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts]);

  const selectProject = (p: CrmProject | null) => {
    onChange({ ...value, projectId: p?.id || null, projectName: p?.project_name || '' });
  };

  const clearCustomer = () => {
    setQuery('');
    setResults([]);
    setContacts([]);
    setProjects([]);
    onChange(emptyCustomerProjectSelection());
  };

  const openModal = () => {
    setForm({ name: query.trim(), country: '', contactName: '', mobile: '', email: '', type: '', source: '' });
    setFormError('');
    setDuplicate(null);
    setDropdownOpen(false);
    setShowModal(true);
  };

  const submitCreate = async (isLead: boolean) => {
    if (!form.name.trim()) { setFormError(cp.required); return; }
    setCreating(true);
    setFormError('');
    setDuplicate(null);
    try {
      const { customer, contact } = await quickCreateCustomer({
        customerName: form.name,
        country: form.country || undefined,
        customerPrimaryType: form.type || null,
        source: form.source || undefined,
        isLead,
        contactName: form.contactName || undefined,
        phone: form.mobile || undefined,
        email: form.email || undefined,
      });
      pick(customer, contact);
    } catch (e: any) {
      if (e instanceof DuplicateCustomerError) setDuplicate(e.existing);
      else setFormError(e?.message || cp.createFailed);
    } finally {
      setCreating(false);
    }
  };

  const useDuplicate = async () => {
    if (!duplicate) return;
    const list = await listContactsForCustomer(duplicate.id);
    pick(duplicate, list.find(c => c.is_primary) || list[0] || null);
  };

  const makeFormal = async () => {
    if (!value.customerId) return;
    setConverting(true);
    try {
      await markCustomerFormal(value.customerId);
      onChange({ ...value, isLead: false });
    } catch (e: any) {
      alert(`⚠️ ${e?.message || cp.createFailed}`);
    } finally {
      setConverting(false);
    }
  };

  const submitQuickCreateProject = async () => {
    if (!value.customerId) return;
    if (!qpName.trim()) return;
    setCreatingProject(true);
    try {
      const project = await quickCreateProject(value.customerId, qpName.trim());
      setProjects(prev => [project, ...prev]);
      setShowQuickCreateProject(false);
      setQpName('');
      selectProject(project);
    } catch (e: any) {
      alert(`⚠️ ${e?.message || ''}`);
    } finally {
      setCreatingProject(false);
    }
  };

  const noResultsForQuery = !searching && query.trim().length > 0 && results.length === 0 && !value.customerId;
  const showDropdown = dropdownOpen && !value.customerId && query.trim().length > 0 && (searching || results.length > 0 || noResultsForQuery);
  const detail = (c: CrmCustomer, contact: CrmContact | null) =>
    [contact?.contact_name, contact?.phone || contact?.whatsapp || contact?.email, c.country].filter(Boolean).join(' · ');

  return (
    <div className={className}>
      <div ref={wrapRef} className="relative space-y-1.5">
        <label className={`${labelCls} flex items-center gap-1.5`}>
          <Building2 className="w-3 h-3" /> {cp.label}
        </label>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
          <input
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setDropdownOpen(true);
              // editing the text of an already selected customer un-selects it but keeps what the user is typing
              if (value.customerId) { setContacts([]); setProjects([]); onChange(emptyCustomerProjectSelection()); }
            }}
            onFocus={() => setDropdownOpen(true)}
            placeholder={cp.searchPlaceholder}
            aria-label={cp.label}
            className="w-full pl-10 pr-16 p-3.5 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700 min-w-0"
          />
          {value.customerId && (
            <>
              <Check className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6FBF8E]" />
              <button type="button" onClick={clearCustomer} aria-label={cp.changeCustomer} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-gray-300 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {showDropdown && (
          <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl">
            {searching && results.length === 0 && <div className="px-4 py-3 text-xs text-gray-400">{cp.searching}</div>}
            {results.map(({ customer: c, contact }) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c, contact)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-start gap-2.5"
              >
                <User className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-1" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-gray-800 text-sm truncate">{c.customer_name}</span>
                    {isUnregisteredLead(c) && <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">{cp.leadBadge}</span>}
                  </span>
                  <span className="block text-[11px] text-gray-400 truncate">{detail(c, contact) || '—'}</span>
                </span>
              </button>
            ))}
            {noResultsForQuery && (
              <>
                <div className="px-4 py-2 text-[11px] text-gray-400">{cp.noMatch}</div>
                <button
                  type="button"
                  onClick={openModal}
                  className="w-full text-left px-4 py-3 hover:bg-[#CBA85C]/5 text-[#B8960C] font-black text-xs flex items-center gap-2 border-t border-gray-100"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{cp.createNew.replace('{name}', query.trim())}</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {value.customerId && (
        <div className="mt-2 px-1 text-[11px] text-gray-500 space-y-1">
          <p>
            {cp.contactLine}：{value.contactName || '—'} · {value.phone || value.whatsapp || value.email || cp.noPhone}
            {value.country ? ` · ${value.country}` : ''}
          </p>
          {value.isLead && (
            <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
              <span className="text-[11px] font-black text-amber-700">⚠ {cp.leadBadge}</span>
              <span className="flex-1" />
              <button type="button" disabled={converting} onClick={makeFormal} className="px-2.5 py-1 rounded-md bg-[#080D1E] text-white text-[10px] font-black uppercase tracking-wide disabled:opacity-50">{cp.makeFormal}</button>
              <button type="button" onClick={clearCustomer} className="px-2.5 py-1 rounded-md bg-white border border-gray-300 text-gray-600 text-[10px] font-black uppercase tracking-wide">{cp.rebind}</button>
            </div>
          )}
        </div>
      )}

      {value.customerId && (
        <div className="mt-4 space-y-1.5">
          <label className={`${labelCls} flex items-center gap-1.5`}>
            {cp.project} {requireProject && <span className="text-[#CBA85C]">*</span>}
          </label>
          {projects.length === 0 && !showQuickCreateProject && (
            <p className="text-[11px] text-gray-400 px-1">{cp.noProjects}</p>
          )}
          {projects.length > 0 && (
            <select
              value={value.projectId || ''}
              onChange={e => selectProject(projects.find(p => p.id === e.target.value) || null)}
              className="w-full p-3.5 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700 bg-white"
            >
              <option value="">{cp.selectProject}</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
          )}
          {!showQuickCreateProject ? (
            <button type="button" onClick={() => setShowQuickCreateProject(true)} className="text-[11px] font-black text-[#CBA85C] hover:text-[#B8960C] flex items-center gap-1 px-1 pt-1">
              <Plus className="w-3 h-3" /> {cp.newProject}
            </button>
          ) : (
            <div className="flex gap-2 pt-1">
              <input value={qpName} onChange={e => setQpName(e.target.value)} placeholder={cp.projectName} className={`${inputCls} flex-1`} />
              <button type="button" disabled={creatingProject} onClick={submitQuickCreateProject} className="px-4 py-2 rounded-lg bg-[#080D1E] text-white text-[10px] font-black uppercase tracking-wide disabled:opacity-50">
                {creatingProject ? cp.creating : cp.createShort}
              </button>
              <button type="button" onClick={() => { setShowQuickCreateProject(false); setQpName(''); }} className="px-3 py-2 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {requireProject && !value.projectId && (
            <p className="text-[11px] text-[#E0846A] font-bold px-1 pt-1">⚠️ {cp.projectRequired}</p>
          )}
        </div>
      )}

      {showModal && createPortal(
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={cp.modalTitle}>
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => !creating && setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-gray-800">{cp.modalTitle}</h3>
              <button type="button" onClick={() => !creating && setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-700" aria-label={cp.cancel}><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-1">
              <label className={labelCls}>{cp.name} <span className="text-[#CBA85C]">*</span></label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} autoFocus />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><label className={labelCls}>{cp.country}</label><input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className={inputCls} /></div>
              <div className="space-y-1"><label className={labelCls}>{cp.contactName}</label><input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} className={inputCls} /></div>
              <div className="space-y-1"><label className={labelCls}>{cp.mobile}</label><input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} className={inputCls} inputMode="tel" /></div>
              <div className="space-y-1"><label className={labelCls}>{cp.email}</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} inputMode="email" /></div>
              <div className="space-y-1">
                <label className={labelCls}>{cp.customerType}</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inputCls}>
                  <option value="">{cp.typeNone}</option>
                  <option value="project">{cp.typeProject}</option>
                  <option value="trade">{cp.typeTrade}</option>
                  <option value="services">{cp.typeServices}</option>
                </select>
              </div>
              <div className="space-y-1"><label className={labelCls}>{cp.source}</label><input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder={cp.sourcePlaceholder} className={inputCls} /></div>
            </div>

            {duplicate && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-amber-800 flex-1 min-w-0">{cp.dupTitle.replace('{name}', duplicate.customer_name)}</span>
                <button type="button" onClick={useDuplicate} className="px-3 py-1.5 rounded-md bg-[#080D1E] text-white text-[10px] font-black uppercase tracking-wide">{cp.dupUse}</button>
              </div>
            )}
            {formError && <p className="text-xs font-bold text-[#E0846A]">{formError}</p>}

            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" disabled={creating} onClick={() => submitCreate(false)} className="px-4 py-2.5 rounded-lg bg-[#080D1E] text-white text-[11px] font-black uppercase tracking-wide disabled:opacity-50">
                {creating ? cp.creating : cp.create}
              </button>
              <button type="button" disabled={creating} onClick={() => submitCreate(true)} className="px-4 py-2.5 rounded-lg bg-white border border-[#CBA85C] text-[#8A6D1F] text-[11px] font-black tracking-wide disabled:opacity-50">
                {cp.createLead}
              </button>
              <button type="button" disabled={creating} onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-lg bg-gray-100 text-gray-500 text-[11px] font-black uppercase tracking-wide">
                {cp.cancel}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
