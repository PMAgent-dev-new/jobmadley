import type { Metadata, Viewport } from 'next'
import { Inter, Zen_Maru_Gothic, Zen_Kaku_Gothic_New, Archivo_Black } from 'next/font/google'
import { Suspense } from 'react'
import './globals.css'
import {
  baseMetadata,
  generateOrganizationStructuredData,
  generateWebSiteStructuredData,
} from '@/shared/lib/metadata'
import UTMCapture from '@/features/application/components/utm-capture'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
})

const zenMaruGothic = Zen_Maru_Gothic({
  subsets: ['latin'],
  weight: ['500', '700', '900'],
  display: 'swap',
  variable: '--font-display',
})

const zenKakuGothicNew = Zen_Kaku_Gothic_New({
  subsets: ['latin'],
  weight: ['500', '700', '900'],
  display: 'swap',
  variable: '--font-body',
})

const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-eng',
})

export const metadata: Metadata = baseMetadata

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#ffffff' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID

  return (
    <html lang="ja" className={`${inter.className} ${zenMaruGothic.variable} ${zenKakuGothicNew.variable} ${archivoBlack.variable}`}>
      <head>
        {/* Google Tag Manager */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-5CQGTMXF');",
          }}
        />
        {/* End Google Tag Manager */}

        {/* Meta Pixel */}
        {metaPixelId && (
          <script
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaPixelId}');fbq('track','PageView');`,
            }}
          />
        )}
        {/* End Meta Pixel */}

        {/* DNS Prefetch for external domains */}
        <link rel="dns-prefetch" href="//images.microcms-assets.io" />
        <link rel="dns-prefetch" href="//ridejob.jp" />

        {/* NOTE: ロゴの手動preloadは next/image の最適化URLと一致せず全ページ二重DLに
            なっていたため削除（site-header 側の priority に委ねる） */}

        {/* サイト共通の構造化データ（エンティティ確立: Organization / WebSite+SearchAction） */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(generateOrganizationStructuredData()).replace(/</g, '\\u003c'),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(generateWebSiteStructuredData()).replace(/</g, '\\u003c'),
          }}
        />

        {/* Favicon */}
        <link rel="icon" href="/images/favicon.png" sizes="any" />
        <link rel="apple-touch-icon" href="/images/favicon.png" />
        
        {/* Disable browser auto-dark-mode (light theme only) */}
        <meta name="color-scheme" content="only light" />

        {/* Performance and Security */}
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta httpEquiv="X-Frame-Options" content="DENY" />
        <meta httpEquiv="X-XSS-Protection" content="1; mode=block" />
      </head>
      <body className="antialiased">
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-5CQGTMXF"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}

        {/* Meta Pixel (noscript) */}
        {metaPixelId && (
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              alt=""
              src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
            />
          </noscript>
        )}
        {/* End Meta Pixel (noscript) */}
        
        {/* UTMパラメーターキャプチャ */}
        <Suspense fallback={null}>
          <UTMCapture />
        </Suspense>
        
        {children}
      </body>
    </html>
  )
}
