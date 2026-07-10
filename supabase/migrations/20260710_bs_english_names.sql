-- GCI Business Solutions — Populate English Names
-- Safe to re-run (UPDATE WHERE name_en IS NULL OR name_en = '')
-- Run in Supabase SQL Editor

-- ── 1. Service Categories ──────────────────────────────────────────────────────
UPDATE service_categories SET name_en = 'Corporate Services'
  WHERE name_cn = '企业服务' AND (name_en IS NULL OR name_en = '');

UPDATE service_categories SET name_en = 'Market Entry & Business Development'
  WHERE name_cn = '市场进入与商务拓展' AND (name_en IS NULL OR name_en = '');

UPDATE service_categories SET name_en = 'Project Services'
  WHERE name_cn = '项目服务' AND (name_en IS NULL OR name_en = '');

UPDATE service_categories SET name_en = 'Overseas Warehouse & Logistics'
  WHERE name_cn = '海外仓与物流服务' AND (name_en IS NULL OR name_en = '');

UPDATE service_categories SET name_en = 'Supply Chain Services'
  WHERE name_cn = '供应链服务' AND (name_en IS NULL OR name_en = '');

UPDATE service_categories SET name_en = 'AI & Digital Solutions'
  WHERE name_cn = 'AI数字化解决方案' AND (name_en IS NULL OR name_en = '');

-- ── 2. Corporate Services Items ────────────────────────────────────────────────
UPDATE service_catalog_items SET name_en = 'Company Registration'          WHERE name_cn = '公司注册'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Free Zone Company Registration' WHERE name_cn = '自贸区公司注册'  AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Mainland Company Registration'  WHERE name_cn = '非自贸区公司注册' AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'License Renewal'               WHERE name_cn = '公司续牌'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Company Amendment'             WHERE name_cn = '公司变更'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Company Transfer'              WHERE name_cn = '公司转让'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Company Deregistration'        WHERE name_cn = '公司注销'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Investor Visa'                 WHERE name_cn = '投资签证'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Work Visa'                     WHERE name_cn = '工作签证'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Family Visa'                   WHERE name_cn = '家庭签证'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Golden Visa'                   WHERE name_cn = '黄金签证'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Bank Account Opening'          WHERE name_cn = '银行开户'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'VAT Registration'              WHERE name_cn = 'VAT注册'        AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'VAT Filing'                    WHERE name_cn = 'VAT申报'        AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Corporate Tax Registration'    WHERE name_cn = '企业所得税注册'  AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Corporate Tax Filing'          WHERE name_cn = '企业所得税申报'  AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Bookkeeping Service'           WHERE name_cn = '记账服务'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Audit Service'                 WHERE name_cn = '审计服务'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Compliance Service'            WHERE name_cn = '合规服务'       AND (name_en IS NULL OR name_en = '');

-- ── 3. Market Entry Items ──────────────────────────────────────────────────────
UPDATE service_catalog_items SET name_en = 'Market Research'               WHERE name_cn = '市场调研'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Market Entry Strategy'         WHERE name_cn = '市场进入方案'   AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Distributor Development'       WHERE name_cn = '经销商开发'     AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Partner Sourcing'              WHERE name_cn = '合作伙伴寻找'   AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Customer Development'          WHERE name_cn = '客户开发'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Business Matchmaking'          WHERE name_cn = '商务对接'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Business Trip Arrangement'     WHERE name_cn = '商务考察'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Exhibition Support'            WHERE name_cn = '展会支持'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Government Liaison'            WHERE name_cn = '政府资源协调'   AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Business Representative Service' WHERE name_cn = '商业代表服务' AND (name_en IS NULL OR name_en = '');

-- ── 4. Project Services Items ──────────────────────────────────────────────────
UPDATE service_catalog_items SET name_en = 'Land Sourcing'                 WHERE name_cn = '土地寻找'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Factory Sourcing'              WHERE name_cn = '厂房寻找'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Warehouse Sourcing'            WHERE name_cn = '仓库寻找'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Office Sourcing'               WHERE name_cn = '办公室寻找'     AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Industrial Park Liaison'       WHERE name_cn = '工业园区对接'   AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'EPC Project Coordination'      WHERE name_cn = 'EPC项目协调'    AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'FF&E Project Coordination'     WHERE name_cn = 'FF&E项目协调'   AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Project Execution Coordination' WHERE name_cn = '项目执行协调'  AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Procurement Coordination'      WHERE name_cn = '采购协调'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Engineering Coordination'      WHERE name_cn = '工程协调'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Site Visit Arrangement'        WHERE name_cn = '现场考察安排'   AND (name_en IS NULL OR name_en = '');

-- ── 5. Overseas Warehouse & Logistics Items ────────────────────────────────────
UPDATE service_catalog_items SET name_en = 'Overseas Warehouse Service'    WHERE name_cn = '海外仓服务'     AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Shared Warehouse Service'      WHERE name_cn = '共享仓服务'     AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Dedicated Warehouse Service'   WHERE name_cn = '独立仓服务'     AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Temporary Storage'             WHERE name_cn = '临时仓储'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Long-term Storage'             WHERE name_cn = '长期仓储'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Receiving & Inspection'        WHERE name_cn = '收货验货'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Consolidation Service'         WHERE name_cn = '集货服务'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Sorting Service'               WHERE name_cn = '分拣服务'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Packing Service'               WHERE name_cn = '打包服务'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Labeling Service'              WHERE name_cn = '贴标服务'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Repackaging Service'           WHERE name_cn = '换包装服务'     AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Inventory Management'          WHERE name_cn = '库存管理'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Local Delivery Coordination'   WHERE name_cn = '本地配送协调'   AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'GCC Transshipment Coordination' WHERE name_cn = 'GCC转运协调'   AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Reverse Logistics'             WHERE name_cn = '逆向物流'       AND (name_en IS NULL OR name_en = '');

-- ── 6. Supply Chain Services Items ────────────────────────────────────────────
UPDATE service_catalog_items SET name_en = 'Supplier Development'          WHERE name_cn = '供应商开发'     AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Factory Audit'                 WHERE name_cn = '工厂审核'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Product Sourcing'              WHERE name_cn = '产品采购'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Procurement Management'        WHERE name_cn = '采购管理'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Quality Inspection'            WHERE name_cn = '验货服务'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Quality Control Service'       WHERE name_cn = '品控服务'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Export Coordination'           WHERE name_cn = '出口协调'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Logistics Coordination'        WHERE name_cn = '物流协调'       AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Supplier Management'           WHERE name_cn = '供应商管理'     AND (name_en IS NULL OR name_en = '');

-- ── 7. AI & Digital Solutions Items ───────────────────────────────────────────
UPDATE service_catalog_items SET name_en = 'AI Workflow Design'            WHERE name_cn = 'AI工作流设计'   AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'CRM System Setup'              WHERE name_cn = 'CRM系统搭建'    AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Dashboard System Setup'        WHERE name_cn = 'Dashboard系统搭建' AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Enterprise Automation'         WHERE name_cn = '企业自动化流程'  AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'AI Agent Development'          WHERE name_cn = 'AI Agent开发'   AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Business Intelligence System'  WHERE name_cn = '商业智能系统'   AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Quotation System Development'  WHERE name_cn = '报价系统开发'   AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Digital Transformation Consulting' WHERE name_cn = '企业数字化转型咨询' AND (name_en IS NULL OR name_en = '');
UPDATE service_catalog_items SET name_en = 'Custom Software Development'   WHERE name_cn = '定制软件开发'   AND (name_en IS NULL OR name_en = '');

-- ── Verify result ──────────────────────────────────────────────────────────────
-- SELECT name_cn, name_en FROM service_categories ORDER BY sort_order;
-- SELECT name_cn, name_en FROM service_catalog_items WHERE name_en IS NULL OR name_en = '';
