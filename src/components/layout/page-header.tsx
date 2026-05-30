import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  left?: React.ReactNode
  right?: React.ReactNode
  className?: string
}

export function PageHeader({ title, left, right, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm',
        className
      )}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* Left slot — usually a back button */}
      <div className="flex w-10 items-center">{left}</div>

      {/* Title */}
      <h1 className="text-base font-semibold text-foreground">{title}</h1>

      {/* Right slot — action buttons */}
      <div className="flex w-10 items-center justify-end">{right}</div>
    </header>
  )
}
