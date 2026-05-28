import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

let cachedClient: any = null;

/**
 * A lazy-loaded Supabase client instance using a JavaScript Proxy.
 * This prevents Next.js / Turbopack from executing the client creation code
 * during the static build/module evaluation phase.
 */
export const supabase = new Proxy({} as any, {
  get(_, prop) {
    if (!cachedClient) {
      cachedClient = createClient(supabaseUrl, supabaseAnonKey);
    }
    return cachedClient[prop];
  },
});