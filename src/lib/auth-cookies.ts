import { cookies } from 'next/headers'

export const ACCESS_TOKEN_COOKIE  = 'access_token'
export const REFRESH_TOKEN_COOKIE = 'refresh_token'
export const ACCESS_TTL_SECONDS   = 15 * 60               // 15 minutes
export const REFRESH_TTL_SECONDS  = 30 * 24 * 60 * 60     // 30 days

const IS_PROD = process.env.NODE_ENV === 'production'

export async function setAuthCookies(accessToken: string, refreshToken: string): Promise<void> {
  const jar = await cookies()
  jar.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: ACCESS_TTL_SECONDS,
    path: '/',
  })
  jar.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: REFRESH_TTL_SECONDS,
    path: '/',
  })
}

export async function clearAuthCookies(): Promise<void> {
  const jar = await cookies()
  jar.set(ACCESS_TOKEN_COOKIE,  '', { maxAge: 0, path: '/' })
  jar.set(REFRESH_TOKEN_COOKIE, '', { maxAge: 0, path: '/' })
}

export async function getAccessToken(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(ACCESS_TOKEN_COOKIE)?.value ?? null
}

export async function getRefreshToken(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(REFRESH_TOKEN_COOKIE)?.value ?? null
}
