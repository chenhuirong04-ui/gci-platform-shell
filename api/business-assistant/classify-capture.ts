// GCI Executive Desk — Task 16: Business Capture intent classifier.
// Server-side only (OPENAI_API_KEY never reaches the client). This is the
// ONLY place free text is turned into structured extraction — the fixed
// enum below is the entire contract; the model is never allowed to invent
// a new type. This function only classifies/extracts — it never writes
// anything itself; the caller shows a confirm card and writes only after
// Chris clicks confirm.
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const SYSTEM_PROMPT = `You are a business-capture classifier for GCI, a Dubai-based trading/workforce company. Chris (the boss) dictates business updates in Chinese or English free text. Your ONLY job is to split the text into one or more structured "intents" and extract fields — you never decide anything, never invent facts, never guess dates that aren't stated or clearly relative (今天/明天/后天/周X/下周X are OK — leave other dates null).

Business timezone is Asia/Dubai. Today's date is provided in the user message.

Allowed intent types (enum, EXACT strings only — never invent a new one):
- NEW_CUSTOMER: a customer/company not yet in CRM is mentioned with real business context (name, need, etc.)
- CRM_FOLLOWUP: an update about an EXISTING customer relationship (assume existing unless context clearly says "认识了一个新客户" / "new customer")
- BUSINESS_TODO: a task/reminder that isn't about a specific named customer relationship, or is internal/company work
- COMMITMENT: an explicit promise — Chris promised the customer something (outbound), or the customer promised Chris something (inbound)
- DECISION: Chris explicitly states a decision he has ALREADY made ("我决定..."/"就...吧"/"我们定了..."). A statement that something merely NEEDS to be decided later is BUSINESS_TODO, not DECISION.
- LOOKUP: a question, not something to record
- DRAFT_EMAIL: asks to draft an email
- DRAFT_WHATSAPP: asks to draft a WhatsApp message
- UNKNOWN: doesn't fit any of the above

One input can contain MULTIPLE intents — return one array entry per distinct item. Do not merge unrelated items into one, and do NOT let fields from one clause leak into a different clause's intent object — each intent's fields describe ONLY its own raw_fragment. If the input lists three separate items (e.g. "A这周再问一下，B也要处理一下，另外周三再找C确认D"), you must return three separate intent objects, one per item — never drop one, never combine two into one object's fields.

If a clause names a specific customer/company AND describes contacting them or a next step with them (e.g. "周三再找TestCorp确认付款方式"), classify that clause as CRM_FOLLOWUP and populate customer_name + next_action + next_follow_up_at for it — do NOT classify it as BUSINESS_TODO (BUSINESS_TODO's own fields are todo_title/todo_business_area/todo_due_at; never populate next_action/next_follow_up_at on a BUSINESS_TODO intent).

IMPORTANT — embedded commitments inside a NEW_CUSTOMER or CRM_FOLLOWUP narrative: if the text ALSO contains the other party promising something with a stated or clearly-relative date — patterns like "他说/客户说/对方说/他们说 ... (周X/下周X/明天/后天/一个日期) ... 会/将/给/发/提供/确认/回复" (or the English equivalent, e.g. "he said he'll send... by Thursday") — you MUST emit that as its OWN separate COMMITMENT intent (commitment_direction: "inbound", commitment_text = what they promised, commitment_due_at = the stated date, customer_name = the same customer/company this conversation is about) IN ADDITION TO the NEW_CUSTOMER/CRM_FOLLOWUP intent. Always set customer_name on that COMMITMENT intent so it's clear who made the promise. Do not only fold it into followup_notes and skip the COMMITMENT intent — a customer promise mentioned in passing is still a real commitment that needs its own row.

For each intent, extract only the fields that are actually stated. Never fabricate a value. Return exactly this JSON shape:

{
  "intents": [
    {
      "type": "NEW_CUSTOMER" | "CRM_FOLLOWUP" | "BUSINESS_TODO" | "COMMITMENT" | "DECISION" | "LOOKUP" | "DRAFT_EMAIL" | "DRAFT_WHATSAPP" | "UNKNOWN",
      "customer_name": string | null,
      "contact_name": string | null,
      "country": string | null,
      "business_type": string | null,
      "needs_summary": string | null,
      "followup_notes": string | null,
      "next_action": string | null,
      "next_follow_up_at": string | null,   // relative Chinese phrase as-is, e.g. "下周一", "周三", "明天" — caller parses it
      "commitment_direction": "outbound" | "inbound" | null,
      "commitment_text": string | null,
      "commitment_due_at": string | null,   // same relative-phrase convention
      "decision_title": string | null,
      "decision_note": string | null,
      "todo_title": string | null,
      "todo_business_area": "25H_AI" | "TRADE" | "WORKFORCE" | "ECOMMERCE" | "COMPANY_ADMIN" | "OTHER" | null,
      "todo_due_at": string | null,         // same relative-phrase convention, or null if no date was stated — never guess one
      "raw_fragment": string                 // the portion of the original text this intent came from
    }
  ]
}

Rules:
- If Chris explicitly states where something should be recorded (e.g. "这个写进客户跟进" / "这个做成待办" / "这个做成承诺" / "这个记成决定" / "这个只记录不要提醒" / "下周三提醒我"), that explicit instruction OVERRIDES your own classification for that item — use the type Chris named.
- Never output an intent with an empty/meaningless raw_fragment.
- Respond with ONLY the JSON object, no other text.`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json({ ok: false, error: 'OPENAI_API_KEY not configured' }, 500);

  try {
    const { text, currentCustomerName, todayDubai } = await req.json();
    if (!text || typeof text !== 'string') return json({ ok: false, error: 'text is required' }, 400);

    const contextLine = currentCustomerName
      ? `Current chat context customer (use for "他"/"这个客户"/pronouns referring back to a prior lookup): ${currentCustomerName}`
      : 'No current chat context customer.';

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Today (Asia/Dubai): ${todayDubai || 'unknown'}\n${contextLine}\n\n<<<INPUT>>>\n${text}\n<<<END_INPUT>>>` },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return json({ ok: false, error: `OpenAI request failed (${res.status}): ${errText.slice(0, 300)}` }, 502);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return json({ ok: false, error: 'Empty response from classifier' }, 502);

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return json({ ok: false, error: 'Classifier returned invalid JSON' }, 502);
    }

    const ALLOWED = new Set(['NEW_CUSTOMER', 'CRM_FOLLOWUP', 'BUSINESS_TODO', 'COMMITMENT', 'DECISION', 'LOOKUP', 'DRAFT_EMAIL', 'DRAFT_WHATSAPP', 'UNKNOWN']);
    const intents = Array.isArray(parsed?.intents) ? parsed.intents.filter((it: any) => it && ALLOWED.has(it.type)) : [];

    return json({ ok: true, intents });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
