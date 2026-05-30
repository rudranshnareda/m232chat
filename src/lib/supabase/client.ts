import { createClient } from '@supabase/supabase-js'

// Browser-side Supabase client.
// Pass the JWT from the auth store so Supabase RLS can identify the user.
// Called once when the token is set/refreshed — do not recreate per render.
export function createSupabaseBrowserClient(jwt: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } },
    }
  )
}
