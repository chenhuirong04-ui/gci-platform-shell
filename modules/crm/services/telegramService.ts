
import { FollowUpTask } from "../types";

/**
 * iCare Internal Follow-up System (SOT)
 * External notifications and Webhooks have been completely disabled.
 * This is now a purely internal management tool.
 */

export const triggerFixedNotification = async () => {
  // Logic removed: Internal only system.
  return { ok: true };
};

export const sendDueNotification = async (task: FollowUpTask) => {
  return { ok: true };
};

export const sendTelegramNotification = async (message: string, eventType: string = "followup_notification") => {
  return { ok: true };
};

export const getTemplate = (type: any, payload: any) => {
  return "";
};
