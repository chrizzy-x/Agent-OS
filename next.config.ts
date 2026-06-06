import type { NextConfig } from 'next';

const distDir = process.env.NEXT_DIST_DIR?.trim();

const config: NextConfig = {
  ...(distDir ? { distDir } : {}),
  serverExternalPackages: ['ioredis', '@supabase/supabase-js', 'jsonwebtoken'],
  webpack: (webpackConfig) => {
    // Allow .js imports to resolve to .ts files (used throughout src/)
    webpackConfig.resolve.extensionAlias = {
      '.js': ['.ts', '.js'],
    };
    return webpackConfig;
  },
};

export default config;
