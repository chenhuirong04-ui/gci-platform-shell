import React, { useState, useMemo } from 'react';
import type { ServiceCatalogItem, ServiceCategory, ServiceQuoteLineItem, BSLang, BillingType } from '../types';
import { useT } from '../translations';
import { calcLineTotal } from '../lib/bsCalculations';

interface Props {
  lang: BSLang;
  categories: ServiceCategory[];
  items: ServiceCatalogItem[];
  onAdd: (item: ServiceQuoteLineItem) => void;
  onAddCustom: (item: ServiceQuoteLineItem) => void;
}

function makeLineItem(cat: ServiceCatalogItem, lang: BSLang, id: string): ServiceQuoteLineItem {
  const isZh = lang === 'zh';
  const item: ServiceQuoteLineItem = {
    id,
    catalog_service_id: cat.id,
    category_name: isZh ? cat.name_cn : cat.name_en,
    service_name: isZh ? cat.name_cn : cat.name_en,
    description: isZh ? (cat.description_zh || '') : (cat.description_en || ''),
    scope: isZh ? (cat.scope_zh || '') : (cat.scope_en || ''),
    deliverables: isZh ? (cat.deliverables_zh || '') : (cat.deliverables_en || ''),
    item_exclusions: isZh ? (cat.exclusions_zh || '') : (cat.exclusions_en || ''),
    timeline: cat.default_timeline || '',
    unit: cat.default_unit || '项',
    quantity: cat.default_quantity || 1,
    months: cat.default_months || 1,
    billing_type: cat.default_billing_type || 'fixed',
    billing_label: '',
    one_time_fee: cat.one_time_fee || 0,
    monthly_fee: cat.monthly_fee || 0,
    annual_fee: cat.annual_fee || 0,
    unit_price: cat.one_time_fee || 0,
    line_total: 0,
    is_optional: false,
    sort_order: 0,
  };
  item.line_total = calcLineTotal(item);
  return item;
}

const EMPTY_CUSTOM: Omit<ServiceQuoteLineItem, 'id'> = {
  catalog_service_id: undefined,
  category_name: '',
  service_name: '',
  description: '',
  scope: '',
  deliverables: '',
  item_exclusions: '',
  timeline: '',
  unit: '项',
  quantity: 1,
  months: 1,
  billing_type: 'fixed',
  billing_label: '',
  one_time_fee: 0,
  monthly_fee: 0,
  annual_fee: 0,
  unit_price: 0,
  line_total: 0,
  is_optional: false,
  sort_order: 0,
};

export function ServiceCatalogPicker({ lang, categories, items, onAdd, onAddCustom }: Props) {
  const t = useT(lang);
  const isZh = lang === 'zh';
  const [search, setSearch] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [custom, setCustom] = useState<Omit<ServiceQuoteLineItem, 'id'>>({ ...EMPTY_CUSTOM });

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const activeItems = items.filter(it => it.active !== false);
    const filtered = q
      ? activeItems.filter(it => (isZh ? it.name_cn : it.name_en).toLowerCase().includes(q))
      : activeItems;
    const map = new Map<string, { cat: ServiceCategory; items: ServiceCatalogItem[] }>();
    for (const cat of categories) {
      const catItems = filtered.filter(it => it.category_id === cat.id);
      if (catItems.length) map.set(cat.id!, { cat, items: catItems });
    }
    // uncategorized
    const uncatItems = filtered.filter(it => !categories.find(c => c.id === it.category_id));
    if (uncatItems.length) map.set('_uncat', { cat: { id: '_uncat', name_cn: '其他', name_en: 'Other', sort_order: 99 }, items: uncatItems });
    return map;
  }, [categories, items, search, isZh]);

  const handleAddCatalog = (cat: ServiceCatalogItem) => {
    const line = makeLineItem(cat, lang, `line_${Date.now()}_${Math.random()}`);
    onAdd(line);
  };

  const handleAddCustom = () => {
    const line: ServiceQuoteLineItem = {
      ...custom,
      id: `custom_${Date.now()}`,
      line_total: calcLineTotal({ ...custom } as ServiceQuoteLineItem),
    };
    onAddCustom(line);
    setCustom({ ...EMPTY_CUSTOM });
    setCustomMode(false);
  };

  const inp = 'border border-gray-200 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:border-blue-400';

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="p-3 border-b border-gray-100">
        <input
          className="border border-gray-200 rounded px-3 py-1.5 text-sm w-full focus:outline-none"
          placeholder={t.buttons.search + '…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {Array.from(grouped.values()).map(({ cat, items: catItems }) => (
          <div key={cat.id}>
            <div className="text-xs font-semibold text-[#0c1b3a] uppercase tracking-wide mb-1">
              {isZh ? cat.name_cn : cat.name_en}
            </div>
            {catItems.map(it => (
              <div key={it.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">
                <div>
                  <div className="text-gray-800">{isZh ? it.name_cn : it.name_en}</div>
                  {(isZh ? it.description_zh : it.description_en) && (
                    <div className="text-xs text-gray-400 truncate max-w-xs">
                      {isZh ? it.description_zh : it.description_en}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleAddCatalog(it)}
                  className="ml-3 text-xs bg-[#0c1b3a] text-white rounded px-2 py-1 hover:bg-[#1a3060] flex-shrink-0"
                >
                  + {t.buttons.addService}
                </button>
              </div>
            ))}
          </div>
        ))}

        {grouped.size === 0 && (
          <div className="text-gray-400 text-center py-6">{t.empty.searchEmpty}</div>
        )}
      </div>

      {/* Custom service */}
      <div className="border-t border-gray-100 p-3">
        {!customMode ? (
          <button
            onClick={() => setCustomMode(true)}
            className="w-full border border-dashed border-gray-300 rounded py-2 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-500"
          >
            + {t.buttons.addCustomService}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-600">{t.labels.customService}</div>
            <input className={inp} placeholder={t.fields.serviceName} value={custom.service_name} onChange={e => setCustom(c => ({ ...c, service_name: e.target.value }))} />
            <textarea className={inp + ' resize-none'} rows={2} placeholder={t.fields.description} value={custom.description} onChange={e => setCustom(c => ({ ...c, description: e.target.value }))} />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-xs text-gray-400 mb-1">{t.fields.oneTimeFee}</div>
                <input className={inp} type="number" min={0} value={custom.one_time_fee || ''} onChange={e => setCustom(c => ({ ...c, one_time_fee: Number(e.target.value) }))} />
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">{t.fields.monthlyFee}</div>
                <input className={inp} type="number" min={0} value={custom.monthly_fee || ''} onChange={e => setCustom(c => ({ ...c, monthly_fee: Number(e.target.value) }))} />
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">{t.fields.months}</div>
                <input className={inp} type="number" min={1} value={custom.months || 1} onChange={e => setCustom(c => ({ ...c, months: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddCustom} disabled={!custom.service_name.trim()} className="flex-1 bg-[#0c1b3a] text-white rounded px-3 py-1.5 text-xs disabled:opacity-50">
                + {t.buttons.addService}
              </button>
              <button onClick={() => setCustomMode(false)} className="px-3 py-1.5 border border-gray-200 rounded text-xs">
                {t.buttons.cancel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
