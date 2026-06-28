// Vercel Edge Runtime — GPT-4o business analysis for GCI Action Center
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface TaskSnap {
  id: string;
  clientName: string;
  priority: string;
  tradeStatus: string;
  nextFollowUpAt: string;
  goal: string;
  lastContext: string;
  daysOverdue: number;
}
interface ProjectSnap {
  id: string;
  clientName: string;
  type: string;
  tradeStatus: string;
  name: string;
}
interface Stats {
  totalActive: number;
  aCount: number;
  urgentCount: number;
  quotedOld: number;
  sourcingCount: number;
  projCount: number;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json({ error: 'OPENAI_API_KEY not configured on server' }, 503);

  let body: { tasks?: TaskSnap[]; projects?: ProjectSnap[]; stats?: Stats; dateStr?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { tasks = [], projects = [], stats = {} as Stats, dateStr = '' } = body;

  const taskLines = tasks.slice(0, 15).map((t, i) =>
    `${i + 1}. [${t.priority}级] ${t.clientName} | ${t.tradeStatus} | ` +
    `${t.daysOverdue >= 0 ? `逾期${t.daysOverdue}天` : `${Math.abs(t.daysOverdue)}天后到期`} | ` +
    `目标: ${(t.goal || '').slice(0, 60)}`
  ).join('\n');

  const projLines = projects.slice(0, 10).map((p, i) =>
    `${i + 1}. ${p.clientName} (${p.type}) | ${p.tradeStatus} | ${p.name}`
  ).join('\n');

  const prompt = `你是 GCI (Global Care Info) 的首席业务分析师。
GCI 定位：中东市场执行平台，专注中国供应链整合与迪拜本地落地（FF&E / 家居建材 / 贸易 / AI 咖啡项目）。

【今日业务快照 — ${dateStr}】

活跃跟进记录（按优先级排序，共 ${stats.totalActive || 0} 条）：
${taskLines || '无活跃记录'}

进行中项目（共 ${stats.projCount || 0} 个）：
${projLines || '无项目'}

关键统计：
- A 级客户：${stats.aCount || 0} 条，其中今日逾期：${stats.urgentCount || 0} 条
- 已报价等客户回复超 3 天：${stats.quotedOld || 0} 条
- 等供应商报价/确认：${stats.sourcingCount || 0} 条

---
以纯 JSON 格式输出（不要有任何额外文字，必须是合法 JSON）：
{
  "actions": [
    {
      "title": "事项标题（15字内）",
      "clientName": "涉及的客户或项目名称",
      "reason": "为什么今日优先（2-3句，包含商机价值或风险判断）",
      "risk": "今日不推进的后果（1-2句，具体）",
      "commStyle": "建议沟通方式和语气（1句）",
      "waTemplate": "可直接发出的 WhatsApp 英文文案（3-5行，以客户姓名开头称呼，结尾以问句推动回复）",
      "worthInvesting": true
    }
  ],
  "overallInsight": "今日整体业务判断，包含最大机会和最大风险（2-3句）",
  "priorityFocus": "今日最应优先关注的一个客户或项目名称"
}

要求：
1. actions 给出今日最重要的 3 件事，按优先级降序
2. waTemplate 必须是英文，简洁商务风格
3. worthInvesting: 预估成交概率 < 20% 且信息严重不足时设为 false，否则 true
4. 全部用中文输出（waTemplate 和客户名除外）
5. 基于实际数据做具体判断，禁止空泛建议`;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return json({ error: `OpenAI error ${resp.status}: ${err}` }, 502);
    }

    const data = await resp.json() as any;
    const content = data?.choices?.[0]?.message?.content || '{}';
    const result = JSON.parse(content);
    return json(result);
  } catch (e: any) {
    return json({ error: e?.message || 'AI analysis failed' }, 500);
  }
}
