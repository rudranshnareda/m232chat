import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Server-side Supabase client scoped to a specific user's JWT.
// RLS policies apply — user can only access their own data.
export function createSupabaseServerClient(jwt: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}

// Admin client — bypasses RLS entirely.
// Use only for: registration, login lookup, ephemeral cleanup, session management.
// Never expose this to the browser.
// Singleton so we don't create a new instance on every API call.
let _adminClient: SupabaseClient | null = null

export function createSupabaseAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
  }
  return _adminClient
}
