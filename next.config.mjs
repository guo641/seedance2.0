/** @type {import('next').NextConfig} */
const nextConfig = {
  // 桌面客户端(Electron)需要独立可执行产物
  output: 'standalone',
  // better-sqlite3 / ffmpeg-static are native/binary deps — keep them external to the server bundle
  serverExternalPackages: ['better-sqlite3', 'fluent-ffmpeg', 'ffmpeg-static', 'ffprobe-static'],
  experimental: {
    // allow large video uploads through route handlers
    serverActions: { bodySizeLimit: '250mb' },
  },
};

export default nextConfig;
