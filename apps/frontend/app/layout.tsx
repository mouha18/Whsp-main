import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Whsp - Audio Transcription & Summarization',
  description: 'Mobile-first audio recording and AI-powered summarization app',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50">
          {children}
        </div>
      </body>
    </html>
  )
}