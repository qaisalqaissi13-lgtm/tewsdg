import type { Metadata } from 'next'

import { Analytics } from '@vercel/analytics/next'
import './globals.css'

import { Geist_Mono, Comfortaa as V0_Font_Comfortaa, Geist_Mono as V0_Font_Geist_Mono } from 'next/font/google'

const _comfortaa = V0_Font_Comfortaa({ subsets: ['latin'], weight: ["300","400","500","600","700"] })
const _geistMono = V0_Font_Geist_Mono({ subsets: ['latin'], weight: ["100","200","300","400","500","600","700","800","900"] })

export const metadata: Metadata = {
  title: 'Break Tracker - Supervisor Dashboard',
  description: 'Monitor and manage worker breaks in real-time',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" fontSize="90">⏱️</text></svg>',
        type: 'image/svg+xml',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
