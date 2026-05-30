import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken } from '@/lib/jwt'
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookies'

// Routes that never require authentication
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Read token from cookie (httpOnly — set by auth routes)
  // or from Authorization header (for programmatic API callers)
  const cookieToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value
  const authHeader  = request.headers.get('authorization')
  const token       = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : cookieToken

  if (!token) {
    return redirectOrUnauthorized(request)
  }

  const payload = await verifyAccessToken(token)

  if (!payload) {
    const response = redirectOrUnauthorized(request)
    // Clear the stale cookie so the client doesn't keep sending it
    if (response instanceof NextResponse) {
      response.cookies.set(ACCESS_TOKEN_COOKIE, '', { maxAge: 0, path: '/' })
    }
    return response
  }

  // Forward verified user context to API route handlers via request headers.
  // Handlers read these with request.headers.get('x-user-id') etc.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id',    payload.sub)
  requestHeaders.set('x-username',   payload.username)
  requestHeaders.set('x-session-id', payload.sessionId)

  return NextResponse.next({ request: { headers: requestHeaders } })
}

function redirectOrUnauthorized(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)',
  ],
}
