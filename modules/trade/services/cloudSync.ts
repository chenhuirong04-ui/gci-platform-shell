/**
 * iCare Cloud Sync Service (Snapshot Logic)
 * Endpoint: Google Apps Script
 */

const BASE_URL = "https://script.google.com/macros/s/AKfycbzmyUtJonSdmAb8ZPkn09iSft8H2GAHsgeDJhkpeqKtpbXil5dCmGi9D0vFLU0WYPE6/exec";
const APP_KEY = "icare_bookkeeping";

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))
  ]);
};

const safeParse = (jsonStr: string): any | null => {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
};

const performRequest = async (payload: any, isRetry = false): Promise<any> => {
  try {
    const response = await withTimeout(
      fetch(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, app: APP_KEY })
      }),
      15000
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    return result;
  } catch (error) {
    if (!isRetry) {
      console.warn("[CloudSync] Request failed, retrying...", error);
      return performRequest(payload, true);
    }
    console.warn("[CloudSync] Final request attempt failed:", error);
    return null;
  }
};

export const pushSnapshot = async (state: any): Promise<void> => {
  const now = new Date().toISOString();
  const payload = {
    action: "upsert",
    table: "snapshots",
    rows: [
      {
        id: "latest",
        state: JSON.stringify(state),
        updated_at: now,
        created_at: now
      }
    ]
  };
  void performRequest(payload);
};

export const pullLatestSnapshot = async (): Promise<any | null> => {
  const payload = {
    action: "query",
    table: "snapshots",
    params: { limit: 1, offset: 0 }
  };
  const result = await performRequest(payload);
  if (result && result.ok && result.data && result.data.length > 0) {
    const row = result.data[0];
    const stateStr = row.state || row.payload;
    return typeof stateStr === "string" ? safeParse(stateStr) : stateStr;
  }
  return null;
};
