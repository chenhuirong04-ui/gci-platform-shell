// Quotation draft status wording for the AI agent.
// Before the user clicks "确认并保存草稿" nothing is saved, so a reply that
// carries a proposal must never claim the draft was submitted/created/saved.
// The model is told this in the prompt; this is the deterministic backstop.

export const DRAFT_PREVIEW_NOTICE_ZH = '报价草稿预览，尚未保存。';
export const DRAFT_PREVIEW_NOTICE_EN = 'Quotation draft preview — not saved yet.';

const MISLEADING_ZH = /(?:已经|已)(?:成功)?(?:为您|为你)?(?:提交|创建|保存|生成并保存|生成并提交|录入|发送|发出|建立)(?:成功)?/g;
const MISLEADING_EN = /\b(?:has been|have been|was|were|is now|successfully)\s+(?:submitted|created|saved|sent|recorded)\b/gi;

export function previewSafeReply(reply: string): string {
  const zh = /[一-鿿]/.test(reply);
  let text = reply.replace(MISLEADING_ZH, '尚未保存').replace(MISLEADING_EN, 'is not saved yet');
  const notice = zh ? DRAFT_PREVIEW_NOTICE_ZH : DRAFT_PREVIEW_NOTICE_EN;
  if (!text.includes(notice)) text = `${notice}\n${text}`.trim();
  return text;
}
