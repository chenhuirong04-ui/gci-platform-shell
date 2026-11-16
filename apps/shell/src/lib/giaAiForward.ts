// Home GIA → AI Workspace hand-off for read-only business queries.
//
// Home's GIA box (BusinessAssistantEntry.tsx) runs the capture/lookup
// router (giaRouter.ts). That router has no inventory/price capability and
// treats any short, punctuation-free sentence as a customer name
// (BARE_NAME_RE), so "现在有多少纸尿裤库存" ended up in
// /business-assistant?customer=…. The capability that does answer it
// already exists: the central intent router (ai/aiRouter.ts +
// ai/aiCapabilityMap.ts) and AIPage's /ai?q= handling.
//
// This module only decides whether to hand off. It adds no keywords: the
// intent comes from detectAIIntent(), and only the intent ids listed below
// are forwarded. Any text that one of GIA's own explicit commands would
// handle (explicit destination, task complete/reschedule, Drive folder /
// multi-step Drive plan, file search, follow-up note) is never forwarded,
// using those commands' existing predicates.
import { detectAIIntent } from '../ai/aiRouter';
import { detectExplicitDestination, matchTaskLifecycleCommand, matchTaskRescheduleCommand } from './businessCapture';
import { looksLikeDriveCreateFolderCommand } from './giaRouter';
import { looksLikeMultiStepDrivePlan } from './driveActionPlan';
import { looksLikeFileSeek } from './giaFiles';
import { looksLikeNotionFollowupCommand } from './notionFollowup';

// Capability-map intents that are read-only (writeTargets: [],
// approvalRequired: false, implementationStatus: 'real') AND that AIPage
// answers end to end from real data.
export const GIA_AI_FORWARD_INTENTS: ReadonlySet<string> = new Set([
  'check_inventory',           // AIPage INVENTORY_RE → /api/ai/inventory-table-alerts + /api/trade/check-inventory
  'product_overview',          // AIPage PRODUCT_OVERVIEW_RE → /api/ai/product-overview
  'check_quotation_followups', // AIPage QUOTATION_FOLLOWUP_RE → quotation follow-up list
]);

function isGiaExplicitCommand(text: string): boolean {
  return (
    looksLikeNotionFollowupCommand(text) ||
    detectExplicitDestination(text) !== null ||
    matchTaskLifecycleCommand(text) !== null ||
    matchTaskRescheduleCommand(text) !== null ||
    looksLikeDriveCreateFolderCommand(text) ||
    looksLikeMultiStepDrivePlan(text) ||
    looksLikeFileSeek(text)
  );
}

// Returns the /ai?q= path to open, or null to keep the existing GIA flow.
export function giaAiForwardPath(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (isGiaExplicitCommand(t)) return null;
  const { intent } = detectAIIntent(t);
  if (!GIA_AI_FORWARD_INTENTS.has(intent.intentId)) return null;
  return `/ai?q=${encodeURIComponent(t)}`;
}
