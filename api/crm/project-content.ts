// /api/crm/project-content?projectPageId=...
// Read-only: fetches a Business Master (🏗️ 项目客户库) Notion page's body
// blocks and extracts structured project-background fields (product,
// spec, quantity, parties, contract info, ...) using deterministic
// "label: value" keyword matching only — never AI, never a guess.
// GET only. Never writes to Notion, never touches Follow-up Log.
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function richTextToPlain(arr: any[] | undefined): string {
  if (!Array.isArray(arr)) return '';
  return arr.map((t: any) => t.plain_text ?? '').join('').trim();
}

interface ContentLike {
  contractNumber?: string; ownerCompany?: string; pmc?: string; consultant?: string;
  supervisor?: string; designer?: string; mainContractor?: string; productName?: string;
  productCategory?: string; quantity?: string; area?: string; unit?: string; material?: string;
  specification?: string; color?: string; finish?: string; scope?: string;
  submissionNumber?: string; approvalStatus?: string; deliveryRequirement?: string;
  technicalReference?: string;
  currentActions?: string[]; relatedFiles?: string[];
  rawSections?: Array<{ title: string; lines: string[] }>;
}

// Deterministic "label: value" (or "label - value") line matching only.
// Real Notion labels are rarely the bare keyword — "业主 (Employer):",
// "PMC/工程师:", "D&B主承包:" all carry a qualifier between the keyword and
// the colon (or, for D&B, a short prefix before it). Allow a short run of
// filler characters on both sides so the match still requires the keyword
// to anchor the line (not appear mid-sentence), without demanding an exact
// bare label.
function fieldRegex(keywords: string): RegExp {
  return new RegExp(`^.{0,8}?(?:${keywords})[^:：]{0,15}[:：]\\s*(.+)$`, 'i');
}

// Bilingual keyword aliases, checked most-specific first. First match wins
// per field — never overwritten by a later, weaker match.
const FIELD_PATTERNS: Array<{ field: keyof ContentLike; re: RegExp }> = [
  { field: 'contractNumber', re: fieldRegex('合同编号|合同号|Contract\\s*No\\.?|Contract\\s*Number') },
  { field: 'submissionNumber', re: fieldRegex('材料提交单号|提交单号|Submission\\s*No\\.?') },
  { field: 'approvalStatus', re: fieldRegex('批准状态|审批状态|Approval\\s*Status') },
  { field: 'deliveryRequirement', re: fieldRegex('交付要求|交货要求|Delivery\\s*Requirement') },
  { field: 'ownerCompany', re: fieldRegex('业主|甲方|Client|Owner|Employer') },
  { field: 'pmc', re: fieldRegex('PMC') },
  { field: 'supervisor', re: fieldRegex('监理|Supervision|Supervisor') },
  { field: 'designer', re: fieldRegex('设计|Designer') },
  { field: 'consultant', re: fieldRegex('顾问|Consultant') },
  { field: 'mainContractor', re: fieldRegex('总包|总承包商?|主承包商?|Main\\s*Contractor') },
  { field: 'productCategory', re: fieldRegex('产品类别|产品类型|Product\\s*Category') },
  { field: 'productName', re: fieldRegex('产品|系统|Product|System') },
  { field: 'quantity', re: fieldRegex('数量|Quantity|Qty\\.?') },
  { field: 'area', re: fieldRegex('面积|Area') },
  // Checked before the bare "材料" pattern below — "材料参考号" is a document
  // reference number, not a material composition, and would otherwise be
  // wrongly captured as `material` (the generic keyword is a substring).
  { field: 'technicalReference', re: fieldRegex('材料参考号|图纸编号|技术文件编号|文件编号|参考号|Reference\\s*No\\.?|Drawing\\s*No\\.?|Document\\s*No\\.?') },
  { field: 'material', re: fieldRegex('材质|材料|Material') },
  { field: 'specification', re: fieldRegex('规格|Specification|Spec\\.?') },
  { field: 'color', re: fieldRegex('颜色|Colou?r') },
  { field: 'finish', re: fieldRegex('表面处理|Finish') },
  { field: 'scope', re: fieldRegex('项目范围|范围|Scope') },
];

// Assigns the first matching field from a "label: value" line. No-ops for
// prose lines that merely mention a keyword in passing — the anchored
// ^(filler)keyword(filler): pattern only fires on an actual short label.
function applyLineToContent(line: string, content: ContentLike): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  for (const { field, re } of FIELD_PATTERNS) {
    const m = trimmed.match(re);
    if (m && m[1] && !(content as any)[field]) {
      (content as any)[field] = m[1].trim();
      return;
    }
  }
}

function blockToLine(block: any): { isHeading: boolean; text: string } | null {
  switch (block.type) {
    case 'heading_1': return { isHeading: true, text: richTextToPlain(block.heading_1?.rich_text) };
    case 'heading_2': return { isHeading: true, text: richTextToPlain(block.heading_2?.rich_text) };
    case 'heading_3': return { isHeading: true, text: richTextToPlain(block.heading_3?.rich_text) };
    case 'paragraph': return { isHeading: false, text: richTextToPlain(block.paragraph?.rich_text) };
    case 'bulleted_list_item': return { isHeading: false, text: richTextToPlain(block.bulleted_list_item?.rich_text) };
    case 'numbered_list_item': return { isHeading: false, text: richTextToPlain(block.numbered_list_item?.rich_text) };
    case 'to_do': return { isHeading: false, text: richTextToPlain(block.to_do?.rich_text) };
    case 'quote': return { isHeading: false, text: richTextToPlain(block.quote?.rich_text) };
    case 'callout': return { isHeading: false, text: richTextToPlain(block.callout?.rich_text) };
    default: return null;
  }
}

// Paginated block-children fetch (has_more/next_cursor), capped defensively
// like the existing database-query loop in notion-sync.ts.
async function fetchBlockChildren(blockId: string, token: string): Promise<any[]> {
  const results: any[] = [];
  let cursor: string | undefined;
  let page = 0;
  while (page < 5) {
    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' },
    });
    if (!res.ok) break;
    const data = await res.json();
    results.push(...(data.results ?? []));
    if (!data.has_more) break;
    cursor = data.next_cursor;
    page++;
  }
  return results;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const url = new URL(request.url);
  const projectPageId = url.searchParams.get('projectPageId');
  if (!projectPageId) return json({ ok: false, error: 'missing_projectPageId' }, 400);

  const token = process.env.NOTION_TOKEN;
  if (!token) return json({ ok: false, error: 'missing_notion_token' }, 500);

  try {
    const topBlocks = await fetchBlockChildren(projectPageId, token);

    const sections: Array<{ title: string; lines: string[] }> = [{ title: '', lines: [] }];
    let current = sections[0];
    const content: ContentLike = {};

    for (const block of topBlocks) {
      // Tables don't inline their rows — table_row blocks are the table
      // block's own children, fetched only when this specific table is hit.
      if (block.type === 'table' && block.has_children) {
        const rows = await fetchBlockChildren(block.id, token);
        for (const row of rows) {
          if (row.type !== 'table_row') continue;
          const cells: string[] = (row.table_row?.cells ?? []).map((c: any[]) => richTextToPlain(c));
          if (cells.every(c => !c)) continue;
          if (cells.length === 2 && cells[0] && cells[1]) {
            const line = `${cells[0]}: ${cells[1]}`;
            applyLineToContent(line, content);
            current.lines.push(line);
          } else {
            current.lines.push(cells.filter(Boolean).join(' | '));
          }
        }
        continue;
      }
      const parsed = blockToLine(block);
      if (!parsed || !parsed.text) continue;
      if (parsed.isHeading) {
        // Headings sometimes carry the field directly (e.g. a heading
        // literally titled "产品：扩张金属网吊顶") — extract before starting
        // the new section so the value isn't lost to section-grouping only.
        applyLineToContent(parsed.text, content);
        current = { title: parsed.text, lines: [] };
        sections.push(current);
      } else {
        applyLineToContent(parsed.text, content);
        current.lines.push(parsed.text);
      }
    }

    // 当前行动 / Action Items — the whole section's lines become one array,
    // never a single line guessed out of unrelated prose.
    const actionSection = sections.find(s => /当前行动|Action\s*Items?/i.test(s.title));
    if (actionSection && actionSection.lines.length > 0) {
      content.currentActions = actionSection.lines.filter(Boolean);
    }

    content.rawSections = sections.filter(s => s.lines.length > 0);

    return json({ ok: true, projectPageId, content, fetchedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[project-content] error:', e);
    return json({ ok: false, error: 'fetch_failed' }, 500);
  }
}
