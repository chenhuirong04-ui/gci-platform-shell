/**
 * /api/notion-proxy — Vercel serverless Notion gateway
 * Keeps token server-side. Eliminates cors-anywhere dependency.
 * Frontend: POST /api/notion-proxy { path, method?, body? }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const BASE = 'https://api.notion.com/v1';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Only POST allowed' });

  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: 'Server misconfigured: NOTION_TOKEN is not set' });
  const headers = {
    Authorization:    `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type':   'application/json',
  };

  const { path, method = 'POST', body } = req.body ?? {};
  if (!path || typeof path !== 'string')
    return res.status(400).json({ error: 'Missing required field: path' });

  // Whitelist: only /databases/* and /pages (safety guard)
  const allowed = /^\/(databases\/[^/]+\/(query|properties)|pages(\/[^/]+)?|blocks\/[^/]+\/children)/.test(path);
  if (!allowed) return res.status(403).json({ error: `Path not allowed: ${path}` });

  try {
    const notionRes = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await notionRes.json();
    return res.status(notionRes.status).json(data);
  } catch (err: any) {
    return res.status(502).json({ error: `Upstream Notion error: ${err.message}` });
  }
}
