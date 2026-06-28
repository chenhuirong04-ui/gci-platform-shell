import Anthropic from "@anthropic-ai/sdk";
import { CMOResponse, FollowUpTask, AIInsights, Attachment } from "../types";

const SYSTEM_INSTRUCTION = `
你现在是 iCare 首席成交策略助理。你的任务是基于事实和附件内容生成最专业的跟进方案。

### 核心限制（CRITICAL）:
1. 必须严格遵守用户指定的立场：
   - [SELLER]：供应商，核心是成交、收款
   - [BUYER]：采购商，核心是压价、确认规格

2. 多模态分析：
   如果提供了附件（图片/截图），请识别其中的价格、数量、规格、客户语气和潜在需求。

3. 输出结构：
必须包含以下4个板块，并额外输出 JSON：

【中文确认版】
（写给用户看的中文逻辑说明）

【最终发送版（中英双语）】
（发送客户内容）

【建议动作】
（一句话建议）

【风险提示】
（一句话风险）

[AI_INSIGHTS_JSON]
{
  "realNeed": "",
  "priceSensitivity": "高/中/低",
  "priority": "A/B/C",
  "nextActionSuggestion": "",
  "extractedFacts": ""
}
`;

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export const generateTaskContent = async (
  task: Partial<FollowUpTask>,
  correction?: string
): Promise<CMOResponse> => {

  let promptText = `
立场：${task.myRole}
客户：${task.clientName}
跟进目标：${task.goal}
最近情况：${task.lastContext}
补充备注：${task.notes || "无"}
${correction ? `用户纠偏反馈：${correction}` : ""}

请根据以上事实和附件内容，生成专业话术。
`;

  const response = await anthropic.messages.create({
    model: "claude-3-sonnet-20240229",
    max_tokens: 2000,
    temperature: 0.7,
    system: SYSTEM_INSTRUCTION,
    messages: [
      {
        role: "user",
        content: promptText,
      },
    ],
  });

  const text = response.content[0].text || "";

  return parseResponse(text);
};

function parseResponse(text: string): CMOResponse {
  const zhMatch = text.match(/【中文确认版】([\s\S]*?)【最终发送版/);
  const finalMatch = text.match(/【最终发送版（中英双语）】([\s\S]*?)【建议动作】/);
  const actionMatch = text.match(/【建议动作】([\s\S]*?)【风险提示】/);
  const riskMatch = text.match(/【风险提示】([\s\S]*?)\[AI_INSIGHTS_JSON\]/);
  const jsonMatch = text.match(/\[AI_INSIGHTS_JSON\]([\s\S]*)/);

  let insights: AIInsights = {
    realNeed: "",
    priceSensitivity: "",
    priority: "",
    nextActionSuggestion: "",
    extractedFacts: "",
  };

  if (jsonMatch) {
    try {
      insights = JSON.parse(jsonMatch[1]);
    } catch (e) {}
  }

  return {
    zhSummary: zhMatch?.[1]?.trim() || "",
    finalReply: finalMatch?.[1]?.trim() || "",
    nextAction: actionMatch?.[1]?.trim() || "",
    risk: riskMatch?.[1]?.trim() || "",
    insights,
  };
}
