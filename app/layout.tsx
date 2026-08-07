import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ServiceWorkerRegistration } from '@/components/service-worker'
import './globals.css'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: 'Mon Top Albums',
  description: 'Ma sélection personnelle de mes albums préférés en mosaïque',
  applicationName: 'Top Albums',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
  // Nécessaire pour qu'iOS lance l'application en plein écran depuis l'écran d'accueil.
  appleWebApp: {
    capable: true,
    title: 'Top Albums',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  // L'application force le thème sombre : les contrôles natifs doivent suivre.
  colorScheme: 'dark',
  themeColor: '#171717',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className={`dark ${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased bg-background font-sans">
        {children}
        <ServiceWorkerRegistration />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
