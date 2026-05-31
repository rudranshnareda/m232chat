import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/providers/auth-provider'
import { QueryProvider } from '@/providers/query-provider'
import { Toaster } from '@/components/ui/sonner'
import { getAccessToken } from '@/lib/auth-cookies'
import { verifyAccessToken } from '@/lib/jwt'
import type { AuthUser } from '@/types'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

export const metadata: Metadata = {
  title: 'm232chat',
  description: 'Private messaging for people who matter.',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // Resize the layout viewport when the virtual keyboard opens so the
  // flex layout (header + messages + input) fits in the visible area.
  // Supported Chrome 108+ / Android. On iOS it's a no-op but doesn't break.
  interactiveWidget: 'resizes-content',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the access token from the httpOnly cookie (server-side only).
  // The middleware has already validated it for protected routes,
  // so we decode without re-verifying for speed. On public routes
  // (login/register) this will be null and AuthProvider handles it.
  let initialUser: AuthUser | null = null
  let initialToken: string | null  = null

  const token = await getAccessToken()
  if (token) {
    const payload = await verifyAccessToken(token)
    if (payload) {
      initialUser = {
        id:           payload.sub,
        username:     payload.username,
        sessionId:    payload.sessionId,
        profilePhoto: payload.profilePhoto,
        bio:          payload.bio,
      }
      initialToken = token
    }
  }

  return (
    <html lang="en" className={`${geist.variable} dark h-full`}>
      <body className="h-full bg-background text-foreground antialiased">
        <QueryProvider>
          <AuthProvider initialUser={initialUser} initialToken={initialToken}>
            {children}
            <Toaster position="top-center" richColors />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
