import type { FollowUpTask } from '../types';

const history = (id: string, entries: Array<[string, string]>) =>
  entries.map(([timestamp, message], index) => ({
    id: `${id}-LOG-${index + 1}`,
    timestamp,
    type: 'CORRECTED' as const,
    message,
  }));

export const DEMO_LEADS: FollowUpTask[] = [
  {
    id: 'DEMO-001', leadId: 'DEMO-LEAD-001', businessId: 'DEMO-001',
    clientName: 'Aurora Workspace', phoneE164: '', whatsapp: '', email: '',
    contactKey: 'demo-aurora', countryCity: 'UAE / Dubai', owner: 'Maya', myRole: 'SELLER',
    goal: '确认办公空间数字化需求并安排产品演示',
    lastContext: '客户已完成初步需求访谈，希望本周查看移动端执行看板。',
    businessType: 'PROJECT', status: 'todo', tradeStatus: '需求整理中', priority: 'A',
    nextFollowUpAt: '2026-07-12T09:00:00+04:00', createdAt: '2026-07-02T10:00:00+04:00', updatedAt: '2026-07-11T15:20:00+04:00',
    suggestedAction: '发送演示议程并确认周一上午的线上会议。', riskNotice: '关键决策人尚未参加需求确认。',
    aiInsights: { realNeed: '跨部门任务透明化与移动审批', priceSensitivity: '中', priority: 'A', nextActionSuggestion: '邀请运营负责人共同参加演示', extractedFacts: '约45人团队，计划第三季度上线' },
    attachments: [], history: history('AUR', [
      ['2026-07-11T15:20:00+04:00', '视频会议完成需求梳理，客户重点关注负责人和下一步动作。'],
      ['2026-07-08T11:00:00+04:00', '邮件确认团队规模与当前协作流程。'],
      ['2026-07-02T10:00:00+04:00', '通过公开活动提交咨询，已完成首次联系。'],
    ]),
  },
  {
    id: 'DEMO-002', leadId: 'DEMO-LEAD-002', businessId: 'DEMO-002',
    clientName: 'Cedar Hospitality Lab', phoneE164: '', whatsapp: '', email: '',
    contactKey: 'demo-cedar', countryCity: 'UAE / Abu Dhabi', owner: 'Leo', myRole: 'SELLER',
    goal: '确认三家门店试点范围', lastContext: '运营团队已认可试点方案，等待管理层确认会议时间。',
    businessType: 'PROJECT', status: 'todo', tradeStatus: '已报价待确认', priority: 'A',
    nextFollowUpAt: '2026-07-10T14:00:00+04:00', createdAt: '2026-06-20T09:30:00+04:00', updatedAt: '2026-07-09T16:00:00+04:00',
    suggestedAction: '向管理层发送一页式试点摘要并约定确认时间。', riskNotice: '跟进日期已超期两天。',
    aiInsights: { realNeed: '多门店执行标准统一', priceSensitivity: '低', priority: 'A', nextActionSuggestion: '以三店试点降低决策门槛', extractedFacts: '三家试点门店，重点关注巡检闭环' },
    attachments: [], history: history('CED', [
      ['2026-07-09T16:00:00+04:00', '发送试点范围说明，等待管理层确认。'],
      ['2026-07-05T13:40:00+04:00', '现场交流完成，运营团队认可执行看板。'],
      ['2026-06-20T09:30:00+04:00', '客户首次咨询门店任务管理。'],
    ]),
  },
  {
    id: 'DEMO-003', leadId: 'DEMO-LEAD-003', businessId: 'DEMO-003',
    clientName: 'Nova Technical Services', phoneE164: '', whatsapp: '', email: '',
    contactKey: 'demo-nova', countryCity: 'UAE / Sharjah', owner: 'Maya', myRole: 'SELLER',
    goal: '收集现场团队工作流并准备演示', lastContext: '客户已提供任务样例，需整理成演示场景。',
    businessType: 'PROJECT', status: 'todo', tradeStatus: '新询盘', priority: 'B',
    nextFollowUpAt: '2026-07-14T10:30:00+04:00', createdAt: '2026-07-10T12:00:00+04:00', updatedAt: '2026-07-11T12:30:00+04:00',
    suggestedAction: '整理任务样例并发送演示确认清单。',
    aiInsights: { realNeed: '现场任务与办公室信息同步', priceSensitivity: '高', priority: 'B', nextActionSuggestion: '先展示单项目轻量流程', extractedFacts: '约20名现场人员，使用手机为主' },
    attachments: [], history: history('NOV', [
      ['2026-07-11T12:30:00+04:00', '收到三条脱敏任务样例。'],
      ['2026-07-10T12:00:00+04:00', '完成首次电话沟通。'],
    ]),
  },
  {
    id: 'DEMO-004', leadId: 'DEMO-LEAD-004', businessId: 'DEMO-004',
    clientName: 'Palm Education Group', phoneE164: '', whatsapp: '', email: '',
    contactKey: 'demo-palm', countryCity: 'UAE / Dubai', owner: 'Nora', myRole: 'SELLER',
    goal: '安排校区管理团队复盘会议', lastContext: '客户希望重点查看跨校区待办和责任追踪。',
    businessType: 'PROJECT', status: 'todo', tradeStatus: '需求整理中', priority: 'B',
    nextFollowUpAt: '2026-07-13T15:00:00+04:00', createdAt: '2026-06-28T08:45:00+04:00', updatedAt: '2026-07-10T17:10:00+04:00',
    suggestedAction: '确认复盘会议参会人并发送功能清单。',
    aiInsights: { realNeed: '多校区责任追踪', priceSensitivity: '中', priority: 'B', nextActionSuggestion: '围绕超期事项设计演示', extractedFacts: '四个校区，管理者需要统一总览' },
    attachments: [], history: history('PAL', [
      ['2026-07-10T17:10:00+04:00', '客户确认重点关注超期事项与负责人。'],
      ['2026-07-03T10:15:00+04:00', '演示了客户总览概念。'],
      ['2026-06-28T08:45:00+04:00', '收到官网咨询。'],
    ]),
  },
  {
    id: 'DEMO-005', leadId: 'DEMO-LEAD-005', businessId: 'DEMO-005',
    clientName: 'Meridian Advisory', phoneE164: '', whatsapp: '', email: '',
    contactKey: 'demo-meridian', countryCity: 'Singapore', owner: 'Leo', myRole: 'SELLER',
    goal: '确认区域团队演示时间', lastContext: '客户正在内部比较现有表格流程与统一执行系统。',
    businessType: 'PROJECT', status: 'todo', tradeStatus: '已报价待确认', priority: 'C',
    nextFollowUpAt: '2026-07-16T11:00:00+04:00', createdAt: '2026-06-15T14:20:00+04:00', updatedAt: '2026-07-08T09:00:00+04:00',
    suggestedAction: '发送表格流程与统一系统的对比摘要。',
    aiInsights: { realNeed: '区域项目进度标准化', priceSensitivity: '高', priority: 'C', nextActionSuggestion: '突出减少人工汇报时间', extractedFacts: '跨三个市场协作，目前依赖共享表格' },
    attachments: [], history: history('MER', [
      ['2026-07-08T09:00:00+04:00', '客户要求补充管理者视角说明。'],
      ['2026-06-25T15:30:00+04:00', '完成第一轮在线演示。'],
      ['2026-06-15T14:20:00+04:00', '建立虚构演示客户档案。'],
    ]),
  },
  {
    id: 'DEMO-006', leadId: 'DEMO-LEAD-006', businessId: 'DEMO-006',
    clientName: 'Atlas Retail Studio', phoneE164: '', whatsapp: '', email: '',
    contactKey: 'demo-atlas', countryCity: 'UAE / Dubai', owner: 'Nora', myRole: 'SELLER',
    goal: '确认试用反馈和下一阶段范围', lastContext: '客户已完成内部试用，正在汇总团队反馈。',
    businessType: 'PROJECT', status: 'todo', tradeStatus: '合同待签', priority: 'A',
    nextFollowUpAt: '2026-07-12T16:00:00+04:00', createdAt: '2026-05-30T10:00:00+04:00', updatedAt: '2026-07-11T18:00:00+04:00',
    suggestedAction: '今天确认反馈清单并锁定下一阶段启动日期。',
    aiInsights: { realNeed: '门店行动闭环与总部可见性', priceSensitivity: '低', priority: 'A', nextActionSuggestion: '确认启动日期和负责人', extractedFacts: '试用反馈积极，等待最终范围确认' },
    attachments: [], history: history('ATL', [
      ['2026-07-11T18:00:00+04:00', '客户完成内部试用并开始收集团队反馈。'],
      ['2026-07-01T10:00:00+04:00', '试用环境启动。'],
      ['2026-05-30T10:00:00+04:00', '首次沟通门店执行需求。'],
    ]),
  },
];
