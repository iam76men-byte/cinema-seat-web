import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tfohsefbkdbzqbeoolsa.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_mL8KPUhPDadEeRKJk__B-g_eM2Y02Y-';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
