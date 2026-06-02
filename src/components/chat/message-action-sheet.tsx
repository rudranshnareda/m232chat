'use client'

import { Reply, Trash2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Message } from '@/types'

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

interface MessageActionSheetProps {
  message:       Message
  isMe:          boolean
  onReply:       () => void
  onReact:       (emoji: string) => void
  onDeleteForMe: () => void
  onDeleteForBoth?: () => void   // only provided when isMe
  onInfo:        () => void
  onClose:       () => void
}

// ── Message preview (truncated) shown at top of sheet ──────────────────────
function MessagePreview({ message }: { message: Message }) {
  const TYPE_LABEL: Partial<Record<string, string>> = {
    image: 'Photo', video: 'Video', audio: 'Voice note', file: 'File',
  }
  const text = message.messageType === 'text'
    ? (message.content ?? '')
    : (TYPE_LABEL[message.messageType] ?? message.messageType)

  return (
    <p className="truncate text-sm text-muted-foreground">
      {text.length > 60 ? text.slice(0, 60) + '…' : text}
    </p>
  )
}

// ── Action row ─────────────────────────────────────────────────────────────
function ActionRow({
  icon, label, onClick, destructive = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-4 px-2 py-3 text-left text-sm transition-colors rounded-xl hover:bg-muted',
        destructive ? 'text-destructive' : 'text-foreground'
      )}
    >
      <span className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
        destructive ? 'bg-destructive/10' : 'bg-muted'
      )}>
        {icon}
      </span>
      {label}
    </button>
  )
}

// ── Sheet ──────────────────────────────────────────────────────────────────
export function MessageActionSheet({
  message, isMe, onReply, onReact, onDeleteForMe, onDeleteForBoth, onInfo, onClose,
}: MessageActionSheetProps) {
  const myReactions = new Set(
    (message.reactions ?? []).filter(r => r.byMe).map(r => r.emoji)
  )

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-background px-4 pb-10 pt-3 shadow-xl">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <MessagePreview message={message} />
          <button
            onClick={onClose}
            className="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Reaction row */}
        <div className="mb-3 flex items-center justify-around rounded-2xl bg-muted px-2 py-2">
          {REACTION_EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => { onReact(emoji); onClose() }}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full text-xl transition-all active:scale-90',
                myReactions.has(emoji)
                  ? 'bg-primary/20 ring-2 ring-primary/40 scale-110'
                  : 'hover:bg-background hover:scale-110'
              )}
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="space-y-0.5">
          <ActionRow
            icon={<Reply className="h-4 w-4" />}
            label="Reply"
            onClick={onReply}
          />
          <ActionRow
            icon={<Info className="h-4 w-4" />}
            label="Info"
            onClick={onInfo}
          />
          <ActionRow
            icon={<Trash2 className="h-4 w-4" />}
            label="Delete for me"
            onClick={onDeleteForMe}
            destructive
          />
          {isMe && onDeleteForBoth && (
            <ActionRow
              icon={<Trash2 className="h-4 w-4" />}
              label="Delete for everyone"
              onClick={onDeleteForBoth}
              destructive
            />
          )}
        </div>
      </div>
    </>
  )
}
