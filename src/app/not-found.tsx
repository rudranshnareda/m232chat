import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-background px-8 text-center">
      <p className="text-5xl font-bold text-muted-foreground/40">404</p>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          This link doesn't exist or you don't have access.
        </p>
      </div>
      <Link
        href="/chats"
        className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Back to chats
      </Link>
    </div>
  )
}
