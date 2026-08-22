// GCI Executive Desk — Multi-step Drive Plan V1.
// Lets a user chain 2-3 related Drive actions in one sentence (find a real
// folder, create a subfolder under it, upload the currently-pending file
// into it) instead of one action per message. Rule-based only, no AI call.
// Only ever active while a local file is already pending (BusinessAssistantEntry.tsx
// gates entry into this module on `selectedFile` being set) — every V1 plan
// ends in UPLOAD_CURRENT_FILE, so that precondition is exactly right, not
// a workaround.
//
// V1 supports exactly 3 step types (no move/rename/delete/share/permission/
// download/copy/batch — see the read-only design). A plan is always
// exactly [FIND_FOLDER, CREATE_FOLDER, UPLOAD_CURRENT_FILE] — the FIND_FOLDER
// step is synthesized automatically when the sentence never says "找到 X"
// explicitly but a later step clearly needs X resolved first (e.g. "在
// HIGHWAYGLOBAL 下面建一个 CONTRACTS"). That synthesized step is marked
// `implicit: true` but is NEVER hidden from the confirm card — the caller
// must render it like any other step.
import {
  createFolderIfMissing, uploadAndRegisterLocalFile, searchDriveFolders,
  getDriveFolderName, type DriveFolderOption, type GiaFileRegistryRow,
} from './giaFiles';
import { findDriveFolderMemory, touchMemory, markMemoryStale, type DriveFolderMemoryValue } from './giaMemory';

export interface FindFolderStep {
  type: 'FIND_FOLDER';
  query: string;
  implicit: boolean; // true = synthesized by the parser, not said explicitly by the user — must still be shown
  resolvedFolderId?: string;
  resolvedFolderName?: string;
}
export interface CreateFolderStep {
  type: 'CREATE_FOLDER';
  folderName: string;
  parentRef: number; // index into DriveActionPlan.steps
}
export interface UploadCurrentFileStep {
  type: 'UPLOAD_CURRENT_FILE';
  targetRef: number; // index into DriveActionPlan.steps
}
export type DriveActionStep = FindFolderStep | CreateFolderStep | UploadCurrentFileStep;

export interface DriveActionPlan {
  steps: DriveActionStep[];
}

// ── Gate + parse — deterministic regex only ──────────────────────────────
const UPLOAD_CUE_RE = /放进去|放里面|传进去|传进|上传进去|upload[\s\S]*?there|put[\s\S]*?there/iu;
// Deliberately broader than giaRouter.ts's single-step DRIVE_FOLDER_ZH_TRIGGER_RE
// (which requires 文件夹/目录 to literally appear) — real phrasing like
// "在HIGHWAYGLOBAL下面建一个CONTRACTS" never says "文件夹" at all. Safe to be
// broader here because this only ever runs while a file is already pending
// (narrow context — see module header), unlike the general chat router.
const PLAN_CREATE_CUE_RE = /新建|创建|建立|新增|建(?!议|设|成|筑)|\bcreate\b|\bmake\b/iu;

export function looksLikeMultiStepDrivePlan(text: string): boolean {
  return PLAN_CREATE_CUE_RE.test(text) && UPLOAD_CUE_RE.test(text);
}

// Prefers an ALL-CAPS token (HIGHWAYGLOBAL, SHADI) over a general
// capitalized word — in an English sentence the first capitalized word is
// often just the sentence-initial verb ("Create a folder..."), not the
// entity. Deliberately does NOT reuse giaFiles.ts's extractCompanyName():
// that function's KNOWN_COMPANIES list does a substring match, so it
// mis-extracts "Highway" out of "HIGHWAYGLOBAL" — wrong for this use, where
// the exact full token matters for a real Drive folder name.
function extractPlanRootEntity(text: string): string | null {
  const allCaps = text.match(/\b[A-Z]{2,}[A-Z0-9&]*\b/);
  if (allCaps) return allCaps[0];
  const general = text.match(/\b[A-Z][A-Za-z0-9&]{2,}\b/);
  return general ? general[0] : null;
}

// Child folder name: text right after the create-verb, up to the next
// clause boundary, with an optional trailing 文件夹/目录/folder/directory
// word stripped off (present in some phrasings, absent in others — both
// are valid Chinese usage).
function extractPlanChildFolderName(text: string): string | null {
  const calledMatch = text.match(/(?:folder|directory)\s+(?:called|named)\s+([A-Za-z0-9][A-Za-z0-9 _-]*?)(?=\s+(?:under|in|inside)\b|[,.;]|$)/iu);
  if (calledMatch) return calledMatch[1].trim();

  const zh = text.match(/(?:新建|创建|建立|新增|建(?!议|设|成|筑))\s*(?:一个|个)?\s*([^\s，,。；;、]+?)\s*(?:文件夹|目录)?(?=[，,。；;、]|把|然后|再|$)/u);
  if (zh && zh[1] && !/^(?:一个|个)?$/.test(zh[1])) return zh[1].replace(/(文件夹|目录)$/, '').trim();

  const en = text.match(/\b(?:create|make)\b\s+(?:a\s+)?(?:new\s+)?([A-Za-z0-9][A-Za-z0-9 _-]*?)\s+(?:folder|directory)\b/iu);
  if (en) return en[1].trim();

  return null;
}

// Returns null when the sentence doesn't have both a clear root entity and
// a clear new-folder name — caller should fall back to the existing
// single-step flow rather than showing a broken plan.
export function parseDriveActionPlan(text: string): DriveActionPlan | null {
  if (!looksLikeMultiStepDrivePlan(text)) return null;
  const root = extractPlanRootEntity(text);
  if (!root) return null;
  const childName = extractPlanChildFolderName(text);
  if (!childName) return null;
  if (childName.toUpperCase() === root.toUpperCase()) return null;

  return {
    steps: [
      { type: 'FIND_FOLDER', query: root, implicit: true },
      { type: 'CREATE_FOLDER', folderName: childName, parentRef: 0 },
      { type: 'UPLOAD_CURRENT_FILE', targetRef: 1 },
    ],
  };
}

// ── Resolution (read-only) — fills in the FIND_FOLDER step's real folder
// before the plan is ever shown to the user. Never writes to Drive. ───────
interface FolderResolvedResult { status: 'resolved'; folderId: string; folderName: string }
interface FolderAmbiguousResult { status: 'ambiguous'; candidates: DriveFolderOption[] }
interface FolderNotFoundResult { status: 'not_found' }
type FolderResolution = FolderResolvedResult | FolderAmbiguousResult | FolderNotFoundResult;

// Same priority as the single-step flow: this-turn literal name is already
// what `query` is (the parser only ever extracts what the user actually
// typed) > gia_memory (re-verified against real Drive before trusting) >
// real Drive search > ambiguous -> let caller ask > 0 results -> stop.
async function resolveFolderReference(query: string): Promise<FolderResolution> {
  const memory = await findDriveFolderMemory(query);
  if (memory) {
    const value = memory.value_json as DriveFolderMemoryValue;
    const realName = await getDriveFolderName(value.folderId);
    if (realName) {
      touchMemory(memory.id);
      return { status: 'resolved', folderId: value.folderId, folderName: realName };
    }
    await markMemoryStale(memory.id);
  }
  const results = await searchDriveFolders(query);
  if (results.length === 0) return { status: 'not_found' };
  if (results.length === 1) return { status: 'resolved', folderId: results[0].id, folderName: results[0].name };
  return { status: 'ambiguous', candidates: results.slice(0, 5) };
}

export type PlanResolutionOutcome =
  | { ok: true; plan: DriveActionPlan }
  | { ok: false; reason: 'ambiguous'; candidates: DriveFolderOption[]; plan: DriveActionPlan }
  | { ok: false; reason: 'not_found'; query: string; plan: DriveActionPlan };

export async function resolveDrivePlan(plan: DriveActionPlan): Promise<PlanResolutionOutcome> {
  const rootStep = plan.steps[0];
  if (rootStep.type !== 'FIND_FOLDER') return { ok: false, reason: 'not_found', query: '', plan };
  const resolution = await resolveFolderReference(rootStep.query);
  if (resolution.status === 'resolved') {
    return { ok: true, plan: applyRootResolution(plan, resolution.folderId, resolution.folderName) };
  }
  if (resolution.status === 'ambiguous') {
    return { ok: false, reason: 'ambiguous', candidates: resolution.candidates, plan };
  }
  return { ok: false, reason: 'not_found', query: rootStep.query, plan };
}

export function applyRootResolution(plan: DriveActionPlan, folderId: string, folderName: string): DriveActionPlan {
  const nextSteps = [...plan.steps];
  nextSteps[0] = { ...(nextSteps[0] as FindFolderStep), resolvedFolderId: folderId, resolvedFolderName: folderName };
  return { steps: nextSteps };
}

export function isRootResolved(plan: DriveActionPlan): boolean {
  const rootStep = plan.steps[0];
  return rootStep.type === 'FIND_FOLDER' && !!rootStep.resolvedFolderId;
}

export function getCreateStep(plan: DriveActionPlan): CreateFolderStep | null {
  const step = plan.steps.find((s) => s.type === 'CREATE_FOLDER');
  return (step as CreateFolderStep) ?? null;
}

export function withChildFolderName(plan: DriveActionPlan, folderName: string): DriveActionPlan {
  return { steps: plan.steps.map((s) => (s.type === 'CREATE_FOLDER' ? { ...s, folderName } : s)) };
}

// ── Execution — strictly serial, stops at the first failure. Never
// Promise.all's these steps: each one depends on the previous step's real
// output (a folder id that doesn't exist until the previous step actually
// ran). ───────────────────────────────────────────────────────────────────
export interface DrivePlanExecutionResult {
  ok: boolean;
  failedAtStep?: number;
  error?: string;
  folderCreatedButUploadFailed?: boolean;
  createdFolder?: { id: string; name: string };
  uploadedFile?: { row: GiaFileRegistryRow; driveUrl: string; folderName: string };
}

function resolveRef(ref: number, results: Record<number, { id: string; name: string }>): { id: string; name: string } | null {
  return results[ref] ?? null;
}

export async function executeDrivePlan(plan: DriveActionPlan, file: File): Promise<DrivePlanExecutionResult> {
  const results: Record<number, { id: string; name: string }> = {};

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];

    if (step.type === 'FIND_FOLDER') {
      if (!step.resolvedFolderId || !step.resolvedFolderName) {
        return { ok: false, failedAtStep: i, error: 'Folder was not resolved before execution' };
      }
      results[i] = { id: step.resolvedFolderId, name: step.resolvedFolderName };
      continue;
    }

    if (step.type === 'CREATE_FOLDER') {
      const parent = resolveRef(step.parentRef, results);
      if (!parent) return { ok: false, failedAtStep: i, error: 'Parent folder was not resolved' };
      const res = await createFolderIfMissing(step.folderName, parent.id);
      if (!res.ok) return { ok: false, failedAtStep: i, error: res.error };
      results[i] = { id: res.folderId, name: step.folderName };
      continue;
    }

    if (step.type === 'UPLOAD_CURRENT_FILE') {
      const target = resolveRef(step.targetRef, results);
      const createdFolder = findLastCreatedFolder(plan, results);
      if (!target) return { ok: false, failedAtStep: i, error: 'Upload target was not resolved', folderCreatedButUploadFailed: !!createdFolder, createdFolder };
      const res = await uploadAndRegisterLocalFile(file, target);
      if (!res.ok) return { ok: false, failedAtStep: i, error: res.error, folderCreatedButUploadFailed: !!createdFolder, createdFolder };
      return {
        ok: true,
        createdFolder,
        uploadedFile: { row: res.row, driveUrl: res.row.drive_url, folderName: res.actualFolderName },
      };
    }
  }

  return { ok: false, error: 'Plan had no upload step' };
}

function findLastCreatedFolder(plan: DriveActionPlan, results: Record<number, { id: string; name: string }>): { id: string; name: string } | undefined {
  for (let i = plan.steps.length - 1; i >= 0; i--) {
    if (plan.steps[i].type === 'CREATE_FOLDER' && results[i]) return results[i];
  }
  return undefined;
}
