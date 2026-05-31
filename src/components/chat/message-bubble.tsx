import { Check, CheckCheck, Clock, AlertCircle, Play, Pause } from 'lucide-react'
import { useRef, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useLongPress } from '@/hooks/use-long-press'
import type { Message, MessageDeliveryStatus, MessageReaction } from '@/types'

interface MessageBubbleProps {
  message:        Message
  isMe:           boolean
  meId:           string
  myUsername?:    string
  otherUsername?: string
  /** Resolved reply-to message (looked up from local messages map by caller) */
  replyTo?:       Pick<Message, 'id' | 'senderId' | 'content' | 'messageType'> | null
  onLongPress:    () => void
  onReact:        (emoji: string) => void
  onRetry?:       () => void
}

const TYPE_LABEL: Partial<Record<string, string>> = {
  image: '📷 Photo', video: '🎬 Video', voice_note: '🎤 Voice note',
  file: '📎 File', link: '🔗 Link',
}

function msgText(messageType: string, content: string | null) {
  return messageType === 'text' ? (content ?? '') : (TYPE_LABEL[messageType] ?? messageType)
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

const AUDIO_EXTS = /\.(webm|m4a|mp3|ogg|opus|wav|aac|flac)(\?|$)/i
function isAudioUrl(url: string | null): boolean {
  return !!url && AUDIO_EXTS.test(url)
}

// ── Delivery tick ────────────────────────────────────────────────────────────
function DeliveryTick({ status }: { status: MessageDeliveryStatus | undefined }) {
  switch (status) {
    case 'sending':   return <Clock       className="h-3 w-3 opacity-40" />
    case 'failed':    return <AlertCircle className="h-3 w-3 text-destructive" />
    case 'sent':      return <Check       className="h-3 w-3 opacity-50" />
    case 'delivered': return <CheckCheck  className="h-3 w-3 opacity-60" />
    case 'read':      return <CheckCheck  className="h-3 w-3 opacity-100" />
    default:          return null
  }
}

// ── Reply quote ──────────────────────────────────────────────────────────────
function ReplyQuote({
  replyTo, isInMyBubble, isEphemeral, meId, myUsername, otherUsername,
}: {
  replyTo:        Pick<Message, 'id' | 'senderId' | 'content' | 'messageType'>
  isInMyBubble:   boolean
  isEphemeral:    boolean
  meId:           string
  myUsername?:    string
  otherUsername?: string
}) {
  const replyByMe  = replyTo.senderId === meId
  const authorName = replyByMe ? (myUsername ?? 'You') : (otherUsername ?? 'Them')
  const preview    = msgText(replyTo.messageType, replyTo.content)

  return (
    <div className={cn(
      'mb-1.5 rounded-lg border-l-[3px] px-2 py-1',
      isInMyBubble && isEphemeral  ? 'border-violet-200/50 bg-violet-200/10'  :
      isInMyBubble                 ? 'border-primary-foreground/60 bg-primary-foreground/10' :
      isEphemeral                  ? 'border-violet-400/50 bg-violet-500/10'  :
                                     'border-primary/60 bg-muted-foreground/10'
    )}>
      <p className={cn(
        'truncate text-[10px] font-semibold',
        isInMyBubble && isEphemeral  ? 'text-violet-100/90'  :
        isInMyBubble                 ? 'text-primary-foreground/80' :
        isEphemeral                  ? 'text-violet-400'     :
                                       'text-primary'
      )}>
        {authorName}
      </p>
      <p className={cn(
        'truncate text-xs',
        isInMyBubble && isEphemeral  ? 'text-violet-100/70'  :
        isInMyBubble                 ? 'text-primary-foreground/70' :
        isEphemeral                  ? 'text-violet-300/80'  :
                                       'text-muted-foreground'
      )}>
        {preview.length > 60 ? preview.slice(0, 60) + '…' : preview}
      </p>
    </div>
  )
}

// ── Voice note player ────────────────────────────────────────────────────────
const WAVE_HEIGHTS = [3,5,4,7,6,8,5,9,6,4,8,5,7,6,4,5,8,6,9,5,7,4,6,8,5,4,6,3]

function fmtSecs(s: number) {
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

function VoiceNotePlayer({ src, isMe }: { src: string; isMe: boolean }) {
  const audioRef   = useRef<HTMLAudioElement>(null)
  const [playing,  setPlaying]  = useState(false)
  const [elapsed,  setElapsed]  = useState(0)
  const [total,    setTotal]    = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onMeta  = () => setTotal(isFinite(audio.duration) ? Math.round(audio.duration) : 0)
    const onTime  = () => setElapsed(Math.floor(audio.currentTime))
    const onEnd   = () => { setPlaying(false); setElapsed(0) }
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('timeupdate',     onTime)
    audio.addEventListener('ended',          onEnd)
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('timeupdate',     onTime)
      audio.removeEventListener('ended',          onEnd)
    }
  }, [])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else         audio.play().catch(() => {})
    setPlaying(!playing)
  }

  const progress = total > 0 ? elapsed / total : 0

  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={e => { e.stopPropagation(); toggle() }}
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isMe ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'
        )}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing
          ? <Pause className="h-3.5 w-3.5 fill-current" />
          : <Play  className="h-3.5 w-3.5 fill-current" />
        }
      </button>

      {/* Waveform */}
      <div className="flex flex-1 items-center gap-px" style={{ height: 28 }}>
        {WAVE_HEIGHTS.map((h, i) => {
          const active = i < progress * WAVE_HEIGHTS.length
          return (
            <div
              key={i}
              className={cn(
                'w-full rounded-full transition-colors',
                isMe
                  ? active ? 'bg-primary-foreground' : 'bg-primary-foreground/30'
                  : active ? 'bg-primary'             : 'bg-muted-foreground/30'
              )}
              style={{ height: `${h * 3}px` }}
            />
          )
        })}
      </div>

      <span className={cn(
        'w-9 shrink-0 text-right text-[10px] tabular-nums',
        isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'
      )}>
        {fmtSecs(playing ? elapsed : total)}
      </span>
    </div>
  )
}

// ── Reaction bar ─────────────────────────────────────────────────────────────
function ReactionBar({ reactions, isMe, onToggle }: {
  reactions: MessageReaction[]
  isMe:      boolean
  onToggle:  (emoji: string) => void
}) {
  if (!reactions.length) return null
  return (
    <div className={cn('mt-1 flex flex-wrap gap-1', isMe ? 'justify-end' : 'justify-start')}>
      {reactions.map(r => (
        <button
          key={r.emoji}
          onClick={e => { e.stopPropagation(); onToggle(r.emoji) }}
          className={cn(
            'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
            r.byMe
              ? 'border-primary/50 bg-primary/15 text-primary'
              : 'border-border bg-muted text-foreground hover:bg-muted/80'
          )}
        >
          <span className="text-sm leading-none">{r.emoji}</span>
          {r.count > 1 && <span className="tabular-nums">{r.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ── Bubble ───────────────────────────────────────────────────────────────────
export function MessageBubble({
  message, isMe, meId, myUsername, otherUsername, replyTo, onLongPress, onReact, onRetry,
}: MessageBubbleProps) {
  const isFailed = message.deliveryStatus === 'failed'
  const lp = useLongPress(onLongPress, 450)

  // Ephemeral = this message will vanish for ME on the next refresh
  const isEphemeral = isMe ? message.senderSaved === false : message.receiverSaved === false

  return (
    <div
      className={cn('flex w-full select-none flex-col', isMe ? 'items-end' : 'items-start')}
      {...lp}
      onContextMenu={e => { e.preventDefault(); onLongPress() }}
    >
      <div className={cn(
        'relative max-w-[75%] rounded-2xl px-3.5 py-2 text-sm',
        isMe && isEphemeral  ? 'rounded-br-sm bg-violet-600 text-white'            :
        isMe                 ? 'rounded-br-sm bg-primary text-primary-foreground'   :
        isEphemeral          ? 'rounded-bl-sm bg-violet-500/20 text-foreground'     :
                               'rounded-bl-sm bg-muted text-foreground',
        message.isOptimistic && message.deliveryStatus === 'sending' && 'opacity-70',
        isFailed && 'opacity-60',
      )}>
        {/* Reply quote */}
        {replyTo && (
          <ReplyQuote
            replyTo={replyTo}
            isInMyBubble={isMe}
            isEphemeral={isEphemeral}
            meId={meId}
            myUsername={myUsername}
            otherUsername={otherUsername}
          />
        )}

        {/* Content */}
        {message.messageType === 'text' ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : message.messageType === 'image' ? (
          <img
            src={message.content ?? ''}
            alt="Sent image"
            className="max-h-64 max-w-full rounded-lg"
          />
        ) : message.messageType === 'video' ? (
          <video
            src={message.content ?? ''}
            controls
            className="max-h-64 max-w-full rounded-lg"
          />
        ) : message.messageType === 'voice_note' ? (
          message.isOptimistic
            ? <p className="italic text-xs opacity-70">🎤 Sending voice note…</p>
            : <VoiceNotePlayer src={message.content ?? ''} isMe={isMe} />
        ) : message.messageType === 'file' && isAudioUrl(message.content) ? (
          // Fallback: file classified incorrectly but URL is audio — render player
          <VoiceNotePlayer src={message.content ?? ''} isMe={isMe} />
        ) : message.messageType === 'file' ? (
          <a
            href={message.content ?? '#'}
            download
            className="flex items-center gap-2 font-medium text-primary hover:underline"
          >
            <span>📎</span>
            <span>{message.content?.split('/').pop() ?? 'Download'}</span>
          </a>
        ) : (
          <p className="italic">{TYPE_LABEL[message.messageType] ?? message.messageType}</p>
        )}

        {/* Footer: time + delivery tick */}
        <div className={cn(
          'mt-0.5 flex items-center gap-1 justify-end',
          isMe && isEphemeral  ? 'text-violet-200/80'       :
          isMe                 ? 'text-primary-foreground/70' :
          isEphemeral          ? 'text-violet-400/80'        :
                                 'text-muted-foreground'
        )}>
          {isFailed && (
            <button
              onClick={e => { e.stopPropagation(); onRetry?.() }}
              className="text-[10px] text-destructive underline-offset-2 hover:underline"
            >
              Tap to retry
            </button>
          )}
          <span className="text-[10px]">{fmt(message.createdAt)}</span>
          {isMe && <DeliveryTick status={message.deliveryStatus} />}
        </div>
      </div>

      {/* Reactions sit outside the bubble, aligned to the same side */}
      {(message.reactions?.length ?? 0) > 0 && (
        <ReactionBar
          reactions={message.reactions!}
          isMe={isMe}
          onToggle={onReact}
        />
      )}
    </div>
  )
}
