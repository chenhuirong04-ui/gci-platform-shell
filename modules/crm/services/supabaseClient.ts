import { createClient } from '@supabase/supabase-js';

// ✅ 直接写死（不依赖 Vercel 环境变量，不会再白屏）
const SUPABASE_URL = 'https://efrkvwhzpgahjgfukjth.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0IBQM1t4AVWpTRG1NL0JXQ_ATqn9vhV';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
