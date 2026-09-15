/**
 * Customer / Project Linking V1 (2026-09-15) — the ONE shared selector for
 * "which real customer (and, where required, which real project) is this
 * business document for" across every sales-side entry point (BOQ, PI,
 * Business Solutions). Do not fork/copy this per module — see chat report
 * for why (the whole point of this round was stopping each module from
 * hand-rolling its own free-text customer/project field).
 *
 * Design:
 *   - Search-first. No large blank form up front — type a few characters,
 *     pick from real crm_customers rows.
 *   - Selecting a customer loads its crm_contacts (auto-fills phone/
 *     WhatsApp/email/contact name into the returned selection) and its
 *     crm_projects.
 *   - requireProject=true (BOQ/engineering-type work) forces a project pick
 *     before the selection counts as complete; false (plain PI/product
 *     sales) leaves project entirely optional; Business Solutions passes
 *     whichever its own flow needs.
 *   - Quick Create Customer only surfaces when a search for that exact
 *     typed name found nothing — never offered as a first option ahead of
 *     searching, per the "must search existing first" rule.
 *   - Quick Create Project only surfaces once a customer is already
 *     selected, and always creates the new project under that customer's
 *     id — never a customer-less project.
 *   - Returned value always carries both the ids (the real relational
 *     link) AND a name/contact snapshot (for display + historical
 *     document text) — callers store both, per the "snapshot never
 *     replaces the id" rule.
 */
import { useState, useEffect, useRef } from 'react';
import { Search, Check, Plus, User, Building2, X } from 'lucide-react';
import { searchCustomers, listContactsForCustomer, listProjectsForCustomer, quickCreateCustomer, quickCreateProject, type CrmProject } from '../lib/crmProjects';
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
});

interface CustomerProjectSelectorProps {
  value: CustomerProjectSelection;
  onChange: (next: CustomerProjectSelection) => void;
  /** BOQ/engineering-type work: true (project pick required). Plain PI /
   * product sales: false (default). Business Solutions: pass whichever the
   * calling flow needs. */
  requireProject?: boolean;
  className?: string;
}

export function CustomerProjectSelector({ value, onChange, requireProject, className }: CustomerProjectSelectorProps) {
  const [query, setQuery] = useState(value.customerName || '');
  const [results, setResults] = useState<CrmCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [projects, setProjects] = useState<CrmProject[]>([]);

  const [showQuickCreateCustomer, setShowQuickCreateCustomer] = useState(false);
  const [qcContactName, setQcContactName] = useState('');
  const [qcPhone, setQcPhone] = useState('');
  const [qcWhatsapp, setQcWhatsapp] = useState('');
  const [qcEmail, setQcEmail] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const [showQuickCreateProject, setShowQuickCreateProject] = useState(false);
  const [qpName, setQpName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Live search, debounced — only when nothing is selected yet or the user
  // is actively retyping (query no longer matches the selected customer).
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
    searchTimer.current = setTimeout(async () => {
      const rows = await searchCustomers(query, 10);
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

  const selectCustomer = (c: CrmCustomer) => {
    setQuery(c.customer_name);
    setDropdownOpen(false);
    setShowQuickCreateCustomer(false);
    onChange({
      customerId: c.id,
      customerName: c.customer_name,
      projectId: null,
      projectName: '',
      contactName: '',
      phone: '',
      whatsapp: '',
      email: '',
    });
  };

  // Once contacts load for the newly selected customer, auto-fill the
  // primary (or first) one into the selection — separate effect so it
  // fires after selectCustomer()'s onChange has already landed.
  useEffect(() => {
    if (!value.customerId || contacts.length === 0) return;
    if (value.contactName || value.phone || value.whatsapp || value.email) return; // don't clobber a manual edit
    const primary = contacts.find(c => c.is_primary) || contacts[0];
    onChange({
      ...value,
      contactName: primary.contact_name || '',
      phone: primary.phone || '',
      whatsapp: primary.whatsapp || '',
      email: primary.email || '',
    });
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

  const submitQuickCreateCustomer = async () => {
    if (!query.trim()) { alert('⚠️ 请先输入客户名称。'); return; }
    setCreatingCustomer(true);
    try {
      const { customer, contact } = await quickCreateCustomer({
        customerName: query.trim(),
        contactName: qcContactName || undefined,
        phone: qcPhone || undefined,
        whatsapp: qcWhatsapp || undefined,
        email: qcEmail || undefined,
      });
      setShowQuickCreateCustomer(false);
      setQcContactName(''); setQcPhone(''); setQcWhatsapp(''); setQcEmail('');
      setQuery(customer.customer_name);
      setDropdownOpen(false);
      onChange({
        customerId: customer.id,
        customerName: customer.customer_name,
        projectId: null,
        projectName: '',
        contactName: contact?.contact_name || '',
        phone: contact?.phone || '',
        whatsapp: contact?.whatsapp || '',
        email: contact?.email || '',
      });
    } catch (e: any) {
      alert(`⚠️ ${e?.message || '创建客户失败，请重试。'}`);
    } finally {
      setCreatingCustomer(false);
    }
  };

  const submitQuickCreateProject = async () => {
    if (!value.customerId) return;
    if (!qpName.trim()) { alert('⚠️ 请输入项目名称。'); return; }
    setCreatingProject(true);
    try {
      const project = await quickCreateProject(value.customerId, qpName.trim());
      setProjects(prev => [project, ...prev]);
      setShowQuickCreateProject(false);
      setQpName('');
      selectProject(project);
    } catch (e: any) {
      alert(`⚠️ ${e?.message || '创建项目失败，请重试。'}`);
    } finally {
      setCreatingProject(false);
    }
  };

  const noResultsForQuery = !searching && query.trim().length > 0 && results.length === 0 && !value.customerId;

  return (
    <div className={className}>
      <div ref={wrapRef} className="relative space-y-1.5">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
          <Building2 className="w-3 h-3" /> Customer / 客户
        </label>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setDropdownOpen(true); if (value.customerId) clearCustomer(); }}
            onFocus={() => setDropdownOpen(true)}
            placeholder="搜索客户名称…"
            className="w-full pl-11 pr-10 p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700"
          />
          {value.customerId && (
            <button type="button" onClick={clearCustomer} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-300 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          )}
          {value.customerId && (
            <Check className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6FBF8E]" />
          )}
        </div>

        {dropdownOpen && !value.customerId && (results.length > 0 || noResultsForQuery) && (
          <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl">
            {results.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCustomer(c)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center gap-2"
              >
                <User className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                <span className="font-bold text-gray-700 text-sm">{c.customer_name}</span>
                {c.business_type && <span className="text-[10px] text-gray-400 ml-auto">{c.business_type}</span>}
              </button>
            ))}
            {noResultsForQuery && !showQuickCreateCustomer && (
              <button
                type="button"
                onClick={() => setShowQuickCreateCustomer(true)}
                className="w-full text-left px-4 py-3 hover:bg-[#CBA85C]/5 text-[#CBA85C] font-black text-xs flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" /> 未找到"{query}" — 新建客户
              </button>
            )}
          </div>
        )}
      </div>

      {showQuickCreateCustomer && !value.customerId && (
        <div className="mt-3 p-4 bg-gray-50 rounded-xl space-y-3">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Quick Create Customer — {query}</p>
          <div className="grid grid-cols-2 gap-3">
            <input value={qcContactName} onChange={e => setQcContactName(e.target.value)} placeholder="联系人（可选）" className="p-3 border border-gray-300 rounded-lg outline-none focus:border-[#CBA85C] text-sm font-bold" />
            <input value={qcPhone} onChange={e => setQcPhone(e.target.value)} placeholder="电话（可选）" className="p-3 border border-gray-300 rounded-lg outline-none focus:border-[#CBA85C] text-sm font-bold" />
            <input value={qcWhatsapp} onChange={e => setQcWhatsapp(e.target.value)} placeholder="WhatsApp（可选）" className="p-3 border border-gray-300 rounded-lg outline-none focus:border-[#CBA85C] text-sm font-bold" />
            <input value={qcEmail} onChange={e => setQcEmail(e.target.value)} placeholder="邮箱（可选）" className="p-3 border border-gray-300 rounded-lg outline-none focus:border-[#CBA85C] text-sm font-bold" />
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={creatingCustomer} onClick={submitQuickCreateCustomer} className="px-4 py-2 rounded-lg bg-[#080D1E] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#CBA85C] disabled:opacity-40">
              {creatingCustomer ? '创建中…' : '创建客户'}
            </button>
            <button type="button" onClick={() => setShowQuickCreateCustomer(false)} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-200">取消</button>
          </div>
        </div>
      )}

      {value.customerId && (contacts.length > 0) && (
        <p className="mt-2 text-[11px] text-gray-400 px-1">
          联系人：{value.contactName || '—'} · {value.phone || value.whatsapp || '无电话'}
        </p>
      )}

      {value.customerId && (
        <div className="mt-4 space-y-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
            Project / 项目 {requireProject && <span className="text-[#CBA85C]">*</span>}
          </label>
          {projects.length === 0 && !showQuickCreateProject && (
            <p className="text-[11px] text-gray-400 px-1">该客户还没有项目。</p>
          )}
          {projects.length > 0 && (
            <select
              value={value.projectId || ''}
              onChange={e => selectProject(projects.find(p => p.id === e.target.value) || null)}
              className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700"
            >
              <option value="">请选择项目…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
          )}
          {!showQuickCreateProject ? (
            <button
              type="button"
              onClick={() => setShowQuickCreateProject(true)}
              className="text-[11px] font-black text-[#CBA85C] hover:text-[#B8960C] flex items-center gap-1 px-1 pt-1"
            >
              <Plus className="w-3 h-3" /> 新建项目
            </button>
          ) : (
            <div className="flex gap-2 pt-1">
              <input
                value={qpName}
                onChange={e => setQpName(e.target.value)}
                placeholder="项目名称"
                className="flex-1 p-3 border border-gray-300 rounded-lg outline-none focus:border-[#CBA85C] text-sm font-bold"
              />
              <button type="button" disabled={creatingProject} onClick={submitQuickCreateProject} className="px-4 py-2 rounded-lg bg-[#080D1E] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#CBA85C] disabled:opacity-40">
                {creatingProject ? '创建中…' : '创建'}
              </button>
              <button type="button" onClick={() => { setShowQuickCreateProject(false); setQpName(''); }} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-200">取消</button>
            </div>
          )}
          {requireProject && !value.projectId && (
            <p className="text-[11px] text-[#E0846A] font-bold px-1 pt-1">⚠️ 该业务类型必须选择项目。</p>
          )}
        </div>
      )}
    </div>
  );
}
