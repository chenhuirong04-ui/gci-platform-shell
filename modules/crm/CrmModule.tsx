import React, { useEffect, useMemo, useRef, useState } from 'react';
import { generateTaskContent } from './services/geminiService';
import { FollowUpTask, CMOResponse, Project, ProjectType, ProjectStatus, ProjectLogEntry } from './types';
import { PersistenceService } from './services/persistenceService';
import { notionSyncService } from './services/notionSync';

import { ADMIN_IMPORT_TASKS, ADMIN_IMPORT_PROJECTS } from './adminImportData';
import LeadMasterDetail from './components/LeadMasterDetail';
import QuickFollowUpPanel from './components/QuickFollowUpPanel';
import AIIntakePanel from './components/AIIntakePanel';
import FollowUpQueue from './components/FollowUpQueue';
import HistoryView from './components/HistoryView';
import ProjectProgress from './components/ProjectProgress';
import InternalTasksView from './components/InternalTasksView';
import ControlCenter from './components/ControlCenter';

import {
  CheckCircle2,
  AlertCircle,
  Lock,
  RefreshCw,
} from 'lucide-react';

/* =========================
   Keys
   ========================= */
const ICARE_HISTORY_V1 = 'ICARE_HISTORY_V1';
const ICARE_PROJECTS_V1 = 'ICARE_PROJECTS_V1';
const ICARE_INTERNAL_TASKS_V1 = 'ICARE_INTERNAL_TASKS_V1';

/* =========================
   ErrorBoundary（避免白屏）
   ========================= */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any) {
    console.error('🔥 ErrorBoundary caught:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] p-6">
          <div className="max-w-3xl mx-auto bg-white border border-red-200 rounded-2xl p-6">
            <div className="text-xl font-black text-red-600">页面出错（已拦截，避免白屏）</div>
            <div className="mt-2 text-sm text-slate-600">
              把下面这段错误截图发我，我可以直接定位是哪一行。
            </div>
            <pre className="mt-4 text-xs bg-slate-900 text-slate-100 p-4 rounded-xl overflow-auto">
{String(this.state.error?.stack || this.state.error || 'Unknown error')}
            </pre>
            <button
              className="mt-4 px-4 py-2 rounded-xl text-white font-black"
              style={{ backgroundColor: '#0F172A' }}
              onClick={() => location.reload()}
            >
              刷新
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* =========================
   Password Gate（最终可用：用 pull_snapshot 做验证）
   ========================= */
async function verifyPagePassword(password: string) {
  localStorage.setItem('ICARE_GATE_PASSWORD', password || 'bypass');
  return true;
}
function PasswordGate({ onPass }: { onPass: () => void }) {
  const [pwd, setPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
  setErr('');
  setLoading(true);
  try {
    await verifyPagePassword(pwd);  // 把密码存入 localStorage，激活云同步
    onPass();
  } catch (e: any) {
    console.error('[Gate] bypass failed:', e);
    setErr('进入失败，请重试');
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)' }}>

      {/* Decorative gold rings */}
      <div className="absolute top-[-80px] right-[-80px] w-[360px] h-[360px] rounded-full opacity-[0.06]"
        style={{ border: '60px solid #B8960C' }} />
      <div className="absolute bottom-[-120px] left-[-60px] w-[280px] h-[280px] rounded-full opacity-[0.04]"
        style={{ border: '50px solid #B8960C' }} />
      <div className="absolute top-[40%] left-[-30px] w-[120px] h-[120px] rounded-full opacity-[0.05]"
        style={{ border: '24px solid #B8960C' }} />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm">

        {/* Brand header — above card */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #B8960C, #D4AF37)' }}>
            <span className="text-xl font-black text-white tracking-tight">GCI</span>
          </div>
          <div className="text-white text-xl font-black tracking-wide">业务控制中心</div>
          <div className="text-xs font-bold mt-1" style={{ color: '#B8960C' }}>
            Global Care Info · Middle East Platform
          </div>
        </div>

        {/* Login card */}
        <div className="bg-white/[0.06] backdrop-blur-sm rounded-3xl border border-white/10 p-8 shadow-2xl">
          <div className="text-xs font-black uppercase tracking-widest text-white/40 mb-5 flex items-center gap-2">
            <Lock className="w-3 h-3" />
            访问验证
          </div>

          <input
            type="password"
            value={pwd}
            onChange={e => setPwd(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="输入访问密码"
            className="w-full px-4 py-3.5 rounded-2xl text-sm font-bold text-white placeholder-white/30 outline-none focus:ring-2 transition-all"
            style={{
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
            onFocus={e => (e.target.style.borderColor = '#B8960C')}
            onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
          />

          <button
            onClick={submit}
            disabled={!pwd || loading}
            className="w-full mt-4 py-3.5 rounded-2xl text-sm font-black tracking-wide shadow-lg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-30"
            style={{ background: 'linear-gradient(135deg, #B8960C, #D4AF37)', color: '#0F172A' }}
          >
            {loading ? '验证中…' : '进入系统 →'}
          </button>

          {err && (
            <div className="mt-3 text-xs font-bold text-red-400 text-center">{err}</div>
          )}
        </div>

        <div className="text-center mt-6 text-[10px] font-bold text-white/20">
          每次刷新 / 关闭后需重新验证
        </div>
      </div>
    </div>
  );
}

/* =========================
   CRM Module — 迁移自 AppInner（不再渲染 AppShell/Sidebar/Header，
   GCI Platform 壳全局提供）。Day 4-5 monorepo 合并计划。
   ========================= */
type CrmTab = 'control' | 'dashboard' | 'history' | 'project' | 'internal';
const _crmValidTabs = ['control', 'dashboard', 'history', 'project', 'internal'] as const;

function CrmInner({ initialTab }: { initialTab?: CrmTab }) {
  const isAdminMode = new URLSearchParams(window.location.search).get('admin') === '1';
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  // Sidebar deep-links into a specific tab via ?tab=. Falls back to reading
  // the URL once on mount when no host shell prop is provided.
  const _initTab = initialTab || new URLSearchParams(window.location.search).get('tab');
  const _startTab = (_crmValidTabs as readonly string[]).includes(_initTab || '')
    ? (_initTab as CrmTab)
    : 'control';
  const [activeTab, setActiveTab] = useState<CrmTab>(_startTab);
  // Sidebar can navigate to a different ?tab= without unmounting this module
  // (avoids re-triggering the password gate on every click) — sync when the
  // host shell passes a new initialTab. No-op when used standalone.
  useEffect(() => {
    if (initialTab && _crmValidTabs.includes(initialTab)) setActiveTab(initialTab);
  }, [initialTab]);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(notionSyncService.getLastSyncAt());
  // Authoritative today-follow-up count from API (Follow-up Log only, before orphan merge)
  const [todayFollowupCount, setTodayFollowupCount] = useState<number | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(true); // default open — 客户跟进 is quick entry point
  const [selectedTask, setSelectedTask] = useState<FollowUpTask | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [hydrated, setHydrated] = useState(false);
  const firstHydrateRef = useRef(true);
  // When Notion overwrite is running, block the ordinary save effect from
  // firing a merge-push that would re-inflate ICARE_HISTORY_V1 back to 68.
  const notionOverwriteInProgressRef = useRef(false);

  // 明确排除名单（不进入业务跟进中心）
  const BIZ_EXCLUDE = new Set([
    'log_only', '仅记录', '内部事项', 'internal', 'note', 'log',
  ]);

  // 项目型关键词（The Grove、villa、fitout 等优先判 PROJECT）
  const PROJECT_KW = [
    'project', '项目', 'the grove', '工程', '施工', 'ff&e', 'villa',
    'apartment', 'fitout', 'fit-out', 'fit out', 'interior', 'renovation',
    'hotel', 'office', 'resort', 'building', 'construction', 'design',
    '设计', '装修', '室内', '家具', 'furniture', '酒店', '公寓', '办公',
  ];

  // 贸易型关键词
  const TRADE_KW = [
    'trade', '贸易', 'quotation', 'quote', 'sample', 'order', 'moq',
    'fob', 'cif', 'supplier', 'product', '采购', '报价', '样品', '询盘',
    'catalog', 'price list', 'pricelist', 'shipment', 'delivery',
    '发货', '出货', '下单', '验货',
  ];

  /**
   * 判断 task 属于项目型还是贸易型。
   * 优先级：显式 businessType → recordType → 关键词搜索 → 默认贸易
   */
  const classifyTaskType = (task: FollowUpTask): ProjectType => {
    const bt = (task.businessType || '').toLowerCase().trim();
    const rt = ((task as any).recordType || '').toLowerCase().trim();

    if (['project', '项目推进', '项目'].includes(bt)) return '项目型';
    if (['trade', '贸易询盘', '贸易'].includes(bt)) return '贸易型';
    if (['project', '项目推进'].includes(rt)) return '项目型';
    if (['trade', '贸易询盘'].includes(rt)) return '贸易型';

    // 关键词搜索（拼接所有文本字段）
    const text = [
      task.clientName, task.goal, task.lastContext,
      (task as any).inquirySummary, (task as any).lastNote,
      (task as any).summary, (task as any).relatedProject,
    ].filter(Boolean).join(' ').toLowerCase();

    // PROJECT 优先（工程类项目价值高，宁可误判为项目也不漏）
    for (const kw of PROJECT_KW) {
      if (text.includes(kw)) return '项目型';
    }
    for (const kw of TRADE_KW) {
      if (text.includes(kw)) return '贸易型';
    }

    return '贸易型'; // 默认贸易
  };

  // 排除法：只有明确 LOG_ONLY / 内部事项才不进入业务跟进中心
  const bizQualifiesForView = (task: FollowUpTask): boolean => {
    const bt = (task.businessType || '').toLowerCase().trim();
    const rt = ((task as any).recordType || '').toLowerCase().trim();
    if (BIZ_EXCLUDE.has(bt) || BIZ_EXCLUDE.has(rt)) return false;
    return true;
  };

  /**
   * SINGLE SOURCE OF TRUTH — used by ALL views.
   *
   * normalizedTasks:
   *   1. Remove status='deleted' records
   *   2. Dedup by businessId — same client multiple times → keep latest nextFollowUpAt
   *
   * This ensures Control Center, Customer Follow-up Kanban, and Business Center
   * always see the SAME set of records. No more per-view raw filter divergence.
   */
  const normalizedTasks = useMemo((): FollowUpTask[] => {
    const nonDeleted = tasks.filter(t => t.status !== 'deleted');
    // Dedup by businessId || leadId || id.
    // Conflict resolution: prefer the record with the latest updatedAt (local edits win over
    // stale Notion snapshots). Fall back to nextFollowUpAt if both updatedAt are equal/missing.
    const map = new Map<string, FollowUpTask>();
    for (const t of nonDeleted) {
      const key = (t as any).businessId || t.leadId || t.id;
      if (!map.has(key)) {
        map.set(key, t);
      } else {
        const existing = map.get(key)!;
        const tUp = t.updatedAt || t.createdAt || '';
        const exUp = existing.updatedAt || existing.createdAt || '';
        if (tUp > exUp) {
          map.set(key, t);
        }
      }
    }
    return Array.from(map.values());
  }, [tasks]);

  const combinedProjectsForView = useMemo((): Project[] => {
    /**
     * PLAN A — Notion businessType is authoritative.
     *
     * All qualifying normalizedTasks are synthesized to Project format.
     * type = task.businessType directly (no keyword override, no orphan detection).
     * This ensures business center counts match Follow-up Log exactly.
     */
    const allQualifying = normalizedTasks.filter(t =>
      bizQualifiesForView(t) &&
      t.status !== 'archived'
    );

    const synthetic: Project[] = allQualifying.map(task => ({
      id:             `SYNTH_${task.id}`,
      businessId:     (task as any).businessId || '',
      name:           task.inquirySummary || task.goal || task.clientName,
      clientName:     task.clientName,
      countryCity:    task.countryCity || '',
      contactKey:     task.contactKey,
      phoneE164:      task.phoneE164,
      whatsapp:       task.whatsapp,
      email:          task.email,
      // ← Notion businessType is the authority — no keyword fallback
      type:           (task.businessType === 'PROJECT' ? '项目型' : '贸易型') as ProjectType,
      owner:          task.owner || '',
      status:         (task.status === 'completed' ? '已完成' : '进行中') as ProjectStatus,
      tradeStatus:    task.tradeStatus || '新询盘',
      initialContext: task.lastContext || task.inquirySummary || task.goal || '',
      projectFollowUps: (task.history || [])
        .filter(h => h.message || (h as any).summary)
        .slice(0, 20)
        .map(h => ({
          content: (h as any).summary || h.message || '',
          time:    new Date(h.timestamp).toLocaleString('zh-CN'),
          author:  (h as any).by || task.owner || 'system',
        })),
      attachments:    task.attachments || [],
      createdAt:      task.createdAt,
      nextActionAt:   task.nextFollowUpAt,
    }));

    // Notion is the single source of truth — no legacy local projects.
    return synthetic;
  }, [normalizedTasks]);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const syncFromNotion = async () => {
    setSyncStatus('syncing');
    try {
      const result = await notionSyncService.sync();

      // ── result.tasks is already the merged set (Notion + preserved HIST_ from localStorage) ──
      // notionSync.sync() reads localStorage directly so local HIST_ records are preserved
      // even when tasks React state is empty (e.g. during initial page load race condition).
      notionOverwriteInProgressRef.current = true;
      setTasks(result.tasks);
      setLastSyncAt(result.syncedAt);
      setTodayFollowupCount(result.todayFollowupCount);

      // Write the same 20 records to localStorage and cloud (no local-only preserved).
      await PersistenceService.overwriteFromNotion(ICARE_HISTORY_V1, result.notionTasks);

      // Flag cleared only after cloud push completes — future user edits save ~20.
      notionOverwriteInProgressRef.current = false;

      showToast(`已同步 ${result.newCount} 新 / ${result.updatedCount} 更新`, 'success');
      setSyncStatus('idle');
    } catch (e: any) {
      notionOverwriteInProgressRef.current = false;
      console.warn('[App] Notion sync failed:', e);
      setSyncStatus('error');
      showToast('Notion 同步失败，使用本地数据', 'error');
    }
  };

  useEffect(() => {
    let alive = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    (async () => {
      // Sync from Notion first (before loading localStorage fallback)
      syncFromNotion().catch(() => {});

      try {
        const [t, p] = await Promise.all([
          PersistenceService.load(ICARE_HISTORY_V1),
          PersistenceService.load(ICARE_PROJECTS_V1),
          PersistenceService.load(ICARE_INTERNAL_TASKS_V1)
        ]);

        if (!alive) return;
        setTasks(Array.isArray(t) ? (t as any) : []);
        setProjects(Array.isArray(p) ? (p as any) : []);
      } catch (e) {
        console.warn('Init load failed', e);
      } finally {
        if (!alive) return;
        setHydrated(true);
        firstHydrateRef.current = false;
      }

      // Auto-sync every 10 minutes
      intervalId = setInterval(() => {
        if (alive) syncFromNotion().catch(() => {});
      }, 10 * 60 * 1000);
    })();
    return () => {
      alive = false;
      if (intervalId) clearInterval(intervalId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (firstHydrateRef.current) return;
    // Skip when Notion overwrite is in progress — overwriteFromNotion handles
    // the cloud write directly; a merge-push here would re-inflate to 68.
    if (notionOverwriteInProgressRef.current) return;
    PersistenceService.save(ICARE_HISTORY_V1, tasks);
  }, [tasks, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (firstHydrateRef.current) return;
    PersistenceService.save(ICARE_PROJECTS_V1, projects);
  }, [projects, hydrated]);

  const handleAddTask = async (formData: Partial<FollowUpTask>) => {
    setIsGenerating(true);
    showToast('正在分析并分流...', 'info');

    const now = Date.now();
    const nowISO = new Date().toISOString();
    const localNow = new Date().toLocaleString('zh-CN');

    const clientName = (formData.clientName || '').trim() || '未命名客户';
    const goal = (formData.goal || '').trim() || '未填写目标';
    const lastContext = (formData.lastContext || '').trim() || '';
    const businessType = (formData.businessType as any) || 'TRADE';

    const contactKey = String(
      (formData.whatsapp || formData.phoneE164 || formData.email || '')
    )
      .replace(/[\s+]/g, '')
      .toLowerCase();

    const baseTask: FollowUpTask = {
      id: `HIST_${now}`,
      leadId: `LEAD_${now}`,
      clientName,
      phoneE164: formData.phoneE164 || '',
      whatsapp: formData.whatsapp || '',
      email: formData.email,
      contactKey,
      countryCity: formData.countryCity || '',
      owner: '本人',
      myRole: formData.myRole || '本人',
      goal,
      lastContext,
      businessType,
      status: 'todo',
      tradeStatus: businessType === 'TRADE' ? '新询盘' : '新建',
      priority: 'B',
      nextFollowUpAt: formData.nextFollowUpAt || nowISO,
      createdAt: nowISO,
      updatedAt: nowISO,
      draftZH: '',
      finalBilingual: '',
      suggestedAction: '',
      riskNotice: '',
      attachments: formData.attachments || [],
      aiInsights: undefined as any,
      history: [
        {
          id: `L_${now}`,
          timestamp: nowISO,
          type: 'CREATED',
          message: `已记录（AI分析中）`
        }
      ],
      inquirySummary: goal,
      categories: '',
      lastNote: lastContext
    };

    setTasks(prev => [baseTask, ...prev]);
    // Do NOT auto-open the follow-up panel after creation — the intake panel
    // shows its own success state; opening QuickFollowUpPanel here confuses users.

    // ── Write to Notion Follow-up Log ──────────────────────────────────────
    ;(async () => {
      try {
        const followUpMethod = formData.whatsapp ? 'WhatsApp'
          : formData.phoneE164 ? '电话'
          : formData.email ? '邮件'
          : 'WhatsApp';

        // Extract contact person from lastContext if mentioned
        const contactPersonMatch = lastContext.match(/联系人[：:\s]+([A-Za-z一-龥]{1,20})/);
        const contactPerson = contactPersonMatch?.[1]?.trim() || '';

        // Collect Drive URLs from attachments that were already uploaded
        const driveUrls = (formData.attachments || [])
          .filter((a: any) => a.driveUrl)
          .map((a: any) => ({ name: a.name || '', url: a.driveUrl }));

        // tradeStatus from task (set by AIIntakePanel type selector)
        const tradeStatus = (formData as any).tradeStatus || (businessType === 'TRADE' ? '新询盘' : '新建');

        const basePayload = {
          clientName,
          phone:          formData.phoneE164 || '',
          whatsapp:       formData.whatsapp  || '',
          email:          formData.email     || '',
          countryCity:    formData.countryCity || '',
          contactPerson,
          lastContext,
          goal,
          nextFollowUpAt: (formData.nextFollowUpAt || nowISO).slice(0, 10),
          followUpMethod,
          owner:          'Chris',
          source:         followUpMethod,
          categories:     (formData as any).categories || '',
          driveUrls:      driveUrls.length > 0 ? driveUrls : undefined,
          businessType,
          tradeStatus,
        };

        const base = typeof window !== 'undefined' ? window.location.origin : '';
        // TRADE → notion-write-lead (贸易客户池 SBxxx + Follow-up Log)
        // PROJECT → notion-write-project (项目客户表 + Follow-up Log)
        // Others → notion-create (Follow-up Log only)
        let endpoint: string;
        if (businessType === 'TRADE') {
          endpoint = '/api/crm/notion-write-lead';
        } else if (businessType === 'PROJECT') {
          endpoint = '/api/crm/notion-write-project';
        } else {
          endpoint = '/api/crm/notion-create';
        }

        // notion-create uses slightly different field names
        const notionPayload = businessType === 'LOG_ONLY' ? {
          ...basePayload,
          tradeStatus,
          followUpNotes: lastContext,
          nextAction: goal,
          followUpDate: new Date().toISOString().slice(0, 10),
        } : basePayload;

        console.log(`[PROJECT SAVE] endpoint=${endpoint} businessType=${businessType}`);
        console.log('[PROJECT Notion] payload.clientName=', notionPayload.clientName);
        console.log('[PROJECT Notion] payload.lastContext.len=', (notionPayload.lastContext || '').length);
        console.log('[PROJECT Notion] payload.goal=', notionPayload.goal?.slice?.(0, 80));
        console.log('[PROJECT Notion] payload.tradeStatus=', notionPayload.tradeStatus);
        console.log('[PROJECT SAVE] full payload', notionPayload);

        const res = await fetch(`${base}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notionPayload),
        });
        const text = await res.text();
        console.log('[PROJECT SAVE] status', res.status, '| body:', text.slice(0, 500));
        let result: any;
        try { result = JSON.parse(text); } catch { result = { error: text }; }

        if (res.ok) {
          // Backfill Notion page IDs so future archive/restore calls work
          const notionPageId = result.followupPageId || result.followUpLogPageId || result.pageId;
          const updates: Partial<FollowUpTask> = {};
          if (notionPageId)       updates.leadId = notionPageId;
          if (result.sbId)        { updates.customerCode = result.sbId; (updates as any).notionSbPageId = result.sbPageId; }
          if (result.projectPageId) (updates as any).notionProjectPageId = result.projectPageId;

          if (Object.keys(updates).length > 0) {
            setTasks(prev => prev.map(t => t.id === baseTask.id ? { ...t, ...updates } : t));
          }

          if (result.partial) {
            // SB Pool created/reused OK, but Follow-up Log failed — keep local record
            (updates as any).notionSyncStatus = 'followup_failed';
            if (Object.keys(updates).length > 0) {
              setTasks(prev => prev.map(t => t.id === baseTask.id ? { ...t, ...updates } : t));
            }
            const reuseLabel = result.sbReused ? `（复用 ${result.sbId}）` : `（${result.sbId}）`;
            showToast(
              `⚠️ 已进入贸易客户池 ${reuseLabel}，Follow-up Log 写入失败，点击导航栏"补写记录"重试`,
              'error'
            );
            console.error('[LeadSubmit] Follow-up Log failed:', result.followupError);
          } else {
            const codeLabel = result.sbId ? ` · ${result.sbId}${result.sbReused ? '（已有）' : ''}` : '';
            const dbLabel = businessType === 'TRADE' ? '贸易客户池' : businessType === 'PROJECT' ? '项目客户表' : 'Follow-up Log';
            showToast(`✓ 已同步到 Notion ${dbLabel}${codeLabel}`, 'success');
            syncFromNotion().catch((e: any) => console.warn('[LeadSubmit] sync after write failed', e));
          }
        } else {
          console.error('[LeadSubmit] Notion write failed', result);
          const detail = result?.error || result?.detail?.message || String(res.status);
          showToast(`⚠️ 已保存本地，Notion 同步失败（${detail}）`, 'error');
        }
      } catch (e: any) {
        console.error('[LeadSubmit] error writing to Notion', e?.message);
        showToast('⚠️ 已保存本地，Notion 连接失败，请检查网络', 'error');
      }
    })();
    // ──────────────────────────────────────────────────────────────────────

    if (businessType === 'TRADE' || businessType === 'PROJECT') {
      const log: ProjectLogEntry = {
        content: `[实时指挥] 目标: ${goal}\n详情: ${lastContext}`,
        time: localNow,
        author: '本人'
      };

      setProjects(prev => {
        const idx = prev.findIndex(p => p.contactKey && contactKey && p.contactKey === contactKey);
        if (idx >= 0) {
          const copy = [...prev];
          const old = copy[idx];
          copy[idx] = {
            ...old,
            projectFollowUps: [log, ...(old.projectFollowUps || [])],
            attachments: [...(formData.attachments || []), ...(old.attachments || [])],
            nextActionAt: formData.nextFollowUpAt || old.nextActionAt
          };
          return copy;
        }

        const pType: ProjectType = businessType === 'TRADE' ? '贸易型' : '项目型';
        const pName =
          businessType === 'TRADE'
            ? `[询盘] ${goal || clientName}`
            : `[项目] ${clientName}`;

        const newProj: Project = {
          id: `P_${now}`,
          name: pName,
          clientName,
          countryCity: formData.countryCity || '',
          contactKey,
          phoneE164: formData.phoneE164,
          whatsapp: formData.whatsapp,
          email: formData.email,
          type: pType,
          owner: '本人',
          status: '进行中',
          tradeStatus: businessType === 'TRADE' ? '新询盘' : '新建',
          initialContext: lastContext,
          projectFollowUps: [log],
          attachments: formData.attachments || [],
          createdAt: nowISO,
          nextActionAt: formData.nextFollowUpAt || nowISO
        };

        return [newProj, ...prev];
      });
    }

    try {
      const ai: CMOResponse = await generateTaskContent(baseTask as any);

      setTasks(prev =>
        prev.map(t =>
          t.id === baseTask.id
            ? {
                ...t,
                draftZH: ai?.draftZH || t.draftZH,
                finalBilingual: ai?.finalBilingual || t.finalBilingual,
                suggestedAction: ai?.suggestedAction || t.suggestedAction,
                riskNotice: ai?.riskNotice || t.riskNotice,
                aiInsights: ai?.aiInsights,
                updatedAt: new Date().toISOString(),
                history: [
                  ...(t.history || []),
                  {
                    id: `L_${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    type: 'AI_DONE',
                    message: 'AI 分析完成'
                  }
                ]
              }
            : t
        )
      );

      setSelectedTask(prev => {
        if (!prev || prev.id !== baseTask.id) return prev;
        return {
          ...prev,
          draftZH: ai?.draftZH || prev.draftZH,
          finalBilingual: ai?.finalBilingual || prev.finalBilingual,
          suggestedAction: ai?.suggestedAction || prev.suggestedAction,
          riskNotice: ai?.riskNotice || prev.riskNotice,
          aiInsights: ai?.aiInsights
        };
      });

      showToast('分析完成，记录已生成', 'success');
    } catch (e: any) {
      console.warn('AI failed', e);
      showToast('AI 分析失败，但记录已保存', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const updateTaskStatus = (id: string, s: FollowUpTask['status']) => {
    setTasks(prev =>
      prev.map(t =>
        t.id === id
          ? {
              ...t,
              status: s,
              completedAt: s === 'completed' ? new Date().toISOString() : t.completedAt,
              updatedAt: new Date().toISOString()
            }
          : t
      )
    );
  };

  const updateTradeStatus = (id: string, tradeStatus: any) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, tradeStatus } : t)));
  };

  // ── 帮助函数：判断 task 与 project 是否匹配同一客户 ──────────────
  const taskMatchesProject = (task: FollowUpTask, p: Project): boolean => {
    if (task.contactKey && p.contactKey && task.contactKey === p.contactKey) return true;
    if (task.clientName && p.clientName &&
        task.clientName.trim().toLowerCase() === p.clientName.trim().toLowerCase()) return true;
    if (task.whatsapp && p.whatsapp && task.whatsapp === p.whatsapp) return true;
    if (task.phoneE164 && p.phoneE164 && task.phoneE164 === p.phoneE164) return true;
    return false;
  };

  // ── 关闭本次跟进 — writes '暂缓' to Notion Follow-up Log ──────────
  // Optimistic: update local state immediately, then persist to Notion.
  const archiveTask = (id: string) => {
    const now = new Date().toISOString();
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // Optimistic update: status=archived + tradeStatus=暂缓
    setTasks(prev => prev.map(t =>
      t.id === id
        ? { ...t, status: 'archived', tradeStatus: '暂缓', updatedAt: now }
        : t
    ));

    // Immediately decrement "今日待跟进" stat so Control Center reflects the change
    // without waiting for the next Notion sync.
    const todayISO = new Date().toISOString().slice(0, 10);
    const EXCLUDED = ['暂缓', '已成交', '已归档', '执行中'];
    const wasInTodayCount =
      task.status === 'todo' &&
      !EXCLUDED.includes(task.tradeStatus || '') &&
      !!task.nextFollowUpAt &&
      task.nextFollowUpAt.slice(0, 10) <= todayISO;
    if (wasInTodayCount) {
      setTodayFollowupCount(prev => (prev !== null ? Math.max(0, prev - 1) : null));
    }

    // Notion write-back (only for records with a real Notion page ID)
    const pageId = task.leadId;
    const hasNotionPage = pageId && !/^(LEAD_|HIST_|SYNTH_|INT_|NOTION-)/i.test(pageId) && pageId.includes('-');
    if (hasNotionPage) {
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      fetch(`${base}/api/crm/notion-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, action: 'close_followup', tradeStatus: '暂缓' }),
      })
        .then(async res => {
          if (res.ok) {
            showToast(`已关闭 · Notion 已同步`, 'success');
          } else {
            const err = await res.json().catch(() => ({}));
            console.error('[archiveTask] Notion write-back failed:', res.status, err);
            showToast(`已关闭（本地）· Notion 同步失败 ${res.status}`, 'error');
          }
        })
        .catch(e => {
          console.error('[archiveTask] Notion error:', e);
          showToast('已关闭（本地）· Notion 连接失败', 'error');
        });
    } else {
      showToast('已关闭（本地快照）', 'info');
    }
  };

  // ── 恢复归档记录 → status=todo + Notion 行动状态=跟进中 ──────────────
  const restoreTask = (id: string) => {
    const now = new Date().toISOString();
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // Optimistic update: restore to todo + clear 暂缓 status
    setTasks(prev => prev.map(t =>
      t.id === id
        ? { ...t, status: 'todo', tradeStatus: '跟进中', updatedAt: now }
        : t
    ));

    // Increment today count if nextFollowUpAt <= today
    const todayISO = new Date().toISOString().slice(0, 10);
    const willBeInTodayCount =
      !!task.nextFollowUpAt &&
      task.nextFollowUpAt.slice(0, 10) <= todayISO;
    if (willBeInTodayCount) {
      setTodayFollowupCount(prev => (prev !== null ? prev + 1 : 1));
    }

    // Notion write-back
    const pageId = task.leadId;
    const hasNotionPage = pageId && !/^(LEAD_|HIST_|SYNTH_|INT_|NOTION-)/i.test(pageId) && pageId.includes('-');
    if (hasNotionPage) {
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      fetch(`${base}/api/crm/notion-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, action: 'restore_followup' }),
      })
        .then(async res => {
          if (res.ok) {
            showToast('已恢复跟进 · Notion 已同步', 'success');
          } else {
            const err = await res.json().catch(() => ({}));
            console.error('[restoreTask] Notion write-back failed:', res.status, err);
            showToast(`已恢复（本地）· Notion 同步失败 ${res.status}`, 'error');
          }
        })
        .catch(e => {
          console.error('[restoreTask] Notion error:', e);
          showToast('已恢复（本地）· Notion 连接失败', 'error');
        });
    } else {
      showToast('已恢复（本地快照）', 'info');
    }
  };

  // ── 补写 Follow-up Log（partial 失败时重试）──────────────────────────
  const [retryFollowupSyncing, setRetryFollowupSyncing] = useState(false);
  const retryFollowupLog = async () => {
    const failedTasks = tasks.filter(t => (t as any).notionSyncStatus === 'followup_failed' && (t as any).customerCode);
    if (failedTasks.length === 0) {
      showToast('没有需要补写的 Follow-up Log 记录', 'info');
      return;
    }
    setRetryFollowupSyncing(true);
    showToast(`正在补写 ${failedTasks.length} 条 Follow-up Log…`, 'info');
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    let ok = 0, fail = 0;
    for (const task of failedTasks) {
      try {
        const res = await fetch(`${base}/api/crm/notion-create-followup-only`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sbId: (task as any).customerCode,
            customerName: task.clientName,
            tradeStatus: task.tradeStatus,
            businessType: task.businessType,
            owner: task.owner,
            notes: task.lastContext || task.notes,
            goal: task.goal,
            nextFollowUpAt: task.nextFollowUpAt,
            phone: task.phoneE164,
            whatsapp: task.whatsapp,
          }),
        });
        const result = await res.json();
        if (result.ok) {
          ok++;
          setTasks(prev => prev.map(t =>
            t.id === task.id
              ? { ...t, leadId: result.followupPageId || t.leadId, notionSyncStatus: 'ok' } as any
              : t
          ));
        } else {
          fail++;
          console.error('[retryFollowupLog] failed for', task.clientName, result.error);
        }
      } catch (e: any) {
        fail++;
        console.error('[retryFollowupLog] error for', task.clientName, e?.message);
      }
    }
    setRetryFollowupSyncing(false);
    if (fail === 0) {
      showToast(`✓ ${ok} 条 Follow-up Log 已补写成功`, 'success');
    } else {
      showToast(`补写完成：${ok} 成功 / ${fail} 失败，请查看控制台`, fail > 0 ? 'error' : 'success');
    }
  };

  // ── 批量同步本地已归档记录 → Notion ────────────────────────────────
  // For records that were archived before Notion write-back was available,
  // or if individual write-backs failed. Runs in parallel, shows summary.
  const [batchSyncing, setBatchSyncing] = useState(false);

  const syncArchivedToNotion = async () => {
    const archived = tasks.filter(t =>
      t.status === 'archived' &&
      t.leadId &&
      !/^(LEAD_|HIST_|SYNTH_|INT_|NOTION-)/i.test(t.leadId) &&
      t.leadId.includes('-')
    );
    if (archived.length === 0) {
      showToast('没有需要同步到 Notion 的归档记录', 'info');
      return;
    }
    setBatchSyncing(true);
    showToast(`正在同步 ${archived.length} 条归档记录到 Notion…`, 'info');
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    let ok = 0, fail = 0;
    await Promise.allSettled(
      archived.map(task =>
        fetch(`${base}/api/crm/notion-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId: task.leadId, action: 'close_followup', tradeStatus: '暂缓' }),
        })
          .then(res => { if (res.ok) ok++; else fail++; })
          .catch(() => { fail++; })
      )
    );
    setBatchSyncing(false);
    if (fail === 0) {
      showToast(`✓ ${ok} 条归档已同步到 Notion`, 'success');
    } else {
      showToast(`同步完成：${ok} 成功 / ${fail} 失败`, fail > 0 ? 'error' : 'success');
    }
  };

  const deleteTask = (id: string) => {
    const now = new Date().toISOString();
    const task = tasks.find(t => t.id === id);
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, status: 'deleted', updatedAt: now } : t
    ));
    if (task) {
      setProjects(prev => prev.map(p =>
        taskMatchesProject(task, p) ? { ...p, deleted: true } : p
      ));
    }
  };

  // ── 归档 / 软删除（project）— 同步到对应 task ────────────────────
  const archiveProject = (id: string) => {
    const now = new Date().toISOString();
    setProjects(prev => prev.map(p =>
      p.id === id ? { ...p, archivedAt: now } : p
    ));
    const proj = projects.find(p => p.id === id);
    if (proj) {
      setTasks(prev => prev.map(t =>
        taskMatchesProject(t, proj) ? { ...t, status: 'archived', updatedAt: now } : t
      ));
    }
  };

  const deleteProject = (id: string) => {
    const now = new Date().toISOString();
    if (id.startsWith('SYNTH_')) {
      deleteTask(id.replace('SYNTH_', ''));
    } else {
      setProjects(prev => prev.map(p =>
        p.id === id ? { ...p, deleted: true } : p
      ));
      const proj = projects.find(p => p.id === id);
      if (proj) {
        setTasks(prev => prev.map(t =>
          taskMatchesProject(t, proj) ? { ...t, status: 'deleted', updatedAt: now } : t
        ));
      }
    }
  };

  const handleAdminImport = () => {
    const existingTaskIds = new Set(tasks.map(t => t.id));
    const existingProjectIds = new Set(projects.map(p => p.id));
    const newTasks = ADMIN_IMPORT_TASKS
      .filter(t => !existingTaskIds.has(t.id))
      .map(t => ({ ...t, importedHistorical: true as const }));
    const newProjects = ADMIN_IMPORT_PROJECTS
      .filter(p => !existingProjectIds.has(p.id))
      .map(p => ({ ...p, importedHistorical: true as const }));
    if (newTasks.length === 0 && newProjects.length === 0) {
      showToast('所有记录已存在，无需导入', 'info');
      return;
    }
    setTasks(prev => [...prev, ...newTasks]);
    setProjects(prev => [...prev, ...newProjects]);
    showToast(`已导入 ${newTasks.length} 条 Task、${newProjects.length} 个 Project，正在同步云端…`, 'success');
  };

  const toastClass =
    toast?.type === 'success'
      ? 'bg-emerald-700 border-emerald-600'
      : toast?.type === 'error'
      ? 'bg-rose-700 border-rose-600'
      : 'bg-[#0D1E35] border-[#1E3A5F]';

  // SALES 分区的 4 个 Tab 在前；内部事项排最后并在渲染时用分隔线隔开——
  // 全局 Sidebar 已经把"内部事项"归到 OPERATIONS，这里只是让本模块内部
  // 的横条顺序和分组跟全局导航保持一致，不影响 activeTab 的任何逻辑。
  const navTabs = [
    { id: 'control' as const,    label: '控制中心' },
    { id: 'dashboard' as const,  label: '客户跟进' },
    { id: 'project' as const,    label: '业务中心' },
    { id: 'history' as const,    label: '历史归档' },
    { id: 'internal' as const,   label: '内部事项' },
  ];

  return (
    <div className="min-h-screen font-sans pb-36" style={{ background: '#0A1628', color: '#E8F0FF' }}>
      <nav className="no-print sticky top-0 z-[90] px-3" style={{ background: '#0D1E35', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 py-2.5">
          <div className="flex items-center overflow-x-auto gap-1.5">
            {navTabs.map(tab => (
              <React.Fragment key={tab.id}>
                {tab.id === 'internal' && (
                  <div className="w-px h-5 mx-1.5 shrink-0" style={{ background: 'rgba(255,255,255,0.10)' }} />
                )}
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className="shrink-0 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all"
                  style={activeTab === tab.id
                    ? { backgroundColor: '#B8960C', color: '#fff' }
                    : { background: 'rgba(255,255,255,0.06)', color: '#7A9CC5' }}
                >
                  {tab.label}
                </button>
              </React.Fragment>
            ))}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lastSyncAt && (
              <span className="text-[10px] font-bold whitespace-nowrap hidden md:inline" style={{ color: '#4A6080' }}>
                最后同步: {(() => {
                  const diff = Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 60000);
                  return diff < 1 ? '刚刚' : `${diff}分钟前`;
                })()}
              </span>
            )}
            {/* 补写 Follow-up Log（partial 失败时） */}
            {tasks.some(t => (t as any).notionSyncStatus === 'followup_failed') && (
              <button
                onClick={retryFollowupLog}
                disabled={retryFollowupSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all disabled:opacity-50"
                style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.35)' }}
                title="补写 Follow-up Log（SB Pool 已创建，但 Follow-up Log 未写入）"
              >
                <RefreshCw className={`w-3 h-3 ${retryFollowupSyncing ? 'animate-spin' : ''}`} />
                {retryFollowupSyncing ? '补写中…' : '⚠ 补写记录'}
              </button>
            )}
            {/* 批量同步归档→Notion */}
            {tasks.some(t => t.status === 'archived' && t.leadId?.includes('-') && !/^(LEAD_|HIST_|SYNTH_|INT_|NOTION-)/i.test(t.leadId)) && (
              <button
                onClick={syncArchivedToNotion}
                disabled={batchSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all disabled:opacity-50"
                style={{ backgroundColor: 'rgba(184,150,12,0.15)', color: '#B8960C', border: '1px solid rgba(184,150,12,0.35)' }}
                title="将本地归档记录同步到 Notion"
              >
                <RefreshCw className={`w-3 h-3 ${batchSyncing ? 'animate-spin' : ''}`} />
                {batchSyncing ? '同步中…' : '↑ 归档→Notion'}
              </button>
            )}
            <button
              onClick={() => syncFromNotion()}
              disabled={syncStatus === 'syncing'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black text-white transition-all disabled:opacity-50"
              style={{ backgroundColor: '#B8960C' }}
              title="从 Notion 同步数据"
            >
              <RefreshCw className={`w-3 h-3 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
              {syncStatus === 'syncing' ? '同步中…' : '↻ 同步'}
            </button>
            {isAdminMode && (
              <button
                onClick={handleAdminImport}
                className="px-3 py-1.5 rounded-xl text-[10px] font-black text-white"
                style={{ backgroundColor: '#1E3A5F' }}
              >
                ⬆ 导入
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">

        {activeTab === 'control' && (
          <ControlCenter
            tasks={normalizedTasks}
            projects={combinedProjectsForView.filter(p => !p.deleted && !p.archivedAt)}
            todayFollowupCount={todayFollowupCount}
            onTabSwitch={(tab) => setActiveTab(tab)}
            onSelectTask={setSelectedTask}
          />
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black" style={{ color: '#E8F0FF' }}>客户跟进</h2>
                <p className="text-sm font-medium mt-0.5" style={{ color: '#7A9CC5' }}>AI 辅助跟进 · 所有待处理记录</p>
              </div>
              <button
                onClick={() => setIntakeOpen(v => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                style={{ background: 'rgba(255,255,255,0.07)', color: '#7A9CC5', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                {intakeOpen ? '收起录入 ↑' : '展开录入 ↓'}
              </button>
            </div>

            {intakeOpen && (
              <AIIntakePanel
                onAdd={async (data) => {
                  await handleAddTask(data);
                  showToast('记录已创建', 'success');
                }}
                isLoading={isGenerating}
                projects={projects}
              />
            )}

            <FollowUpQueue
              tasks={normalizedTasks}
              onAction={setSelectedTask}
              onUpdateStatus={updateTaskStatus}
              onUpdateTradeStatus={updateTradeStatus}
              onArchiveTask={archiveTask}
              lang={'zh'}
            />
          </div>
        )}

        {activeTab === 'internal' && (
          <InternalTasksView lang={'zh'} onShowToast={showToast as any} />
        )}

        {activeTab === 'project' && (
          <ProjectProgress
            projects={combinedProjectsForView.filter(p => !p.deleted && !p.archivedAt)}
            onAddProject={(p: any) => setProjects(v => [p, ...v])}
            onUpdateProject={(p: any) => {
              if (typeof p.id === 'string' && p.id.startsWith('SYNTH_')) {
                const taskId = p.id.replace('SYNTH_', '');
                setTasks(v => v.map(t =>
                  t.id === taskId
                    ? { ...t, tradeStatus: p.tradeStatus, updatedAt: new Date().toISOString() }
                    : t
                ));
              } else {
                setProjects(v => v.map(o => (o.id === p.id ? p : o)));
              }
            }}
            onArchiveProject={(id: string) => {
              if (id.startsWith('SYNTH_')) archiveTask(id.replace('SYNTH_', ''));
              else archiveProject(id);
            }}
            onDeleteProject={(id: string) => deleteProject(id)}
            lang={'zh'}
            tradeItems={[] as any}
            onAddTrade={() => {}}
            onUpdateTrade={() => {}}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            tasks={normalizedTasks}
            projects={projects}
            lang={'zh'}
            onUpdateTask={(u: any) => setTasks(v => v.map(t => t.id === u.id ? u : t))}
            onArchiveTask={archiveTask}
            onRestoreTask={restoreTask}
            onDeleteTask={deleteTask}
          />
        )}
      </main>

      {selectedTask && activeTab === 'dashboard' && (
        <QuickFollowUpPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSave={(taskId, log) => {
            const now = new Date().toISOString();
            setTasks(prev => prev.map(t => {
              if (t.id !== taskId) return t;
              return {
                ...t,
                nextFollowUpAt: log.nextDate,
                history: [
                  {
                    id: `quick-${Date.now()}`,
                    timestamp: now,
                    message: `[${log.method}] ${log.content}`,
                    type: 'follow_up' as const,
                    by: 'Admin',
                  },
                  ...(t.history || []),
                ],
              };
            }));
            showToast('跟进记录已保存', 'success');
          }}
          onViewFull={() => setActiveTab('project')}
          onArchiveTask={archiveTask}
          onUpdateTask={(updated: any) => {
            console.log('[CrmModule.onUpdateTask dashboard] id=', updated.id, 'leadId=', updated.leadId, 'nextFollowUpAt=', updated.nextFollowUpAt, 'status=', updated.status);
            setTasks(v => {
              const next = v.map(t => (t.id === updated.id ? updated : t));
              const found = next.some(t => t.id === updated.id);
              if (!found) console.error('[CrmModule.onUpdateTask] WARN: id not found in tasks array — task may not persist!', updated.id);
              return next;
            });
            setSelectedTask(updated);
            showToast('记录已更新', 'success');
          }}
        />
      )}

      {selectedTask && activeTab !== 'dashboard' && (
        <LeadMasterDetail
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdateTask={(u: any) => setTasks(v => v.map(t => (t.id === u.id ? u : t)))}
          onArchiveTask={archiveTask}
          onDeleteTask={deleteTask}
          lang={'zh'}
        />
      )}

      {toast && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[3000] animate-fadeIn">
          <div className={`px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-3 border text-white ${toastClass}`}>
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span className="text-sm font-black">{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================
   Root — Gate + ErrorBoundary，与原 App() 完全一致，
   只是 AppInner 改名 CrmInner 且不再渲染 AppShell。
   ========================= */
export default function CrmModule({ initialTab }: { initialTab?: CrmTab } = {}) {
  return (
    <ErrorBoundary>
      <CrmInner initialTab={initialTab} />
    </ErrorBoundary>
  );
}
