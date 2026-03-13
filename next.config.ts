import type { NextConfig } from 'next';

const config: NextConfig = {
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
