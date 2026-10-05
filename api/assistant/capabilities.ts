import { ACTION_RISK } from './_actions';
import { authenticateAssistant, json } from './_lib';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = await authenticateAssistant(request);
  if (!auth.ok) return auth.response;
  return json({
    ok: true,
    version: '2.0',
    source_of_truth: 'GCI APP / Supabase Production',
    read: ['crm', 'quotation', 'invoice', 'enterprise_services', 'supplier', 'supplier_payables', 'projects', 'documents_metadata', 'daily_management', 'legacy_trade_sales', 'consignment_batches'],
    contexts: ['customer', 'product', 'project', 'supplier'],
    actions: ACTION_RISK,
    forbidden: ['delete_finance', 'delete_audit', 'bypass_approval', 'change_permissions', 'change_service_role_or_auth', 'bulk_delete', 'bulk_update', 'unconfirmed_finance', 'external_communication'],
    gaps: ['standard_product_master', 'standard_inventory_ledger', 'reserved_and_available_stock', 'warehouse_movements', 'purchase_orders', 'procurement_delivery_workflow', 'project_milestones', 'project_responsible_person_and_deadline', 'quotation_discount_columns_for_trade_quotes', 'outbound_quotation_sender', 'unified_customer_balance_ledger'],
  });
}
