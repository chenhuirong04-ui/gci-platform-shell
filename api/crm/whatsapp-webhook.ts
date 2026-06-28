// Vercel Edge Runtime — WhatsApp Cloud API Webhook (minimal stable v2)
// Flow: receive message → write Notion WA Inbox → send fixed auto-reply
// No AI · No Telegram · No Follow-up Log
export const config = { runtime: 'edge' };

// In-memory dedup (best-effort, resets on cold start)
const processedIds = new Set<string>();

const AUTO_REPLY = `Thank you for contacting GCI.

We have received your message.

To help us assist you faster, please send:
• Product photo or product name
• Quantity required
• Delivery location
• Project use or personal use

Our team will review and get back to you as soon as possible.

Website:
https://globalcareinfo.com

WhatsApp / Call:
+971 58 556 6809`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── GET: Meta webhook verification ──────────────────────────────────────────
function handleVerification(request: Request): Response {
  const url = new URL(request.url);
  const mode      = url.searchParams.get('hub.mode');
  const token     = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[wa-webhook] Verification OK');
    return new Response(challenge ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// ── Message extraction ───────────────────────────────────────────────────────
interface WaMsg {
  phone: string;
  messageId: string;
  text: string;
  messageType: string;
  timestamp: string; // ISO
  profileName: string;
}

function extractMessage(body: any): WaMsg | null {
  try {
    const value   = body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) return null;

    const phone       = message.from ?? '';
    const messageId   = message.id ?? '';
    const messageType = message.type ?? 'text';
    const timestamp   = new Date(parseInt(message.timestamp ?? '0', 10) * 1000).toISOString();
    const profileName = value?.contacts?.[0]?.profile?.name ?? '';

    let text = '';
    switch (messageType) {
      case 'text':     text = message.text?.body ?? ''; break;
      case 'image':    text = '[图片]' + (message.image?.caption ? ` ${message.image.caption}` : ''); break;
      case 'document': text = `[文件: ${message.document?.filename ?? 'unknown'}]`; break;
      case 'audio':    text = '[语音消息]'; break;
      case 'video':    text = '[视频]'; break;
      default:         text = `[${messageType}]`;
    }

    if (!phone || !messageId) return null;
    return { phone, messageId, text: text || '(empty)', messageType, timestamp, profileName };
  } catch {
    return null;
  }
}

// ── Write to 小B/C 客户池 (SB Pool) ─────────────────────────────────────────
// Schema hardcoded from actual Notion DB (e2bd8d77-d86a-4616-8e76-a561b3e512b7)
async function writeToInbox(msg: WaMsg, token: string, dbId: string): Promise<void> {
  const timeLabel = new Date(msg.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Dubai' });
  const tomorrow  = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const clientName = msg.profileName
    ? `${msg.profileName} (+${msg.phone})`
    : `WA +${msg.phone}`;

  const properties: Record<string, any> = {
    '客户名称':      { title: [{ type: 'text', text: { content: clientName } }] },
    '电话/WhatsApp': { phone_number: `+${msg.phone}` },
    '来源':          { select: { name: 'WhatsApp' } },
    '当前状态':      { select: { name: '新询价' } },
    '最后沟通内容':  { rich_text: [{ type: 'text', text: { content: msg.text.slice(0, 2000) } }] },
    '备注':          { rich_text: [{ type: 'text', text: { content: `[WA ${timeLabel}] MsgID: ${msg.messageId}` } }] },
    '下次跟进日期':  { date: { start: tomorrow } },
    '需求等级':      { select: { name: 'B — 正常询价' } },
    '下一步动作':    { select: { name: '二次跟进' } },
    '客户类型':      { select: { name: '个人' } },
  };

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parent: { database_id: dbId }, properties }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(`Notion ${res.status}: ${JSON.stringify(err).slice(0, 300)}`);
  }
  console.log('[wa-webhook] notion inbox created');
}

// ── Send fixed auto-reply ────────────────────────────────────────────────────
async function sendReply(phone: string, msgId: string): Promise<void> {
  const token   = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    console.warn('[wa-webhook] Missing WhatsApp credentials, skip auto-reply');
    return;
  }

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: AUTO_REPLY },
    }),
  });

  if (res.ok) {
    console.log('[wa-webhook] auto reply sent');
  } else {
    const err = await res.json().catch(() => ({})) as any;
    console.warn('[wa-webhook] auto reply failed:', JSON.stringify(err).slice(0, 200));
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'GET')  return handleVerification(request);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const notionToken = process.env.NOTION_TOKEN;
  const dbId        = process.env.NOTION_SB_DB_ID; // 小B/C 客户池
  if (!notionToken || !dbId) {
    console.error('[wa-webhook] Missing NOTION_TOKEN or NOTION_SB_DB_ID');
    return json({ ok: true }); // always 200 to Meta
  }

  let body: any;
  try { body = await request.json(); }
  catch { return json({ ok: true }); }

  if (body?.object !== 'whatsapp_business_account') {
    return json({ ok: true, skipped: 'not whatsapp event' });
  }

  const msg = extractMessage(body);
  if (!msg) return json({ ok: true, skipped: 'no message' });

  console.log(`[wa-webhook] whatsapp message received from +${msg.phone} type=${msg.messageType}`);

  // Dedup by message ID
  if (processedIds.has(msg.messageId)) {
    console.log('[wa-webhook] duplicate, skipped');
    return json({ ok: true, skipped: 'duplicate' });
  }
  processedIds.add(msg.messageId);
  if (processedIds.size > 1000) {
    processedIds.delete(processedIds.values().next().value!);
  }

  // Write to Notion WA Inbox
  try {
    await writeToInbox(msg, notionToken, dbId);
  } catch (e: any) {
    console.error('[wa-webhook] Notion write failed:', e?.message);
    // Don't return — still try to auto-reply
  }

  // Auto-reply (failure does not block anything)
  await sendReply(msg.phone, msg.messageId);

  return json({ ok: true, phone: msg.phone });
}
