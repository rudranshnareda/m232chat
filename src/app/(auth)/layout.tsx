export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        {/* App wordmark */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">m232chat</h1>
          <p className="mt-1 text-sm text-muted-foreground">Private messaging</p>
        </div>
        {children}
      </div>
    </div>
  )
}
