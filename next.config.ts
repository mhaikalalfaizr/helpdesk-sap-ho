import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/berkas/:path*',
        
        destination: 'https://jrvwgkvwriipexnhkgri.supabase.co/storage/v1/object/public/documents/:path*',
      },
    ]
  },
}

module.exports = nextConfig

export default nextConfig;