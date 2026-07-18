import type { FollowUpTask } from '../types';
import { DEMO_LEADS } from './demoLeads';

export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

export function createDemoLeads(): FollowUpTask[] {
  return structuredClone(DEMO_LEADS);
}

export const DEMO_BLOCKED_HOSTS = [
  'notion',
  'script.google.com',
  'supabase.co',
  'googleapis.com',
];
