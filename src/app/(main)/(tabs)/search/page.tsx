'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Search, X } from 'lucide-react'
import { PageHeader }      from '@/components/layout/page-header'
import { UserAvatar }      from '@/components/ui/user-avatar'
import { UserListSkeleton } from '@/components/ui/skeleton'
import { useDebounce }     from '@/hooks/use-debounce'
import type { ConnectionStatus, UserProfile } from '@/types'

interface SearchUser extends UserProfile {
  connectionStatus: ConnectionStatus
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  none:             '',
  request_sent:     'Pending',
  request_received: 'Wants to connect',
  connected:        'Connected',
}

async function searchUsers(q: string): Promise<SearchUser[]> {
  const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error('Search failed')
  const data = await res.json()
  return data.users as SearchUser[]
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)

  const { data: users = [], isFetching, isError } = useQuery({
    queryKey: ['user-search', debouncedQuery],
    queryFn:  () => searchUsers(debouncedQuery),
    enabled:  debouncedQuery.length > 0,
    staleTime: 30_000,
  })

  return (
    <>
      <PageHeader title="Search" />

      {/* Search input */}
      <div className="border-b border-border px-4 py-2">
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by username…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <main className="flex flex-1 flex-col overflow-y-auto">
        {/* Empty / idle state */}
        {debouncedQuery.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 p-8 text-center">
            <Search className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Type a username to search</p>
          </div>
        )}

        {/* Loading */}
        {isFetching && debouncedQuery.length > 0 && <UserListSkeleton count={4} />}

        {/* Error */}
        {isError && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-destructive">Search failed — please try again</p>
          </div>
        )}

        {/* Results */}
        {!isFetching && !isError && debouncedQuery.length > 0 && (
          <>
            {users.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-1 p-8 text-center">
                <p className="text-sm text-muted-foreground">No users found for &ldquo;{debouncedQuery}&rdquo;</p>
              </div>
            ) : (
              <ul>
                {users.map(user => (
                  <li key={user.id}>
                    <Link
                      href={`/users/${user.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 active:bg-muted"
                    >
                      <UserAvatar username={user.username} profilePhoto={user.profilePhoto} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">@{user.username}</p>
                        {user.bio && (
                          <p className="truncate text-xs text-muted-foreground">{user.bio}</p>
                        )}
                      </div>
                      {user.connectionStatus !== 'none' && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {STATUS_LABEL[user.connectionStatus]}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  )
}
