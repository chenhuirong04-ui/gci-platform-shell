import { createClient } from '@supabase/supabase-js';

// ✅ 直接写死（不依赖 Vercel 环境变量，不会再白屏）
const SUPABASE_URL = 'https://mrrsbixkuqsynpucmggc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xwcGm3tuQJxtpWs4cByH5Q_1oUS5Swx';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
