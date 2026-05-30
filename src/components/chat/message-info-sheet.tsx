'use client'

import { X } from 'lucide-react'
import type { Message } from '@/types'

interface MessageInfoSheetProps {
  message: Message
  onClose: () => void
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">
        {value ?? <span className="text-muted-foreground font-normal">—</span>}
      </span>
    </div>
  )
}

function fmt(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) +
    ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function MessageInfoSheet({ message, onClose }: MessageInfoSheetProps) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-background px-6 pb-10 pt-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Message info</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Message preview */}
        {message.content && (
          <div className="mb-4 rounded-xl bg-muted px-4 py-3">
            <p className="text-sm text-foreground line-clamp-3">{message.content}</p>
          </div>
        )}

        <div>
          <InfoRow label="Sent"      value={fmt(message.createdAt)} />
          <InfoRow label="Delivered" value={fmt(message.deliveredAt)} />
          <InfoRow label="Read"      value={fmt(message.readAt)} />
        </div>
      </div>
    </>
  )
}
