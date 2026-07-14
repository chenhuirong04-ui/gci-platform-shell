import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ServiceCatalogItem, ServiceCategory, BSLang, BillingType } from '../types';
import { useT } from '../translations';

interface Props {
  lang: BSLang;
  categories: ServiceCategory[];
  items: ServiceCatalogItem[];
  loading: boolean;
  onSaveCategory: (cat: ServiceCategory) => Promise<void>;
  onSaveItem: (item: ServiceCatalogItem) => Promise<void>;
  onUpdateItem: (id: string, patch: Partial<ServiceCatalogItem>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
}

const BILLING_TYPES: BillingType[] = ['fixed','monthly','quarterly','yearly','per_unit','per_shipment','percentage','commission','custom'];

const EMPTY_ITEM: Omit<ServiceCatalogItem, 'id'> = {
  category_id: '',
  name_cn: '',
  name_en: '',
  default_unit: '项',
  default_billing_type: 'fixed',
  sort_order: 0,
  active: true,
  description_zh: '',
  description_en: '',
  one_time_fee: 0,
  monthly_fee: 0,
  annual_fee: 0,
  default_quantity: 1,
  default_months: 1,
  default_timeline: '',
  allow_price_edit: false,
};

export function ServiceCatalogManager({ lang, categories, items, loading, onSaveCategory, onSaveItem, onUpdateItem, onDeleteItem }: Props) {
  const t = useT(lang);
  const isZh = lang === 'zh';
  const [activeOnly, setActiveOnly] = useState(false);
  const [editItem, setEditItem] = useState<Partial<ServiceCatalogItem> | null>(null);
  const [editCatMode, setEditCatMode] = useState(false);
  const [newCat, setNewCat] = useState({ name_cn: '', name_en: '', sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const shownItems = activeOnly ? items.filter(it => it.active !== false) : items;

  const inp = 'border border-[#cbd5e1] rounded-lg px-3 py-[10px] text-[15px] text-[#0f172a] w-full focus:outline-none focus:border-[#C9A84C] bg-white';

  const handleSaveItem = async () => {
    if (!editItem?.name_cn && !editItem?.name_en) return;
    setSaving(true);
    try { await onSaveItem(editItem as ServiceCatalogItem); setEditItem(null); }
    finally { setSaving(false); }
  };

  const handleSaveCat = async () => {
    if (!newCat.name_cn && !newCat.name_en) return;
    setSaving(true);
    try { await onSaveCategory(newCat as ServiceCategory); setEditCatMode(false); setNewCat({ name_cn: '', name_en: '', sort_order: 0 }); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Toolbar */}
      <div className="flex items-center gap-3 p-3 border-b border-gray-100 flex-shrink-0">
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />
          {t.labels.activeOnly}
        </label>
        <div className="flex-1" />
        <button onClick={() => setEditCatMode(true)} className="text-xs border border-gray-200 rounded px-2 py-1 hover:bg-gray-50">
          + {t.buttons.addCategory}
        </button>
        <button
          onClick={() => setEditItem({ ...EMPTY_ITEM, category_id: categories[0]?.id || '' })}
          className="text-xs bg-[#0c1b3a] text-white rounded px-2 py-1 hover:bg-[#1a3060]"
        >
          + {t.buttons.addService2}
        </button>
      </div>

      {/* Add category inline */}
      {editCatMode && (
        <div className="p-3 border-b border-blue-100 bg-blue-50 space-y-2">
          <div className="text-xs font-semibold text-blue-700">{t.buttons.addCategory}</div>
          <div className="grid grid-cols-2 gap-2">
            <input className={inp} placeholder="中文名称" value={newCat.name_cn} onChange={e => setNewCat(c => ({ ...c, name_cn: e.target.value }))} />
            <input className={inp} placeholder="English Name" value={newCat.name_en} onChange={e => setNewCat(c => ({ ...c, name_en: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveCat} disabled={saving} className="bg-[#0c1b3a] text-white rounded px-3 py-1 text-xs">{t.buttons.save}</button>
            <button onClick={() => setEditCatMode(false)} className="border border-gray-200 rounded px-3 py-1 text-xs">{t.buttons.cancel}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">{t.labels.loading}</div>
      ) : (
        <div className="flex-1 overflow-auto">
          {categories.map(cat => {
            const catItems = shownItems.filter(it => it.category_id === cat.id);
            return (
              <div key={cat.id} className="border-b border-gray-100">
                <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-[#0c1b3a] uppercase tracking-wide">
                  {isZh ? cat.name_cn : cat.name_en}
                </div>
                {catItems.length === 0 && (
                  <div className="px-4 py-2 text-xs text-gray-400">{t.empty.noServices}</div>
                )}
                {catItems.map(it => (
                  <div key={it.id} className={`flex items-center gap-2 px-4 py-2 hover:bg-gray-50 ${it.active === false ? 'opacity-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800">{isZh ? it.name_cn : it.name_en}</div>
                      {(isZh ? it.description_zh : it.description_en) && (
                        <div className="text-xs text-gray-400 truncate">{isZh ? it.description_zh : it.description_en}</div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{t.billingType[it.default_billing_type] || it.default_billing_type}</span>
                    <button onClick={() => setEditItem({ ...it })} className="text-xs text-blue-600 hover:underline px-1">{t.buttons.editService}</button>
                    <button
                      onClick={() => {
                        const { id, ...rest } = it;
                        setEditItem({ ...rest, name_cn: rest.name_cn + '（副本）', name_en: rest.name_en + ' (Copy)', sort_order: (rest.sort_order || 0) + 1 });
                      }}
                      className="text-xs text-gray-500 hover:underline px-1"
                    >复制</button>
                    <button
                      onClick={() => onUpdateItem(it.id!, { active: !it.active })}
                      className="text-xs text-gray-400 hover:underline px-1"
                    >
                      {it.active !== false ? t.buttons.disableService : t.buttons.enableService}
                    </button>
                    {confirmDeleteId === it.id ? (
                      <div className="flex gap-1">
                        <button onClick={async () => { await onDeleteItem(it.id!); setConfirmDeleteId(null); }} className="text-xs text-red-600 font-medium">{t.buttons.confirmDelete}</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-400">{t.buttons.cancel}</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(it.id!)} className="text-xs text-red-400 hover:underline px-1">{t.buttons.deleteService}</button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit item modal — portal to document.body to escape transformed ancestor */}
      {editItem && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onMouseDown={e => { if (e.target === e.currentTarget) setEditItem(null); }}>
          <div className="bg-white rounded-lg shadow-xl w-[540px] max-h-[85vh] overflow-auto p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-[#0c1b3a]">{editItem.id ? t.buttons.editService : t.buttons.addService2}</div>
              <button onClick={() => setEditItem(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[13px] text-[#334155] font-semibold mb-1.5">中文名称 *</div>
                <input className={inp} value={editItem.name_cn || ''} onChange={e => setEditItem(v => ({ ...v!, name_cn: e.target.value }))} />
              </div>
              <div>
                <div className="text-[13px] text-[#334155] font-semibold mb-1.5">English Name *</div>
                <input className={inp} value={editItem.name_en || ''} onChange={e => setEditItem(v => ({ ...v!, name_en: e.target.value }))} />
              </div>
            </div>

            <div>
              <div className="text-[13px] text-[#334155] font-semibold mb-1.5">{t.fields.description} (中文)</div>
              <textarea className={inp + ' resize-none'} rows={2} value={editItem.description_zh || ''} onChange={e => setEditItem(v => ({ ...v!, description_zh: e.target.value }))} />
            </div>
            <div>
              <div className="text-[13px] text-[#334155] font-semibold mb-1.5">{t.fields.description} (EN)</div>
              <textarea className={inp + ' resize-none'} rows={2} value={editItem.description_en || ''} onChange={e => setEditItem(v => ({ ...v!, description_en: e.target.value }))} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[13px] text-[#334155] font-semibold mb-1.5">{t.fields.oneTimeFee}</div>
                <input className={inp} type="number" min={0} value={editItem.one_time_fee || ''} onChange={e => setEditItem(v => ({ ...v!, one_time_fee: Number(e.target.value) }))} />
              </div>
              <div>
                <div className="text-[13px] text-[#334155] font-semibold mb-1.5">{t.fields.monthlyFee}</div>
                <input className={inp} type="number" min={0} value={editItem.monthly_fee || ''} onChange={e => setEditItem(v => ({ ...v!, monthly_fee: Number(e.target.value) }))} />
              </div>
              <div>
                <div className="text-[13px] text-[#334155] font-semibold mb-1.5">{t.fields.annualFee}</div>
                <input className={inp} type="number" min={0} value={editItem.annual_fee || ''} onChange={e => setEditItem(v => ({ ...v!, annual_fee: Number(e.target.value) }))} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[13px] text-[#334155] font-semibold mb-1.5">Billing Type</div>
                <select className={inp} value={editItem.default_billing_type || 'fixed'} onChange={e => setEditItem(v => ({ ...v!, default_billing_type: e.target.value as BillingType }))}>
                  {BILLING_TYPES.map(bt => <option key={bt} value={bt}>{t.billingType[bt]}</option>)}
                </select>
              </div>
              <div>
                <div className="text-[13px] text-[#334155] font-semibold mb-1.5">{t.fields.unit}</div>
                <input className={inp} value={editItem.default_unit || ''} onChange={e => setEditItem(v => ({ ...v!, default_unit: e.target.value }))} />
              </div>
              <div>
                <div className="text-[13px] text-[#334155] font-semibold mb-1.5">Category</div>
                <select className={inp} value={editItem.category_id || ''} onChange={e => setEditItem(v => ({ ...v!, category_id: e.target.value }))}>
                  {categories.map(c => <option key={c.id} value={c.id!}>{isZh ? c.name_cn : c.name_en}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[13px] text-[#334155] font-semibold mb-1.5">默认数量</div>
                <input className={inp} type="number" min={1} value={editItem.default_quantity ?? 1} onChange={e => setEditItem(v => ({ ...v!, default_quantity: Number(e.target.value) || 1 }))} />
              </div>
              <div>
                <div className="text-[13px] text-[#334155] font-semibold mb-1.5">默认月数</div>
                <input className={inp} type="number" min={1} value={editItem.default_months ?? 1} onChange={e => setEditItem(v => ({ ...v!, default_months: Number(e.target.value) || 1 }))} />
              </div>
              <div>
                <div className="text-[13px] text-[#334155] font-semibold mb-1.5">交付周期</div>
                <input className={inp} placeholder="如: 2-4周" value={editItem.default_timeline || ''} onChange={e => setEditItem(v => ({ ...v!, default_timeline: e.target.value }))} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!editItem.allow_price_edit}
                onChange={e => setEditItem(v => ({ ...v!, allow_price_edit: e.target.checked }))}
              />
              <span className="text-[13px] text-[#334155] font-semibold">价格待定（报价时可修改金额）</span>
            </label>

            <div className="flex gap-2 pt-2">
              <button onClick={handleSaveItem} disabled={saving} className="flex-1 bg-[#0c1b3a] text-white rounded px-4 py-2 text-sm disabled:opacity-50">
                {saving ? t.labels.saving : t.buttons.save}
              </button>
              <button onClick={() => setEditItem(null)} className="px-4 py-2 border border-gray-200 rounded text-sm">{t.buttons.cancel}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
