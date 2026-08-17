import { createRequire } from 'node:module'

// 廃止した企業ページの遷移先はマスタ（companies.data.json）を唯一の出所にする。
// ここに直書きすると、表から slug を消したときにリダイレクトだけ取り残される。
const require = createRequire(import.meta.url)
/** @type {{ retired: Array<{ slug: string, redirectTo: string }> }} */
const companiesData = require('./src/features/companies/companies.data.json')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack設定（Next.js 16でデフォルト有効）
  turbopack: {},

  // 実験的機能
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },

  // 外部パッケージを RSC 向けに許可
  serverExternalPackages: ['microcms-js-sdk'],

  // 画像最適化設定
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.microcms-assets.io',
      },
      {
        protocol: 'https',
        hostname: 'ridejob.jp',
      },
    ],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7日間
    unoptimized: false,
  },

  // コンパイル最適化
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // パフォーマンス最適化
  poweredByHeader: false,
  compress: true,

  // HTTP ヘッダー設定
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/images/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },

  // リダイレクト設定
  async redirects() {
    return [
      // 在庫が維持下限を割って畳んだ企業ページ。dynamicParams=false で404になる前にここで拾う。
      // 404にせず301で送るのは、既にインデックスされたURLと外部リンクを捨てないため。
      ...companiesData.retired.map((company) => ({
        source: `/companies/${company.slug}`,
        destination: company.redirectTo,
        permanent: true,
      })),
    ]
  },

  // 環境変数の設定
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Webpack設定の拡張
  webpack: (config, { dev, isServer }) => {
    // プロダクションビルド時の最適化
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          framework: {
            chunks: 'all',
            name: 'framework',
            test: /[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types|use-subscription)[\\/]/,
            priority: 40,
            enforce: true,
          },
          lib: {
            test: /[\\/]node_modules[\\/]/,
            name: 'lib',
            priority: 30,
            minChunks: 1,
            reuseExistingChunk: true,
          },
          commons: {
            name: 'commons',
            minChunks: 2,
            chunks: 'all',
            priority: 20,
            reuseExistingChunk: true,
          },
        },
      }
    }

    return config
  },
}

export default nextConfig
