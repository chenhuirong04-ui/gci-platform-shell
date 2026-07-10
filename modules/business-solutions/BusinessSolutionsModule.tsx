import React, { useState, useEffect, useCallback } from 'react';
import type { BSTab, ServiceCustomer, ServiceCatalogItem, ServiceCategory, ServiceQuote, ServiceQuoteLineItem, BSLang } from './types';
import { useT } from './translations';
import { ServiceCustomerList } from './components/ServiceCustomerList';
import { ServiceCustomerForm } from './components/ServiceCustomerForm';
import { ServiceCustomerDetail } from './components/ServiceCustomerDetail';
import { ServiceCatalogManager } from './components/ServiceCatalogManager';
import { ServiceQuoteBuilder } from './components/ServiceQuoteBuilder';
import { ServiceQuoteHistory } from './components/ServiceQuoteHistory';
import { ServiceQuotePreview } from './components/ServiceQuotePreview';
import {
  listCustomers, saveCustomer, updateCustomer, deleteCustomer,
  listCategories, saveCategory, updateCategory, deleteCategory,
  listCatalogItems, saveCatalogItem, updateCatalogItem, deleteCatalogItem,
  listQuotes, listQuotesByCustomer, loadQuote, saveQuote, updateQuote, deleteQuote,
  checkTableExists, generateQuoteNo,
} from './lib/bsCloud';

interface Props {
  lang?: BSLang;
}

type QuoteView = { quote: ServiceQuote; items: ServiceQuoteLineItem[] };

export function BusinessSolutionsModule({ lang: langProp }: Props) {
  const lang: BSLang = (langProp === 'en' ? 'en' : 'zh');
  const t = useT(lang);

  const [tab, setTab] = useState<BSTab>('customers');
  const [dbReady, setDbReady] = useState<boolean | null>(null);

  // Data
  const [customers, setCustomers] = useState<ServiceCustomer[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [catalogItems, setCatalogItems] = useState<ServiceCatalogItem[]>([]);
  const [quotes, setQuotes] = useState<ServiceQuote[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Customer panel
  const [customerFormMode, setCustomerFormMode] = useState<'add' | 'edit' | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<ServiceCustomer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<ServiceCustomer | null>(null);
  const [customerQuotes, setCustomerQuotes] = useState<ServiceQuote[]>([]);

  // Quote state
  const [quoteBuilderCustomer, setQuoteBuilderCustomer] = useState<ServiceCustomer | undefined>();
  const [editingQuote, setEditingQuote] = useState<QuoteView | null>(null);
  const [viewingQuote, setViewingQuote] = useState<QuoteView | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Check DB + initial load
  useEffect(() => {
    (async () => {
      const ready = await checkTableExists();
      setDbReady(ready);
      if (!ready) { setLoading(false); return; }
      await reload();
    })();
  }, []);

  const reload = async () => {
    setLoading(true);
    const [c, cat, ci, q] = await Promise.all([
      listCustomers(), listCategories(), listCatalogItems(), listQuotes(),
    ]);
    setCustomers(c);
    setCategories(cat);
    setCatalogItems(ci);
    setQuotes(q);
    setLoading(false);
  };

  // Customer CRUD
  const handleSaveCustomer = async (c: ServiceCustomer) => {
    if (c.id) {
      await updateCustomer(c.id, c);
      setCustomers(prev => prev.map(x => x.id === c.id ? { ...x, ...c } : x));
    } else {
      const saved = await saveCustomer(c);
      if (saved) setCustomers(prev => [saved, ...prev]);
    }
    showToast(t.toast.customerSaved);
    setCustomerFormMode(null);
    setEditingCustomer(null);
  };

  const handleViewCustomer = async (c: ServiceCustomer) => {
    setViewingCustomer(c);
    if (c.id) {
      const cq = await listQuotesByCustomer(c.id);
      setCustomerQuotes(cq);
    }
  };

  const handleEditCustomer = (c: ServiceCustomer) => {
    setEditingCustomer(c);
    setCustomerFormMode('edit');
    setViewingCustomer(null);
  };

  const handleNewQuoteForCustomer = (c: ServiceCustomer) => {
    setQuoteBuilderCustomer(c);
    setTab('new-quote');
    setViewingCustomer(null);
    setEditingQuote(null);
  };

  // Quote CRUD
  const handleSaveQuote = async (quote: ServiceQuote, items: ServiceQuoteLineItem[]) => {
    const id = await saveQuote(quote, items);
    if (id) {
      showToast(t.toast.quoteSaved);
      const newQuote = { ...quote, id };
      setQuotes(prev => [newQuote, ...prev]);
      setTab('quotes');
      setQuoteBuilderCustomer(undefined);
      setEditingQuote(null);
    } else {
      showToast(t.toast.error, 'error');
    }
  };

  const handleDeleteQuote = async (id: string) => {
    await deleteQuote(id);
    setQuotes(prev => prev.filter(q => q.id !== id));
    showToast(t.toast.quoteDeleted);
  };

  const handleViewQuote = async (q: ServiceQuote) => {
    const data = await loadQuote(q.id!);
    if (data) setViewingQuote(data);
  };

  const handleEditQuote = async (q: ServiceQuote) => {
    const data = await loadQuote(q.id!);
    if (data) {
      setEditingQuote(data);
      setTab('new-quote');
    }
  };

  const handleMarkSent = async () => {
    if (!viewingQuote) return;
    await updateQuote(viewingQuote.quote.id!, { status: 'SENT', sent_at: new Date().toISOString() });
    setViewingQuote(v => v ? { ...v, quote: { ...v.quote, status: 'SENT' } } : null);
    setQuotes(prev => prev.map(q => q.id === viewingQuote.quote.id ? { ...q, status: 'SENT' } : q));
    showToast(t.toast.markedSent);
  };

  const handleMarkAccepted = async () => {
    if (!viewingQuote) return;
    await updateQuote(viewingQuote.quote.id!, { status: 'ACCEPTED', accepted_at: new Date().toISOString() });
    setViewingQuote(v => v ? { ...v, quote: { ...v.quote, status: 'ACCEPTED' } } : null);
    setQuotes(prev => prev.map(q => q.id === viewingQuote.quote.id ? { ...q, status: 'ACCEPTED' } : q));
    showToast(t.toast.markedAccepted);
  };

  const handleCopyQuoteAsNew = () => {
    if (!viewingQuote) return;
    const newQuote: ServiceQuote = {
      ...viewingQuote.quote,
      id: undefined,
      quote_no: generateQuoteNo(),
      version: (viewingQuote.quote.version || 1) + 1,
      status: 'DRAFT',
      sent_at: undefined,
      accepted_at: undefined,
      quote_date: new Date().toISOString().slice(0, 10),
      created_at: undefined,
    };
    setEditingQuote({ quote: newQuote, items: viewingQuote.items.map(it => ({ ...it, id: `copy_${it.id}_${Date.now()}` })) });
    setViewingQuote(null);
    setTab('new-quote');
  };

  // Catalog CRUD
  const handleSaveCatalogItem = async (item: ServiceCatalogItem) => {
    if (item.id) {
      await updateCatalogItem(item.id, item);
      setCatalogItems(prev => prev.map(x => x.id === item.id ? { ...x, ...item } : x));
    } else {
      const saved = await saveCatalogItem(item);
      if (saved) setCatalogItems(prev => [...prev, saved]);
    }
    showToast(t.toast.customerSaved);
  };

  const handleUpdateCatalogItem = async (id: string, patch: Partial<ServiceCatalogItem>) => {
    await updateCatalogItem(id, patch);
    setCatalogItems(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));
  };

  const handleDeleteCatalogItem = async (id: string) => {
    await deleteCatalogItem(id);
    setCatalogItems(prev => prev.filter(x => x.id !== id));
    showToast(t.toast.customerDeleted);
  };

  const handleSaveCategory = async (cat: ServiceCategory) => {
    const saved = await saveCategory(cat);
    if (saved) setCategories(prev => [...prev, saved]);
  };

  // DB not ready
  if (dbReady === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-3">
        <div className="text-4xl">⚠️</div>
        <div className="font-semibold text-gray-800">{t.labels.dbNotReady}</div>
        <div className="text-sm text-gray-500">{t.labels.dbNotReadyDesc}</div>
        <code className="text-xs bg-gray-100 rounded px-3 py-2 text-gray-700">supabase/migrations/20260710_business_solutions.sql</code>
      </div>
    );
  }

  const TABS: { key: BSTab; label: string }[] = [
    { key: 'customers', label: t.tabs.customers },
    { key: 'new-quote', label: t.tabs.newQuote },
    { key: 'quotes', label: t.tabs.quotes },
    { key: 'catalog', label: t.tabs.catalog },
  ];

  return (
    <div className="min-h-screen bg-white relative">
      {/* Module header */}
      <div className="bg-[#0c1b3a] px-4 py-3 flex items-center gap-3">
        <span className="text-white font-semibold text-base">{t.moduleTitle}</span>
        <div className="flex-1" />
        <button onClick={reload} className="text-blue-200 hover:text-white text-xs">{loading ? '…' : '↺'}</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 bg-white">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              setTab(key);
              if (key !== 'new-quote') { setQuoteBuilderCustomer(undefined); setEditingQuote(null); }
              if (key !== 'customers') { setViewingCustomer(null); setCustomerFormMode(null); }
            }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-[#0c1b3a] text-[#0c1b3a]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div>
        {tab === 'customers' && (
          <div className="flex">
            {/* List panel */}
            <div className={`transition-all ${viewingCustomer || customerFormMode ? 'w-1/2' : 'w-full'}`}>
              {customerFormMode ? (
                <ServiceCustomerForm
                  lang={lang}
                  initial={editingCustomer || undefined}
                  onSave={handleSaveCustomer}
                  onCancel={() => { setCustomerFormMode(null); setEditingCustomer(null); }}
                />
              ) : (
                <ServiceCustomerList
                  lang={lang}
                  customers={customers}
                  loading={loading}
                  onView={handleViewCustomer}
                  onEdit={handleEditCustomer}
                  onNewQuote={handleNewQuoteForCustomer}
                  onAddCustomer={() => { setCustomerFormMode('add'); setEditingCustomer(null); setViewingCustomer(null); }}
                />
              )}
            </div>

            {/* Detail panel */}
            {viewingCustomer && !customerFormMode && (
              <div className="w-1/2 border-l border-gray-100">
                <ServiceCustomerDetail
                  lang={lang}
                  customer={viewingCustomer}
                  quotes={customerQuotes}
                  onEdit={() => handleEditCustomer(viewingCustomer)}
                  onNewQuote={() => handleNewQuoteForCustomer(viewingCustomer)}
                  onViewQuote={handleViewQuote}
                  onClose={() => setViewingCustomer(null)}
                />
              </div>
            )}
          </div>
        )}

          {tab === 'new-quote' && (
            viewingQuote ? (
              <ServiceQuotePreview
                lang={lang}
                quote={viewingQuote.quote}
                items={viewingQuote.items}
                onClose={() => setViewingQuote(null)}
                onMarkSent={handleMarkSent}
                onMarkAccepted={handleMarkAccepted}
                onCopyAsNew={handleCopyQuoteAsNew}
              />
            ) : (
              <ServiceQuoteBuilder
                lang={lang}
                customers={customers}
                categories={categories}
                catalogItems={catalogItems}
                initialCustomer={quoteBuilderCustomer}
                onSave={handleSaveQuote}
                onCancel={() => { setTab('quotes'); setEditingQuote(null); setQuoteBuilderCustomer(undefined); }}
              />
            )
          )}

          {tab === 'quotes' && (
            viewingQuote ? (
              <ServiceQuotePreview
                lang={lang}
                quote={viewingQuote.quote}
                items={viewingQuote.items}
                onClose={() => setViewingQuote(null)}
                onMarkSent={handleMarkSent}
                onMarkAccepted={handleMarkAccepted}
                onCopyAsNew={handleCopyQuoteAsNew}
              />
            ) : (
              <ServiceQuoteHistory
                lang={lang}
                quotes={quotes}
                loading={loading}
                onView={handleViewQuote}
                onEdit={handleEditQuote}
                onDelete={handleDeleteQuote}
              />
            )
          )}

          {tab === 'catalog' && (
            <ServiceCatalogManager
              lang={lang}
              categories={categories}
              items={catalogItems}
              loading={loading}
              onSaveCategory={handleSaveCategory}
              onSaveItem={handleSaveCatalogItem}
              onUpdateItem={handleUpdateCatalogItem}
              onDeleteItem={handleDeleteCatalogItem}
            />
          )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-white text-sm transition-all ${
          toast.type === 'error' ? 'bg-red-600' :
          toast.type === 'info' ? 'bg-blue-600' :
          'bg-green-600'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export default BusinessSolutionsModule;
