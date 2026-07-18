// ============================================================
// GCI Platform V2 — AI Capability Map
// ============================================================
// Single source of truth for every AI intent the workspace can handle.
// Each intent defines: triggers, target, data sources, status, and fallback.
//
// implementationStatus values:
//   real    — backed by live Supabase data, full read/write works
//   partial — table/service exists but AI routing not fully connected
//   mock    — UI flow exists but no real data read/write behind it
//   missing — data source not connected; must show clear "not connected" message
//
// IMPORTANT: For 'missing' intents, AIPage must NOT show "查询结果已准备".
// It must show the notConnectedMessage instead.

export type ImplementationStatus = 'real' | 'partial' | 'mock' | 'missing';
export type IntentCategory =
  | 'query'
  | 'action'
  | 'document'
  | 'workflow'
  | 'daily'
  | 'inbox'
  | 'finance'
  | 'customer';
export type AITab = 'chat' | 'assistant' | 'agent' | 'daily' | 'workflow' | 'inbox';

export interface AIIntent {
  intentId: string;
  intentNameZh: string;
  intentNameEn: string;
  category: IntentCategory;

  /** Chinese keyword fragments — any match triggers this intent */
  triggerKeywordsZh: string[];
  /** English keyword fragments (lowercase) */
  triggerKeywordsEn: string[];

  targetTab: AITab;
  targetModule: string;
  /** Deep-link route to open; empty string = stay on /ai */
  targetRoute: string;

  /** Supabase tables or services this intent reads from */
  readSources: string[];
  /** Supabase tables or services this intent writes to */
  writeTargets: string[];

  /** Fields the AI needs from the user to complete the action */
  requiredFields: string[];
  approvalRequired: boolean;

  /** React component name to render on match (null = use generic CommandPanel) */
  resultPanel: string | null;

  implementationStatus: ImplementationStatus;

  /** Shown when status is 'missing' — replaces fake "查询结果已准备" */
  notConnectedMessage?: string;

  /** What the system does when required data is absent */
  fallbackBehavior: string;
}

// ── Intent definitions ────────────────────────────────────────────────────────

export const AI_CAPABILITY_MAP: AIIntent[] = [

  // ── 1. Create Invoice Draft ────────────────────────────────────────────────
  {
    intentId: 'create_invoice_draft',
    intentNameZh: '创建发票草稿',
    intentNameEn: 'Create Invoice Draft',
    category: 'document',
    triggerKeywordsZh: ['开发票', '做一张发票', '生成发票', '开票', '做发票', '新建发票', '创建发票'],
    triggerKeywordsEn: ['invoice', 'tax invoice', 'create invoice', 'make invoice'],
    targetTab: 'assistant',
    targetModule: 'Invoice',
    targetRoute: '/invoice',
    readSources: ['invoice_billing_profiles'],
    writeTargets: ['invoice_drafts'],
    requiredFields: ['billing_profile_id', 'item_description', 'unit_price', 'qty', 'currency', 'vat_rate', 'due_date'],
    approvalRequired: true,
    resultPanel: 'InvoiceAssistantPanel',
    implementationStatus: 'real',
    fallbackBehavior: '打开发票向导，引导用户选择开票客户并填写发票明细。',
  },

  // ── 2. Save Billing Profile ────────────────────────────────────────────────
  {
    intentId: 'save_billing_profile',
    intentNameZh: '保存开票资料',
    intentNameEn: 'Save Billing Profile',
    category: 'action',
    triggerKeywordsZh: ['保存开票', '新增开票', '开票资料', '保存客户开票', '存起来', '客户税号', '存这个客户', '录入开票', 'billing profile', 'TRN'],
    triggerKeywordsEn: ['billing profile', 'save billing', 'trn', 'vat number', 'save customer'],
    targetTab: 'assistant',
    targetModule: 'Invoice',
    targetRoute: '/invoice',
    readSources: ['invoice_billing_profiles'],
    writeTargets: ['invoice_billing_profiles'],
    requiredFields: ['customer_name', 'billing_address'],
    approvalRequired: true,
    resultPanel: 'BillingProfileDraftPanel',
    implementationStatus: 'real',
    fallbackBehavior: '打开开票资料录入面板，支持粘贴原始文字自动识别字段。',
  },

  // ── 3. Check Follow-ups ────────────────────────────────────────────────────
  {
    intentId: 'check_followups',
    intentNameZh: '查询客户跟进',
    intentNameEn: 'Check Customer Follow-ups',
    category: 'query',
    triggerKeywordsZh: ['今天谁要跟进', '哪些客户要跟进', '谁没有跟进', '哪些客户没回复', '客户跟进', '跟进提醒', '今天跟进', '谁需要跟进', '跟进清单'],
    triggerKeywordsEn: ['follow up', 'followup', 'follow-up', 'who to contact', 'overdue follow'],
    targetTab: 'chat',
    targetModule: 'CRM',
    targetRoute: '/crm?tab=dashboard',
    readSources: ['Notion API (iCare Follow-up Log)', 'localStorage: ICARE_HISTORY_V1'],
    writeTargets: [],
    requiredFields: [],
    approvalRequired: false,
    resultPanel: null,
    implementationStatus: 'missing',
    notConnectedMessage: '客户跟进数据存储在 Notion（iCare 系统），AI Workspace 目前还未连接 Notion 数据源。\n\n请直接前往 CRM → 客户跟进 查看今日跟进清单。',
    fallbackBehavior: '显示"未连接"提示，引导用户前往 /crm?tab=dashboard 查看真实数据。',
  },

  // ── 4. Check Quotation Follow-ups ─────────────────────────────────────────
  {
    intentId: 'check_quotation_followups',
    intentNameZh: '查询报价跟进',
    intentNameEn: 'Check Quotation Follow-ups',
    category: 'query',
    triggerKeywordsZh: ['哪些报价没有回复', '报价跟进', '报价超时', '哪些报价需要跟进', '报价没跟进'],
    triggerKeywordsEn: ['quotation follow', 'quote follow', 'quote overdue', 'pending quote'],
    targetTab: 'chat',
    targetModule: 'Quotation',
    targetRoute: '/quotation?mode=customer-quote',
    readSources: ['quotation_records (Supabase)'],
    writeTargets: [],
    requiredFields: [],
    approvalRequired: false,
    resultPanel: null,
    implementationStatus: 'real',
    notConnectedMessage: '',
    fallbackBehavior: '直接显示待回复报价列表，超7天标红置顶。',
  },

  // ── 5. Create Customer Draft ───────────────────────────────────────────────
  {
    intentId: 'create_customer_draft',
    intentNameZh: '新增客户 / 线索',
    intentNameEn: 'Create Customer / Lead',
    category: 'customer',
    triggerKeywordsZh: ['创建客户', '新增客户', '保存客户', '新客户', '录入客户', '添加客户'],
    triggerKeywordsEn: ['new customer', 'create customer', 'add lead', 'new lead', 'add customer'],
    targetTab: 'assistant',
    targetModule: 'CRM',
    targetRoute: '/crm?tab=control',
    readSources: ['localStorage: ICARE_HISTORY_V1'],
    writeTargets: ['localStorage: ICARE_HISTORY_V1 (then Notion sync)'],
    requiredFields: ['clientName', 'phoneE164 or email', 'goal'],
    approvalRequired: true,
    resultPanel: null,
    implementationStatus: 'missing',
    notConnectedMessage: '客户档案存储在 iCare CRM 系统（Notion 同步），AI Workspace 暂未连接。\n\n请前往 CRM → 控制中心 手动新增客户。',
    fallbackBehavior: '显示"未连接"提示，引导用户前往 /crm?tab=control 新增客户。',
  },

  // ── 6. Check Inventory ─────────────────────────────────────────────────────
  {
    intentId: 'check_inventory',
    intentNameZh: '查询库存',
    intentNameEn: 'Check Inventory',
    category: 'query',
    triggerKeywordsZh: ['库存', '查库存', '库存够不够', '哪些库存不足', '库存预警', '库存情况', '库存查询', '还有多少', '剩多少', '有没有货', '是否有货', '能不能出货', '可用库存', '缺货', '低库存', '有货吗', '有多少货', '还有货'],
    triggerKeywordsEn: ['inventory', 'stock', 'stock level', 'stock check', 'check stock', 'inventory alert', 'available stock', 'low stock', 'out of stock'],
    targetTab: 'chat',
    targetModule: 'Inventory',
    targetRoute: '/trade?tab=inventory',
    readSources: ['consignment_stock (Supabase)'],
    writeTargets: [],
    requiredFields: [],
    approvalRequired: false,
    resultPanel: null,
    implementationStatus: 'real',
    notConnectedMessage: '',
    fallbackBehavior: '直接显示库存汇总，低库存产品置顶标红。',
  },

  // ── 6b. Product Overview (price + stock + consignment + quotation history) ──
  {
    intentId: 'product_overview',
    intentNameZh: '产品查询',
    intentNameEn: 'Product Overview',
    category: 'query',
    triggerKeywordsZh: ['单价是多少', '以前报多少', '报过多少钱', '历史单价', '产品价格', '库存和价格', '现在多少钱', '这个产品', '建议报价', '成本价', '售价多少'],
    triggerKeywordsEn: ['product price', 'price history', 'item price', 'product overview', 'unit price', 'how much is'],
    targetTab: 'chat',
    targetModule: 'Trade',
    targetRoute: '/trade',
    readSources: ['PRODUCT_MASTER (Notion)', 'INVENTORY_DB (Notion)', 'consignment_stock (Supabase)', 'quotation_items + quotation_records (Supabase)'],
    writeTargets: [],
    requiredFields: [],
    approvalRequired: false,
    resultPanel: null,
    implementationStatus: 'real',
    notConnectedMessage: '',
    fallbackBehavior: '显示产品主库价格 + 库存数量 + 寄售批次 + 历史报价区间。价格仅供参考，最终报价需人工确认。',
  },

  // ── 7. Generate Daily Brief ────────────────────────────────────────────────
  {
    intentId: 'generate_daily_brief',
    intentNameZh: '生成今日简报',
    intentNameEn: 'Generate Daily Brief',
    category: 'daily',
    triggerKeywordsZh: ['生成今日简报', '今日重点', '今天有什么重点', '老板简报', '今天重点是什么', '今日简报', '日报'],
    triggerKeywordsEn: ['daily brief', 'morning brief', 'daily summary', 'today summary', 'boss report'],
    targetTab: 'daily',
    targetModule: 'AI Daily',
    targetRoute: '/ai?tab=daily',
    readSources: [
      'ICARE_HISTORY_V1 (CRM follow-ups)',
      'quotation_records (Supabase)',
      'invoice_drafts (Supabase)',
      'consignment_stock (Supabase)',
      'transactions (Supabase)',
    ],
    writeTargets: [],
    requiredFields: [],
    approvalRequired: false,
    resultPanel: null,
    implementationStatus: 'missing',
    notConnectedMessage: '今日简报需要汇总 CRM、报价、发票、库存、财务数据。各模块已有独立数据，但聚合引擎尚未构建。\n\n当前 AI Daily 页面为展示版。真实简报将在下一阶段开发。',
    fallbackBehavior: '切换到 AI Daily 标签页，显示静态展示布局并标注"数据未接入"。',
  },

  // ── 8. Classify Inbox Content ──────────────────────────────────────────────
  {
    intentId: 'classify_inbox_content',
    intentNameZh: '识别并分类内容',
    intentNameEn: 'Classify Inbox Content',
    category: 'inbox',
    triggerKeywordsZh: ['整理WhatsApp', '整理邮件', '识别PDF', '识别图片', '保存资料', '导入文件', '分析内容', '整理文件', '识别名片', '提取信息'],
    triggerKeywordsEn: ['whatsapp', 'classify', 'parse pdf', 'extract', 'inbox', 'analyze file', 'business card'],
    targetTab: 'inbox',
    targetModule: 'AI Inbox',
    targetRoute: '/ai?tab=inbox',
    readSources: ['user-pasted text / uploaded file'],
    writeTargets: ['depends on classification: invoice_billing_profiles / CRM / quotation_records'],
    requiredFields: ['raw_content'],
    approvalRequired: true,
    resultPanel: null,
    implementationStatus: 'mock',
    notConnectedMessage: 'AI Inbox 分类引擎（OCR / 文字识别 / AI 分类）尚未接入。\n\n当前为展示版，可粘贴文字查看界面，但不会真实写入数据。',
    fallbackBehavior: '切换到 AI Inbox 标签页，展示上传界面。提示用户当前为 Mock 模式。',
  },

  // ── 9. Create Quotation Draft ──────────────────────────────────────────────
  {
    intentId: 'create_quotation_draft',
    intentNameZh: '生成报价单草稿',
    intentNameEn: 'Create Quotation Draft',
    category: 'document',
    triggerKeywordsZh: ['生成报价单', '做报价', '帮我报价', '新建报价', '创建报价', '报价草稿'],
    triggerKeywordsEn: ['quotation', 'quote', 'create quote', 'make quote', 'boq', 'price list'],
    targetTab: 'assistant',
    targetModule: 'Quotation',
    targetRoute: '/quotation?mode=customer-quote',
    readSources: ['quotation_records (Supabase)', 'service_catalog_items (Supabase)'],
    writeTargets: ['quotation_records', 'quotation_items'],
    requiredFields: ['customer_name', 'items', 'currency'],
    approvalRequired: true,
    resultPanel: null,
    implementationStatus: 'partial',
    notConnectedMessage: '报价模块（quotation_records）数据真实存在，但 AI 向导尚未与报价表单连接。\n\n请前往 报价管理 手动创建报价。AI 创建报价向导将在下一期开发。',
    fallbackBehavior: '显示"部分接入"提示，附直接链接到报价模块。',
  },

  // ── 10. Payment / Invoice Follow-up ───────────────────────────────────────
  {
    intentId: 'payment_or_invoice_followup',
    intentNameZh: '查询应收款 / 催款',
    intentNameEn: 'Payment or Invoice Follow-up',
    category: 'finance',
    triggerKeywordsZh: ['谁欠款', '哪些发票没付款', '应收款', '催款', '应收账款', '欠款查询', '未付款'],
    triggerKeywordsEn: ['payment pending', 'invoice pending', 'outstanding', 'overdue payment', 'ar', 'accounts receivable'],
    targetTab: 'chat',
    targetModule: 'Finance',
    targetRoute: '/trade?tab=finance',
    readSources: ['invoice_drafts (Supabase)', 'payments (Supabase)'],
    writeTargets: [],
    requiredFields: [],
    approvalRequired: false,
    resultPanel: null,
    implementationStatus: 'partial',
    notConnectedMessage: '发票草稿（invoice_drafts）和付款记录（payments）均已存在，但 AI 汇总查询接口尚未接入。\n\n请前往 发票管理 或 财务 → Finance Ledger 查看应收款状态。',
    fallbackBehavior: '显示"部分接入"提示，附链接到 /invoice 和 /trade?tab=finance。',
  },

  // ── 11. Create PI / Proforma Invoice ──────────────────────────────────────
  {
    intentId: 'create_pi_draft',
    intentNameZh: '生成 PI / 形式发票',
    intentNameEn: 'Create PI / Proforma Invoice',
    category: 'document',
    triggerKeywordsZh: ['生成PI', '做PI', '形式发票', 'proforma', '订单确认', '创建PI', 'PI草稿'],
    triggerKeywordsEn: ['pi', 'proforma', 'pro forma', 'proforma invoice', 'create pi'],
    targetTab: 'assistant',
    targetModule: 'Trade',
    targetRoute: '/trade?tab=quote',
    readSources: ['quotes (Supabase)', 'quote_items (Supabase)'],
    writeTargets: ['quotes', 'quote_items'],
    requiredFields: ['customer_name', 'items', 'payment_terms', 'due_date'],
    approvalRequired: true,
    resultPanel: null,
    implementationStatus: 'partial',
    notConnectedMessage: 'PI 数据表（quotes）真实存在，但 AI 向导尚未与 PI 表单连接。\n\n请前往 贸易 → PI 报价 手动创建 PI。',
    fallbackBehavior: '显示"部分接入"提示，附直接链接到 /trade?tab=quote。',
  },

  // ── 13. Supplier Text Search ──────────────────────────────────────────────
  {
    intentId: 'search_suppliers_text',
    intentNameZh: '供应商搜索',
    intentNameEn: 'Supplier Text Search',
    category: 'query',
    triggerKeywordsZh: ['供应商', '哪家', '谁有', '谁能', '哪些供应商', '找供应商', '供货商', '厂家', '工厂', '谁做', '哪家公司做', '有没有供应'],
    triggerKeywordsEn: ['supplier', 'vendor', 'who has', 'find supplier', 'manufacturer', 'factory', 'which supplier', 'suppliers for'],
    targetTab: 'chat',
    targetModule: 'Suppliers',
    targetRoute: '/suppliers',
    readSources: ['suppliers', 'supplier_contacts', 'supplier_certifications', 'supplier_quotes', 'supplier_products'],
    writeTargets: [],
    requiredFields: [],
    approvalRequired: false,
    resultPanel: 'SupplierSearchResult',
    implementationStatus: 'real',
    fallbackBehavior: '按关键词、品类、国家搜索活跃供应商，展示匹配结果。',
  },

  // ── 12. Check Cashflow / Finance ──────────────────────────────────────────
  {
    intentId: 'check_cashflow',
    intentNameZh: '查询财务 / 现金流',
    intentNameEn: 'Check Finance / Cashflow',
    category: 'finance',
    triggerKeywordsZh: ['财务', '现金流', '今天利润', '账户余额', '收支情况', '财务状况', '应收应付'],
    triggerKeywordsEn: ['cashflow', 'cash flow', 'finance', 'profit', 'revenue', 'balance'],
    targetTab: 'chat',
    targetModule: 'Finance',
    targetRoute: '/trade?tab=cashflow',
    readSources: ['transactions (Supabase)', 'payments (Supabase)'],
    writeTargets: [],
    requiredFields: [],
    approvalRequired: false,
    resultPanel: null,
    implementationStatus: 'partial',
    notConnectedMessage: '财务数据（transactions / payments）已存在，但 AI 直接查询接口尚未接入。\n\n请前往 贸易 → 现金流 查看实时财务数据。',
    fallbackBehavior: '显示"部分接入"提示，附链接到 /trade?tab=cashflow。',
  },

];

// ── Exports ───────────────────────────────────────────────────────────────────

/** Lookup by intentId */
export function getIntentById(id: string): AIIntent | undefined {
  return AI_CAPABILITY_MAP.find(i => i.intentId === id);
}

/** All real intents */
export const REAL_INTENTS = AI_CAPABILITY_MAP.filter(i => i.implementationStatus === 'real');
/** All intents that should NOT show fake results */
export const NON_FAKE_INTENTS = AI_CAPABILITY_MAP.filter(
  i => i.implementationStatus === 'missing' || i.implementationStatus === 'mock',
);
