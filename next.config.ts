import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@supabase/supabase-js'],
  // If you are using an older version of Next.js 14/15, use this instead:
  // experimental: { serverComponentsExternalPackages: ['@supabase/supabase-js'] }
};

export default nextConfig;