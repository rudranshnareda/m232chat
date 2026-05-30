'use client'

import { PageHeader } from '@/components/layout/page-header'
import { useUser } from '@/store/auth'
import { useLogout } from '@/hooks/use-logout'
import { LogOut } from 'lucide-react'

export default function ProfilePage() {
  const user = useUser()
  const logout = useLogout()

  return (
    <>
      <PageHeader
        title="Profile"
        right={
          <button
            onClick={logout}
            className="flex items-center justify-center rounded-full p-1.5 text-muted-foreground transition-colors hover:text-destructive"
            aria-label="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        }
      />
      <main className="flex flex-1 flex-col items-center gap-4 overflow-y-auto p-6">
        {/* Avatar */}
        <div className="h-20 w-20 overflow-hidden rounded-full bg-muted">
          {user?.profilePhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.profilePhoto} alt={user.username} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground">
              {user?.username?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
        </div>

        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">@{user?.username}</p>
          {user?.bio && (
            <p className="mt-1 text-sm text-muted-foreground">{user.bio}</p>
          )}
        </div>
      </main>
    </>
  )
}
