// Server-to-server MIA -> GCI CRM promotion endpoint.
// It accepts qualified HUMAN_REPLY promotions or audited manual overrides. No prospect or MIA
// follow-up data is imported, and preview is the safe default.
export const config = { runtime: 'edge' };

import { syncMiaPromotionFollowup } from '../_lib/notionFollowupSync';

const CRM_STAGES = new Set(['新询盘', '需求整理中', '待报价', '已报价待确认']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function bearer(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const expected = process.env.MIA_PROMOTION_SECRET;
  if (!expected || bearer(request) !== expected) return json({ ok: false, error: 'unauthorized' }, 401);

  const body = await request.json().catch(() => null) as any;
  const p = body?.promotion;
  if (!p || !body?.idempotencyKey) return json({ ok: false, error: 'invalid_payload' }, 400);
  if (!['automatic', 'manual'].includes(p.promotionMode)) return json({ ok: false, error: 'invalid_promotion_mode' }, 422);
  if (p.promotionMode === 'automatic' && p.replyClassification !== 'HUMAN_REPLY') return json({ ok: false, error: 'human_reply_required' }, 422);
  if (p.promotionMode === 'manual' && (!p.promotionReason?.trim() || !p.promotedBy?.trim())) return json({ ok: false, error: 'manual_audit_fields_required' }, 422);
  if (!p.miaCompanyId || !p.companyName?.trim() || !CRM_STAGES.has(p.status)) {
    return json({ ok: false, error: 'invalid_promotion_fields' }, 422);
  }

  const preview = body.mode !== 'execute' || process.env.MIA_PROMOTION_MODE !== 'execute';
  if (preview) {
    return json({ ok: true, mode: 'preview', wouldUpsert: true, wouldCreateFollowup: false, wouldSyncNotionFollowup: true, stage: p.status });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: 'server_config_missing' }, 500);

  const rpc = await fetch(`${supabaseUrl}/rest/v1/rpc/promote_mia_company`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_mia_company_id: p.miaCompanyId,
      p_company_name: p.companyName,
      p_website_url: p.websiteUrl || null,
      p_contact_name: p.contactName || null,
      p_email: p.email || null,
      p_phone: p.phone || null,
      p_original_outreach_subject: p.originalOutreachSubject || null,
      p_first_contact_at: p.firstContactAt || null,
      p_last_reply_at: p.lastReplyAt || null,
      p_intent: p.intent || null,
      p_reply_classification: p.replyClassification,
      p_recommended_next_action: p.recommendedNextAction || null,
      p_summary: p.latestReplySummary || null,
      p_status: p.status,
      p_confidence: typeof p.confidence === 'number' ? p.confidence : null,
      p_promotion_mode: p.promotionMode,
      p_promotion_reason: p.promotionReason || null,
      p_promoted_by: p.promotedBy || 'MIA',
      p_promoted_at: p.promotedAt || new Date().toISOString(),
      p_external_refs: { ...p.externalRefs, mia_promotion_idempotency_key: body.idempotencyKey },
    }),
  });
  const result = await rpc.json().catch(() => null) as any;
  if (!rpc.ok) return json({ ok: false, error: result?.message || `crm_rpc_${rpc.status}` }, 502);
  const row = Array.isArray(result) ? result[0] : result;
  const customerId = row?.customer_id;
  if (!customerId) return json({ ok: false, error: 'crm_rpc_missing_customer_id' }, 502);
  const notionSync = await syncMiaPromotionFollowup({
    supabaseUrl,
    serviceKey,
    notionToken: process.env.NOTION_TOKEN,
    notionDatabaseId: process.env.NOTION_FOLLOWUP_DB_ID,
    customerId,
  });
  if (notionSync.status === 'failed') {
    console.error('[mia-promote] Notion follow-up sync failed:', notionSync.reason);
  } else {
    console.info('[mia-promote] Notion follow-up sync:', notionSync.status);
  }
  const base = process.env.GCI_CRM_BASE_URL || new URL(request.url).origin;
  return json({
    ok: true,
    mode: 'execute',
    customerId,
    created: row?.created === true,
    crmLink: `${base}/crm-customers?customer_id=${encodeURIComponent(customerId)}`,
    notionFollowup: notionSync,
  });
}
