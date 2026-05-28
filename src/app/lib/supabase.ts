// Location: src/app/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Fallback to dummy strings during Vercel's build phase to prevent module evaluation crashes
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project-id.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);