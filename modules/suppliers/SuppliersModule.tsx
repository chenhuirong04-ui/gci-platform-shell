import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '@gci/i18n';
import type { Supplier } from './types';
import SupplierList from './components/SupplierList';
import SupplierForm from './components/SupplierForm';
import SupplierDetail from './components/SupplierDetail';
import NotionImportPage from './components/NotionImportPage';
import SupplierCleanupPage from './components/SupplierCleanupPage';

const GOLD = '#C9A84C';
const NAVY = '#0c1b3a';

type TopTab = 'list' | 'new' | 'docs' | 'quotes';

type SubView =
  | { kind: 'list' }
  | { kind: 'detail'; supplierId: string }
  | { kind: 'edit'; supplier: Supplier }
  | { kind: 'notion-import' }
  | { kind: 'cleanup' };

export default function SuppliersModule() {
  const { dict } = useI18n();
  const TOP_TABS: { key: TopTab; label: string }[] = [
    { key: 'list',   label: dict.suppliers.nav.list },
    { key: 'new',    label: dict.suppliers.nav.add },
    { key: 'docs',   label: dict.suppliers.nav.files },
    { key: 'quotes', label: dict.suppliers.nav.quotes },
  ];
  const [topTab, setTopTab] = useState<TopTab>('list');
  const [sub, setSub] = useState<SubView>({ kind: 'list' });
  const [listInitFilters, setListInitFilters] = useState<{ country?: string; category?: string }>({});
  const [searchParams, setSearchParams] = useSearchParams();

  const goDetail = (supplierId: string) => {
    setSub({ kind: 'detail', supplierId });
    setTopTab('list');
  };

  // Support ?open=<supplierId> deep-link from AI assistant
  useEffect(() => {
    const openId = searchParams.get('open');
    if (openId) {
      setSearchParams({}, { replace: true });
      goDetail(openId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div translate="no" className="notranslate" style={{ minHeight: '100vh', background: '#f5f3ef' }}>

      {/* ── Top secondary navigation ─────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e8e0d0', display: 'flex', alignItems: 'center', paddingLeft: 16, overflowX: 'auto' }}>
        {TOP_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              setTopTab(key);
              if (key === 'list') setSub({ kind: 'list' });
            }}
            style={{
              padding: '12px 18px',
              fontSize: 13,
              fontWeight: topTab === key ? 700 : 500,
              color: topTab === key ? NAVY : '#475569',
              border: 'none',
              borderBottom: topTab === key ? `2px solid ${GOLD}` : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              marginBottom: -1,
              transition: 'color .15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}

      {/* LIST tab */}
      {topTab === 'list' && sub.kind === 'list' && (
        <SupplierList
          onNew={() => setTopTab('new')}
          onSelect={s => goDetail(s.id!)}
          onNotionImport={() => setSub({ kind: 'notion-import' })}
          onCleanup={() => { setListInitFilters({}); setSub({ kind: 'cleanup' }); }}
          initialFilters={listInitFilters}
        />
      )}

      {topTab === 'list' && sub.kind === 'notion-import' && (
        <NotionImportPage onBack={() => setSub({ kind: 'list' })} />
      )}

      {topTab === 'list' && sub.kind === 'cleanup' && (
        <SupplierCleanupPage
          onBack={() => setSub({ kind: 'list' })}
          onOpenDetail={id => goDetail(id)}
          onGoToFilteredList={filters => { setListInitFilters(filters); setSub({ kind: 'list' }); }}
        />
      )}

      {topTab === 'list' && sub.kind === 'detail' && (
        <SupplierDetail
          supplierId={sub.supplierId}
          onBack={() => setSub({ kind: 'list' })}
          onEdit={s => setSub({ kind: 'edit', supplier: s })}
        />
      )}

      {topTab === 'list' && sub.kind === 'edit' && (
        <SupplierForm
          supplier={sub.supplier}
          onSaved={s => goDetail(s.id!)}
          onCancel={() => setSub({ kind: 'detail', supplierId: sub.supplier.id! })}
        />
      )}

      {/* NEW tab */}
      {topTab === 'new' && (
        <SupplierForm
          onSaved={s => goDetail(s.id!)}
          onCancel={() => setTopTab('list')}
        />
      )}

      {/* DOCS tab */}
      {topTab === 'docs' && (
        <div style={{ padding: '48px 32px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
          <div style={{ fontWeight: 700, color: '#475569', marginBottom: 6 }}>{dict.suppliers.module.docsTitle}</div>
          <div>{dict.suppliers.module.docsDesc}</div>
        </div>
      )}

      {/* QUOTES tab */}
      {topTab === 'quotes' && (
        <div style={{ padding: '48px 32px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 700, color: '#475569', marginBottom: 6 }}>{dict.suppliers.module.quotesTitle}</div>
          <div>{dict.suppliers.module.quotesDesc}</div>
        </div>
      )}
    </div>
  );
}
