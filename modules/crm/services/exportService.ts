import { FollowUpTask, Project, ProjectFollowUp } from "../types";
import { cloudPullAllKV } from "./cloudStore";

const ICARE_HISTORY_V1 = "ICARE_HISTORY_V1";

export const exportToCSV = async (localTasks: FollowUpTask[]) => {
  let finalTasks: FollowUpTask[] = localTasks || [];

  try {
    const kv = await cloudPullAllKV();
    const cloudTasks = (kv?.[ICARE_HISTORY_V1] || []) as FollowUpTask[];
    if (Array.isArray(cloudTasks) && cloudTasks.length > 0) {
      finalTasks = cloudTasks;
    }
  } catch (e) {
    console.warn("[exportToCSV] cloud pull failed, fallback local:", e);
  }

  const headers = [
    "记录ID",
    "业务类型",
    "客户名称",
    "国家城市",
    "联系方式_WA",
    "联系方式_电话",
    "联系方式_邮箱",
    "咨询内容(摘要)",
    "产品关键词/标签",
    "最新跟进备注",
    "优先级",
    "状态",
    "创建时间",
    "下次跟进时间",
    "归档完成时间",
    "负责人"
  ];

  const rows = finalTasks.map((task: any) => [
    task.id,
    task.businessType === 'TRADE' ? '贸易询盘' : task.businessType === 'PROJECT' ? '项目推进' : '仅记录',
    `"${(task.clientName || "").replace(/"/g, '""')}"`,
    `"${(task.countryCity || "").replace(/"/g, '""')}"`,
    `"${task.whatsapp || ""}"`,
    `"${task.phoneE164 || ""}"`,
    `"${task.email || ""}"`,
    `"${(task.inquirySummary || task.lastContext || "").replace(/"/g, '""')}"`,
    `"${(task.categories || "").replace(/"/g, '""')}"`,
    `"${(task.lastNote || "").replace(/"/g, '""')}"`,
    task.priority ?? "",
    task.status === 'completed' ? '已完成' : '已归档',
    task.createdAt || "",
    task.nextFollowUpAt || "-",
    task.completedAt || task.updatedAt || "",
    `"${task.owner || ""}"`
  ]);

  const csvContent = [headers.join(","), ...rows.map((e: any) => e.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `icare_full_archives_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportProjectCSV = (projects: Project[], followups: ProjectFollowUp[]) => {
  const headers = [
    "Project ID",
    "Project Name",
    "Customer Name",
    "Country / City",
    "Follow-up Time",
    "Method",
    "Stage",
    "Content",
    "Blocked",
    "Blocking Point",
    "Next Action",
    "Next Follow-up",
    "Owner"
  ];

  const rows: string[][] = [];

  (followups || []).forEach(log => {
    const project = (projects || []).find(p => p.id === log.projectId);
    if (project) {
      rows.push([
        log.projectId,
        `"${(project.name || "").replace(/"/g, '""')}"`,
        `"${(project.clientName || "").replace(/"/g, '""')}"`,
        `"${(project.countryCity || "").replace(/"/g, '""')}"`,
        log.timestamp || "",
        (log as any).method || "",
        (log as any).stage || "",
        `"${(log.content || "").replace(/"/g, '""')}"`,
        (log as any).isBlocked ? "Yes" : "No",
        `"${((log as any).blockingPoint || "").replace(/"/g, '""')}"`,
        `"${((log as any).nextAction || "").replace(/"/g, '""')}"`,
        (log as any).nextFollowUpAt || "",
        project.owner || ""
      ]);
    }
  });

  const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `icare_project_followups_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
