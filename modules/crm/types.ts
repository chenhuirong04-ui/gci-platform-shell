
export type RoleSide = 'SELLER' | 'BUYER';
export type TaskStatus = 'todo' | 'archived' | 'completed' | 'deleted';
export type ProjectType = '项目型' | '贸易型';
export type ProjectStatus = '进行中' | '暂停' | '已完成';
export type BusinessType = 'TRADE' | 'PROJECT' | 'LOG_ONLY';

// ── Canonical Action Statuses (Notion-aligned, 2026-05) ───────────────────────
// Source of truth: Notion 行动状态 field. DEAL reads this field directly.
// Never guess status from keywords/notes/goal text.
//
// 新询盘        → Block 4: 今日新增机会 (only if businessCreatedAt === today)
// 需求整理中    → Block 1: 今日必须推进
// 待报价        → Block 3: 等供应商报价/确认
// 已报价待确认  → Block 2: 等待客户审批; if overdue → Block 1
// 合同待签      → Block 2: 等待客户签合同; ACTIVE follow-up, NOT archived/closed
// 执行中        → 项目进展 tab only (not in ActionCenter)
// 已成交        → done/closed
// 暂缓          → paused; visible in kanban only, excluded from all Action blocks
// 已归档        → 历史归档
//
// If Notion 行动状态 is empty → display "待人工确认", no auto-classification
export type TradeStatus =
  | '新询盘' | '需求整理中' | '待报价' | '已报价待确认' | '合同待签' | '执行中' | '已成交' | '暂缓' | '已归档'
  | '待人工确认'
  // legacy values kept for stored-data compatibility (do not use in new records)
  | '已报价' | '等待确认'
  | '新建' | '跟进中' | '谈判中' | '已暂停' | '已关闭' | '寻价中' | '已发客户' | '已确认' | '已转订单'
  | 'New Inquiry' | 'Sourcing' | 'Quoted' | 'Sent' | 'Following' | 'Confirmed' | 'Converted';

export interface Attachment {
  id: string;
  name: string;
  type: string;
  data: string;       // base64，上传 Drive 成功后会被清空为 ""
  size: number;
  uploadedAt: string;
  isAnalyzed: boolean;
  driveUrl?: string;  // 上传到 Google Drive 后的可访问链接
}

export interface ProjectLogEntry {
  content: string;
  time: string;
  author: string;
  statusAfter?: TradeStatus;
  nextFollowUpAt?: string;
}

export interface Project {
  id: string;
  name: string;
  clientName: string;
  countryCity: string;
  contactKey: string;
  phoneE164?: string;
  whatsapp?: string;
  email?: string;
  type: ProjectType;
  owner: string;
  status: ProjectStatus;
  tradeStatus: TradeStatus;
  initialContext: string;
  projectFollowUps: ProjectLogEntry[];
  attachments: Attachment[];
  createdAt: string;
  nextActionAt?: string;
  deleted?: boolean;
  archivedAt?: string;
  importedHistorical?: boolean;
  businessCreatedAt?: string;
}

export interface FollowUpLog {
  id: string;
  timestamp: string;
  type: 'CREATED' | 'AI_GEN' | 'SENT' | 'REPLY_RCVD' | 'REMINDER_SENT' | 'REMINDER_FAILED' | 'CORRECTED' | 'FILE_ADDED';
  message: string;
  payload?: any;
}

export interface FollowUpTask {
  id: string;
  leadId: string;
  businessId?: string;
  clientName: string;
  phoneE164: string;
  whatsapp: string;
  email?: string;
  contactKey: string;
  countryCity: string;
  owner: string;
  myRole: RoleSide;
  goal: string;
  lastContext: string;
  businessType: BusinessType;
  relatedProjectId?: string;
  status: TaskStatus;
  tradeStatus: TradeStatus; 
  priority: 'A' | 'B' | 'C';
  nextFollowUpAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  draftZH?: string;
  finalBilingual?: string;
  suggestedAction?: string;
  riskNotice?: string;
  attachments: Attachment[];
  aiInsights?: AIInsights;
  history: FollowUpLog[];
  notes?: string;
  // 新增持久化业务字段
  inquirySummary?: string;
  categories?: string;
  lastNote?: string;
  // 历史档案标记（Notion 导入数据，不能进入"今日新增机会"）
  importedHistorical?: boolean;
  // 真实业务创建日期（区别于系统 createdAt）
  businessCreatedAt?: string;
  // Notion 同步来源标记
  // 'followup'      = 有真实 Follow-up Log 记录
  // 'contact_only'  = 孤儿记录（仅在 Projects/SB 档案中，无 Follow-up Log 条目），
  //                   nextFollowUpAt 默认设为今天，不得计入今日待跟进
  notionSource?: 'followup' | 'contact_only';
  // Notion Follow-up Log 页面 ID — 独立于 leadId，专用于 Notion 回写
  // 编辑时优先用此字段，通过 isLikelyNotionPageId() 校验后再调用 API
  notionFollowupPageId?: string;
}

export interface AIInsights {
  realNeed: string;
  priceSensitivity: '高' | '中' | '低';
  priority: 'A' | 'B' | 'C';
  nextActionSuggestion: string;
  extractedFacts: string;
}

export interface CMOResponse {
  draftZH: string;
  finalBilingual: string;
  suggestedAction: string;
  riskNotice: string;
  aiInsights?: AIInsights;
}

export type InternalTaskStatus = "待处理" | "进行中" | "等待他人" | "已完成";
export type InternalTaskCategory = "财务" | "采购" | "销售" | "行政" | "系统";

export interface InternalTaskProgressLog {
  timestamp: string;
  content: string;
  author: string;
}

export interface InternalTask {
  id: string;
  title: string;
  category: InternalTaskCategory;
  owner: string;
  dueDate: string;
  status: InternalTaskStatus;
  description?: string;
  blocker?: string;
  logs: InternalTaskProgressLog[];
  createdAt: string;
}

export interface StrategyInsight {
  painPoints: { cn: string; en: string };
  differentiation: { cn: string; en: string };
  actionPlan: { cn: string; en: string };
}

export interface VisualGuide {
  adviceCn: string;
  promptEn: string;
}

export interface SocialContent {
  linkedin: { contentEn: string; contentCn: string; hashtags: string[]; visual: VisualGuide };
  instagram: { contentEn: string; contentCn: string; hashtags: string[]; visual: VisualGuide };
  facebook: { contentEn: string; contentCn: string; hashtags: string[]; visual: VisualGuide };
  tiktok: { hookEn: string; hookCn: string; scriptEn: string; scriptCn: string; visual: VisualGuide };
}

export interface BulkSegment {
  segmentName: string;
  countEstimation: string;
  painPoint: string;
  strategy: string;
  visuals: VisualGuide;
  contentType: 'SCRIPT' | 'EMAIL' | 'POST';
  contentDraft: string;
}

export interface BulkAnalysisData {
  overallSummary: string;
  segments: BulkSegment[];
}

export interface ABMClient {
  grade: 'A' | 'B' | 'C';
  clientName: string;
  masterId: string;
  product: string;
  contact: string;
}

export interface ABMResponseData {
  clients: ABMClient[];
}

export interface ScreeningResult {
  totalInputLines: number;
  gradeACount: number;
  gradeBCount: number;
  discardCount: number;
  summaryCn: string;
}

export interface FollowUpLead {
  id: string;
  name: string;
  status: 'TODO' | 'WAITING' | 'PAUSED' | 'ARCHIVED';
  nextFollowupAt: string;
  productInterest: string;
  escalation?: boolean;
}

export interface SystemAudit {
  totalLeadsCreated: number;
  leadsToday: number;
  archivedCount: number;
  lastCreatedLeadId: string;
}

export interface LeadMaster {
  id: string;
  source: string;
  processingStatus: 'COMPLETED' | 'FAILED' | 'PROCESSING';
  clientName?: string;
  rawInputText?: string;
  createdAt: string;
  product?: string;
}

export interface ProjectFollowUp {
  projectId: string;
  timestamp: string;
  method: string;
  stage: string;
  content: string;
  isBlocked: boolean;
  blockingPoint?: string;
  nextAction: string;
  nextFollowUpAt: string;
}
