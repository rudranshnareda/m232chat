import { NextRequest } from 'next/server'
import { runEphemeralCleanup } from '@/lib/ephemeral'

// POST /api/cleanup
// Runs ephemeral message cleanup for the current user.
// Called on every page load/refresh from the AuthProvider so that
// messages the user chose not to save are wiped on reload rather
// than only on login.
export async function POST(request: NextRequest) {
  const meId = request.headers.get('x-user-id')
  if (!meId) return Response.json({ ok: false }, { status: 401 })
  await runEphemeralCleanup(meId)
  return Response.json({ ok: true })
}
