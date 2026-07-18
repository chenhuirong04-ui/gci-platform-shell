import React, { useState } from 'react';
import type { Supplier } from './types';
import SupplierList from './components/SupplierList';
import SupplierForm from './components/SupplierForm';
import SupplierDetail from './components/SupplierDetail';

type View =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'edit'; supplier: Supplier }
  | { kind: 'detail'; supplierId: string };

export default function SuppliersModule() {
  const [view, setView] = useState<View>({ kind: 'list' });

  if (view.kind === 'new') {
    return (
      <SupplierForm
        onSaved={s => setView({ kind: 'detail', supplierId: s.id! })}
        onCancel={() => setView({ kind: 'list' })}
      />
    );
  }

  if (view.kind === 'edit') {
    return (
      <SupplierForm
        supplier={view.supplier}
        onSaved={s => setView({ kind: 'detail', supplierId: s.id! })}
        onCancel={() => setView({ kind: 'detail', supplierId: view.supplier.id! })}
      />
    );
  }

  if (view.kind === 'detail') {
    return (
      <SupplierDetail
        supplierId={view.supplierId}
        onBack={() => setView({ kind: 'list' })}
        onEdit={s => setView({ kind: 'edit', supplier: s })}
      />
    );
  }

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', padding: 20 }}>
      <SupplierList
        onNew={() => setView({ kind: 'new' })}
        onSelect={s => setView({ kind: 'detail', supplierId: s.id! })}
      />
    </div>
  );
}
