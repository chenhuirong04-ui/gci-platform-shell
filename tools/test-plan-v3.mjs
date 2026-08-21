#!/usr/bin/env node
// Test harness for GIA Action Planner V3 (api/business-assistant/plan-v3.ts).
// Standalone script — not part of the app build. Run manually:
//   node tools/test-plan-v3.mjs https://app.globalcareinfo.com
//
// Posts each of the 9 required test sentences to the deployed endpoint 3x
// (repeatability requirement), independently computes expected dates with
// its own copy of the date-resolution algorithm (never trusts the endpoint
// to grade itself), and prints a PASS/FAIL table + final N/9 score.
// Exit code 0 iff score >= 8.

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error('Usage: node tools/test-plan-v3.mjs <base-url>');
  process.exit(2);
}
const endpoint = `${baseUrl.replace(/\/$/, '')}/api/business-assistant/plan-v3`;

// --- independent oracle: same algorithm as plan-v3.ts, copied a 3rd time on
// purpose so a bug shared between plan-v3.ts and this harness can't hide a
// wrong date behind agreement between the two.
const WEEKDAY_MAP = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function mondayBasedIndex(d) { return (d.getDay() + 6) % 7; }
function startOfWeekMonday(d) { const monday = new Date(d); monday.setDate(d.getDate() - mondayBasedIndex(d)); return monday; }
function parseRelativeDateZh(text, ref) {
  const s = text.trim();
  const today = new Date(ref);
  today.setHours(0, 0, 0, 0);
  if (/明天/.test(s)) { const d = new Date(today); d.setDate(d.getDate() + 1); return fmtDate(d); }
  if (/后天/.test(s)) { const d = new Date(today); d.setDate(d.getDate() + 2); return fmtDate(d); }
  if (/今天/.test(s)) return fmtDate(today);
  const nextWeekM = s.match(/下\s*(?:个)?\s*周([一二三四五六日天])/);
  if (nextWeekM) {
    const t = (WEEKDAY_MAP[nextWeekM[1]] + 6) % 7;
    const monday = startOfWeekMonday(today);
    const d = new Date(monday);
    d.setDate(monday.getDate() + 7 + t);
    return fmtDate(d);
  }
  const thisWeekM = s.match(/(?:本|这)\s*(?:个)?\s*周([一二三四五六日天])/);
  if (thisWeekM) {
    const t = (WEEKDAY_MAP[thisWeekM[1]] + 6) % 7;
    const monday = startOfWeekMonday(today);
    const d = new Date(monday);
    d.setDate(monday.getDate() + t);
    return fmtDate(d);
  }
  const daysLaterM = s.match(/(\d+)\s*天(?:之)?后/);
  if (daysLaterM) { const d = new Date(today); d.setDate(d.getDate() + Number(daysLaterM[1])); return fmtDate(d); }
  const isoM = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoM) return `${isoM[1]}-${isoM[2].padStart(2, '0')}-${isoM[3].padStart(2, '0')}`;
  return null;
}
function dubaiNow() { return new Date(Date.now() + 4 * 3600 * 1000); }
const REF = dubaiNow();

// --- the 9 required sentences ---
const CASES = [
  {
    n: 1, text: '新建客户 SHADI，做咖啡机器人',
    expectActions: ['CREATE_CUSTOMER'],
  },
  {
    n: 2, text: '今天跟 SHADI 聊了咖啡机器人，下周一提醒我',
    expectActions: ['CREATE_FOLLOWUP', 'CREATE_TASK'],
    expectDateFor: { action: 'CREATE_TASK', date: parseRelativeDateZh('下周一', REF) },
  },
  {
    n: 3, text: '帮我建一个中国港湾的项目承包/劳工需求项目',
    expectActions: ['CREATE_PROJECT'],
  },
  {
    n: 4, text: '这几个合同我这周要处理，帮我收好',
    expectActions: ['STORE_DOCUMENT', 'CREATE_TASK'],
    expectHonestGap: { action: 'STORE_DOCUMENT', executable: false },
  },
  {
    n: 5, text: '记住，以后 Highway 劳务按26天每天10小时算',
    expectActions: ['BUSINESS_MEMORY_WRITE'],
  },
  {
    n: 6, text: 'Highway 劳务怎么算？',
    expectActions: ['BUSINESS_MEMORY_QUERY'],
  },
  {
    n: 7, text: '找 GCI 最新营业执照',
    expectActions: ['QUERY_DOCUMENT'],
  },
  {
    n: 8, text: '这件事完成了',
    expectActions: ['UPDATE_TASK'],
    context: { openTaskTitle: '跟进 SHADI 咖啡机器人报价' },
  },
  {
    n: 9, text: '帮我给这个客户准备劳工报价',
    expectActions: ['PREPARE_QUOTE'],
    context: { currentCustomerName: 'SHADI' },
  },
  {
    n: 10, text: '把这个链接存到公司资料 https://example.com/x.pdf',
    expectActions: ['STORE_DOCUMENT'],
  },
  {
    n: 11, text: '把这个Google Drive文件登记一下 https://drive.google.com/file/d/1oGZS6oxfh_8de9WPukiEAY594O6XLb_f/view',
    expectActions: ['STORE_DOCUMENT'],
  },
];

async function callOnce(text, context = {}) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_message: text, ...context }),
  });
  const data = await res.json();
  if (!data.ok) return { error: data.error || 'unknown error' };
  return { actions: data.actions || [] };
}

function actionSet(actions) {
  return [...new Set(actions.map((a) => a.action))].sort();
}

function setsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

async function runCase(c) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const r = await callOnce(c.text, c.context || {});
    runs.push(r);
  }

  if (runs.some((r) => r.error)) {
    return { pass: false, runs, reason: `endpoint error: ${runs.find((r) => r.error).error}` };
  }

  const sets = runs.map((r) => actionSet(r.actions));
  const expected = [...c.expectActions].sort();
  const allMatchExpected = sets.every((s) => setsEqual(s, expected));
  if (!allMatchExpected) {
    return { pass: false, runs, reason: `action set mismatch — expected [${expected.join(',')}], got runs [${sets.map((s) => `[${s.join(',')}]`).join(' | ')}]` };
  }

  if (c.expectDateFor) {
    const dates = runs.map((r) => {
      const a = r.actions.find((x) => x.action === c.expectDateFor.action);
      return a ? a.resolved_date : undefined;
    });
    const stable = dates.every((d) => d === dates[0]);
    const correct = dates[0] === c.expectDateFor.date;
    if (!stable || !correct) {
      return { pass: false, runs, reason: `date mismatch for ${c.expectDateFor.action} — expected ${c.expectDateFor.date}, got [${dates.join(', ')}]` };
    }
  }

  if (c.expectHonestGap) {
    const flags = runs.map((r) => {
      const a = r.actions.find((x) => x.action === c.expectHonestGap.action);
      return a ? { executable: a.executable, missing_context: a.missing_context } : undefined;
    });
    const ok = flags.every((f) => f && f.executable === c.expectHonestGap.executable && !!f.missing_context);
    if (!ok) {
      return { pass: false, runs, reason: `honesty check failed for ${c.expectHonestGap.action} — got [${JSON.stringify(flags)}]` };
    }
  }

  return { pass: true, runs };
}

async function main() {
  console.log(`Testing ${endpoint}\n`);
  let score = 0;
  const rows = [];
  for (const c of CASES) {
    const result = await runCase(c);
    if (result.pass) score += 1;
    rows.push({ n: c.n, text: c.text, pass: result.pass, reason: result.reason || '' });
    console.log(`[${result.pass ? 'PASS' : 'FAIL'}] #${c.n} ${c.text}${result.reason ? `\n       -> ${result.reason}` : ''}`);
  }
  console.log(`\nScore: ${score}/9`);
  process.exit(score >= 8 ? 0 : 1);
}

main().catch((e) => {
  console.error('Harness crashed:', e);
  process.exit(2);
});
