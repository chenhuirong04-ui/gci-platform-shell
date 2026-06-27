/**
 * iCare Cloud Persistence Layer (Google Apps Script)
 * Provides robust fetch with 15s timeout and automatic retry support.
 */

const BASE_URL = "https://script.google.com/macros/s/AKfycbzmyUtJonSdmAb8ZPkn09iSft8H2GAHsgeDJhkpeqKtpbXil5dCmGi9D0vFLU0WYPE6/exec";
const APP_KEY = "icare_bookkeeping";

interface CloudResponse {
  ok: boolean;
  data?: any;
  error?: string;
}

/**
 * Enhanced fetch with timeout control
 */
const timeoutFetch = async (url: string, options: RequestInit, timeout = 15000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
};

/**
 * Core request wrapper with retry logic
 */
const request = async (payload: any): Promise<CloudResponse> => {
  const execute = async () => {
    const res = await timeoutFetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, app_key: APP_KEY })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json;
  };

  try {
    try {
      const data = await execute();
      return { ok: true, data };
    } catch (e) {
      // Automatic retry once on failure (Network or Timeout)
      console.warn("[CloudStore] Initial attempt failed, retrying once...", e);
      const data = await execute();
      return { ok: true, data };
    }
  } catch (e) {
    console.error("[CloudStore] Operation failed after retries:", e);
    return { ok: false, error: String(e) };
  }
};

export const cloudStore = {
  /**
   * Insert or update rows in a specific table
   */
  async cloudUpsert(table: string, rows: any[]) {
    return request({ action: 'upsert', table, rows });
  },

  /**
   * Query records with optional parameters
   */
  async cloudQuery(table: string, params: any = {}) {
    return request({ action: 'query', table, params });
  },

  /**
   * Remove specific records by ID
   */
  async cloudRemove(table: string, ids: string[]) {
    return request({ action: 'remove', table, ids });
  },

  /**
   * Export all data from a table, handling pagination (50+ rows)
   */
  async cloudExportAll(table: string, params: any = {}) {
    let allData: any[] = [];
    let page = 1;
    const limit = 100; // Request large batches for full export
    
    while (true) {
      const res = await request({ 
        action: 'query', 
        table, 
        params: { ...params, page, limit } 
      });
      
      if (!res.ok || !res.data || !Array.isArray(res.data) || res.data.length === 0) {
        break;
      }
      
      allData = [...allData, ...res.data];
      
      // If we got fewer results than the limit, we've reached the end
      if (res.data.length < limit) break;
      page++;
    }
    
    return { ok: true, data: allData };
  }
};
