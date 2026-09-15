/**
 * Quotation Center Master-Data Unification (2026-09-15) — the shared
 * "which real supplier is this for" selector for Supplier Quote / Package
 * Quote Step 1, mirroring <CustomerProjectSelector>'s exact design so the
 * whole Quotation Center has one consistent pattern for "pick a real
 * master-data record, never hand-type a name":
 *   - Search-first. Type a few characters, pick from real `suppliers` rows.
 *   - Selecting a supplier loads its supplier_contacts and auto-fills the
 *     primary (or first) one into the returned selection.
 *   - Quick Create Supplier only surfaces when a search for that exact
 *     typed name found nothing — never offered ahead of searching.
 *   - Returned value always carries both the id (the real relational link)
 *     AND a name/contact snapshot — callers store both, snapshot never
 *     replaces the id.
 */
import { useState, useEffect, useRef } from 'react';
import { Search, Check, Plus, Building2, X } from 'lucide-react';
import { searchSuppliers, listContacts, createSupplier, createContact, generateShortCode } from '../../../../modules/suppliers/lib/suppliersCloud';
import type { Supplier, SupplierContact } from '../../../../modules/suppliers/types';

export interface SupplierSelection {
  supplierId: string | null;
  supplierName: string;
  contactName: string;
  phone: string;
  whatsapp: string;
  email: string;
}

export const emptySupplierSelection = (): SupplierSelection => ({
  supplierId: null,
  supplierName: '',
  contactName: '',
  phone: '',
  whatsapp: '',
  email: '',
});

interface SupplierSelectorProps {
  value: SupplierSelection;
  onChange: (next: SupplierSelection) => void;
  className?: string;
}

export function SupplierSelector({ value, onChange, className }: SupplierSelectorProps) {
  const [query, setQuery] = useState(value.supplierName || '');
  const [results, setResults] = useState<Supplier[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [contacts, setContacts] = useState<SupplierContact[]>([]);

  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [qcContactName, setQcContactName] = useState('');
  const [qcPhone, setQcPhone] = useState('');
  const [qcWhatsapp, setQcWhatsapp] = useState('');
  const [qcEmail, setQcEmail] = useState('');
  const [creating, setCreating] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.supplierId && query === value.supplierName) {
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
      const rows = await searchSuppliers(query, 10);
      setResults(rows);
      setSearching(false);
    }, 250);
    return () => clearTimeout(searchTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (!value.supplierId) {
      setContacts([]);
      return;
    }
    listContacts(value.supplierId).then(setContacts);
  }, [value.supplierId]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const selectSupplier = (s: Supplier) => {
    setQuery(s.supplier_name_display);
    setDropdownOpen(false);
    setShowQuickCreate(false);
    onChange({
      supplierId: s.id || null,
      supplierName: s.supplier_name_display,
      contactName: '',
      phone: '',
      whatsapp: '',
      email: '',
    });
  };

  // Once contacts load for the newly selected supplier, auto-fill the
  // primary (or first) one — separate effect so it fires after
  // selectSupplier()'s onChange has already landed.
  useEffect(() => {
    if (!value.supplierId || contacts.length === 0) return;
    if (value.contactName || value.phone || value.whatsapp || value.email) return; // don't clobber a manual edit
    const primary = contacts.find(c => c.is_primary) || contacts[0];
    onChange({
      ...value,
      contactName: primary.full_name || '',
      phone: primary.mobile || primary.phone || '',
      whatsapp: primary.whatsapp || '',
      email: primary.email || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts]);

  const clearSupplier = () => {
    setQuery('');
    setResults([]);
    setContacts([]);
    onChange(emptySupplierSelection());
  };

  const submitQuickCreate = async () => {
    if (!query.trim()) { alert('⚠️ 请先输入供应商名称。'); return; }
    setCreating(true);
    try {
      const shortCode = await generateShortCode();
      const created = await createSupplier({
        supplier_name_display: query.trim(),
        short_code: shortCode,
        status: 'active',
      });
      if (!created) throw new Error('创建供应商失败');
      setShowQuickCreate(false);
      setQuery(created.supplier_name_display);
      setDropdownOpen(false);
      const hasContactInfo = !!(qcContactName || qcPhone || qcWhatsapp || qcEmail);
      if (hasContactInfo && created.id) {
        await createContact({
          supplier_id: created.id,
          full_name: qcContactName || 'Contact',
          mobile: qcPhone || undefined,
          whatsapp: qcWhatsapp || undefined,
          email: qcEmail || undefined,
          is_primary: true,
        });
      }
      setQcContactName(''); setQcPhone(''); setQcWhatsapp(''); setQcEmail('');
      onChange({
        supplierId: created.id || null,
        supplierName: created.supplier_name_display,
        contactName: qcContactName,
        phone: qcPhone,
        whatsapp: qcWhatsapp,
        email: qcEmail,
      });
    } catch (e: any) {
      alert(`⚠️ ${e?.message || '创建供应商失败，请重试。'}`);
    } finally {
      setCreating(false);
    }
  };

  const noResultsForQuery = !searching && query.trim().length > 0 && results.length === 0 && !value.supplierId;

  return (
    <div className={className}>
      <div ref={wrapRef} className="relative space-y-1.5">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
          <Building2 className="w-3 h-3" /> Supplier / 供应商
        </label>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setDropdownOpen(true); if (value.supplierId) clearSupplier(); }}
            onFocus={() => setDropdownOpen(true)}
            placeholder="搜索供应商名称…"
            className="w-full pl-11 pr-10 p-4 border border-gray-300 rounded-xl outline-none focus:border-[#CBA85C] font-bold text-gray-700"
          />
          {value.supplierId && (
            <button type="button" onClick={clearSupplier} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-300 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          )}
          {value.supplierId && (
            <Check className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6FBF8E]" />
          )}
        </div>

        {dropdownOpen && !value.supplierId && (results.length > 0 || noResultsForQuery) && (
          <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl">
            {results.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectSupplier(s)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center gap-2"
              >
                <Building2 className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                <span className="font-bold text-gray-700 text-sm">{s.supplier_name_display}</span>
                {s.country && <span className="text-[10px] text-gray-400 ml-auto">{s.country}</span>}
              </button>
            ))}
            {noResultsForQuery && !showQuickCreate && (
              <button
                type="button"
                onClick={() => setShowQuickCreate(true)}
                className="w-full text-left px-4 py-3 hover:bg-[#CBA85C]/5 text-[#CBA85C] font-black text-xs flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" /> 未找到"{query}" — 新建供应商
              </button>
            )}
          </div>
        )}
      </div>

      {showQuickCreate && !value.supplierId && (
        <div className="mt-3 p-4 bg-gray-50 rounded-xl space-y-3">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Quick Create Supplier — {query}</p>
          <div className="grid grid-cols-2 gap-3">
            <input value={qcContactName} onChange={e => setQcContactName(e.target.value)} placeholder="联系人（可选）" className="p-3 border border-gray-300 rounded-lg outline-none focus:border-[#CBA85C] text-sm font-bold" />
            <input value={qcPhone} onChange={e => setQcPhone(e.target.value)} placeholder="电话（可选）" className="p-3 border border-gray-300 rounded-lg outline-none focus:border-[#CBA85C] text-sm font-bold" />
            <input value={qcWhatsapp} onChange={e => setQcWhatsapp(e.target.value)} placeholder="WhatsApp（可选）" className="p-3 border border-gray-300 rounded-lg outline-none focus:border-[#CBA85C] text-sm font-bold" />
            <input value={qcEmail} onChange={e => setQcEmail(e.target.value)} placeholder="邮箱（可选）" className="p-3 border border-gray-300 rounded-lg outline-none focus:border-[#CBA85C] text-sm font-bold" />
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={creating} onClick={submitQuickCreate} className="px-4 py-2 rounded-lg bg-[#080D1E] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#CBA85C] disabled:opacity-40">
              {creating ? '创建中…' : '创建供应商'}
            </button>
            <button type="button" onClick={() => setShowQuickCreate(false)} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-200">取消</button>
          </div>
        </div>
      )}

      {value.supplierId && (contacts.length > 0) && (
        <p className="mt-2 text-[11px] text-gray-400 px-1">
          联系人：{value.contactName || '—'} · {value.phone || value.whatsapp || '无电话'}
        </p>
      )}
    </div>
  );
}
