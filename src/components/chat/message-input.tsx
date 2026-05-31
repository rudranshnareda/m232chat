'use client'

import { forwardRef, useRef, useCallback, useState, useEffect } from 'react'
import { Send, X, Reply, Paperclip, Loader2, Mic, Square, Play, Pause, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVoiceRecorder } from '@/hooks/use-voice-recorder'
import type { Message } from '@/types'

interface MessageInputProps {
  onSend:          (content: string) => void
  onSendMedia?:    (file: File) => Promise<void>
  disabled?:       boolean
  isSendingMedia?: boolean
  replyTo?:        Message | null
  onCancelReply?:  () => void
  myUsername?:     string
  otherUsername?:  string
  meId?:           string
}

const TYPE_LABEL: Partial<Record<string, string>> = {
  image: '📷 Photo', video: '🎬 Video', voice_note: '🎤 Voice note',
  file: '📎 File', link: '🔗 Link',
}

function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── Recording bar ────────────────────────────────────────────────────────────
function RecordingBar({ duration, onStop, onDiscard }: {
  duration: number
  onStop:   () => void
  onDiscard: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <button
        onClick={onDiscard}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
        aria-label="Discard recording"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <div className="flex flex-1 items-center gap-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
        </span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-destructive transition-all duration-1000"
            style={{ width: `${Math.min((duration / 120) * 100, 100)}%` }}
          />
        </div>
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
          {fmtDuration(duration)}
        </span>
      </div>
      <button
        onClick={onStop}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive text-white"
        aria-label="Stop recording"
      >
        <Square className="h-4 w-4 fill-current" />
      </button>
    </div>
  )
}

// ── Preview bar (recorded, not yet sent) ─────────────────────────────────────
function RecordedBar({ blob, duration, onDiscard, onSend, isSending }: {
  blob:      Blob
  duration:  number
  onDiscard: () => void
  onSend:    () => void
  isSending: boolean
}) {
  const [isPlaying,    setIsPlaying]    = useState(false)
  const [elapsed,      setElapsed]      = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const urlRef   = useRef<string | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(blob)
    urlRef.current = url
    if (audioRef.current) audioRef.current.src = url
    return () => { URL.revokeObjectURL(url) }
  }, [blob])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) { audio.pause() }
    else           { audio.play().catch(() => {}) }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <button
        onClick={onDiscard}
        disabled={isSending}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40"
        aria-label="Discard"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); setElapsed(0) }}
        onTimeUpdate={e => setElapsed(Math.floor((e.target as HTMLAudioElement).currentTime))}
      />

      <button
        onClick={togglePlay}
        disabled={isSending}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying
          ? <Pause className="h-4 w-4 fill-current" />
          : <Play  className="h-4 w-4 fill-current" />
        }
      </button>

      <div className="flex flex-1 flex-col gap-0.5">
        {/* Decorative waveform bars */}
        <div className="flex items-center gap-px h-7">
          {Array.from({ length: 28 }).map((_, i) => {
            const heights = [3,5,4,7,6,8,5,9,6,4,8,5,7,6,4,5,8,6,9,5,7,4,6,8,5,4,6,3]
            const active = isPlaying && i < (elapsed / duration) * 28
            return (
              <div
                key={i}
                className={cn(
                  'w-full rounded-full transition-colors',
                  active ? 'bg-primary' : 'bg-muted-foreground/40'
                )}
                style={{ height: `${heights[i % heights.length] * 3}px` }}
              />
            )
          })}
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {fmtDuration(isPlaying ? elapsed : duration)}
        </span>
      </div>

      <button
        onClick={onSend}
        disabled={isSending}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        aria-label="Send voice note"
      >
        {isSending
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Send className="h-4 w-4" />
        }
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export const MessageInput = forwardRef<HTMLTextAreaElement, MessageInputProps>(
  function MessageInput(
    { onSend, onSendMedia, disabled, isSendingMedia, replyTo, onCancelReply, myUsername, otherUsername, meId },
    ref,
  ) {
    const [value, setValue] = useState('')
    const internalRef  = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const { recordingState, duration, blob, mimeType, micError, startRecording, stopRecording, discard } =
      useVoiceRecorder()

    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) ?? internalRef

    const resize = useCallback(() => {
      const el = textareaRef.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 128)}px`
    }, [textareaRef])

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value)
      resize()
    }

    const handleSend = () => {
      const trimmed = value.trim()
      if (!trimmed || disabled) return
      // Assert focus BEFORE triggering onSend. onSend is async and causes the
      // parent to re-render. Keeping focus here means the textarea never blurs
      // even if a parent re-render races with this call.
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.focus()
      }
      onSend(trimmed)
      setValue('')
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    }

    const handleFileSelect = useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !onSendMedia) return
        try { await onSendMedia(file) }
        finally { if (fileInputRef.current) fileInputRef.current.value = '' }
      },
      [onSendMedia]
    )

    const handleSendVoiceNote = useCallback(async () => {
      if (!blob || !onSendMedia) return
      const ext  = mimeType.includes('mp4') ? 'm4a' : 'webm'
      const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: mimeType })
      try { await onSendMedia(file) }
      finally { discard() }
    }, [blob, mimeType, onSendMedia, discard])

    const canSend    = value.trim().length > 0 && !disabled
    const showMic    = !canSend && !!onSendMedia && recordingState === 'idle'

    // Reply preview helpers
    const replyAuthor = replyTo
      ? (replyTo.senderId === meId ? (myUsername ?? 'You') : (otherUsername ?? 'Them'))
      : null
    const replyPreview = replyTo
      ? (replyTo.messageType === 'text'
          ? (replyTo.content ?? '')
          : (TYPE_LABEL[replyTo.messageType] ?? replyTo.messageType))
      : null

    return (
      <div
        className="shrink-0 border-t border-border bg-background/95 backdrop-blur-sm"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          disabled={disabled || isSendingMedia}
          className="hidden"
          accept="image/*,video/*,.pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx"
        />

        {/* Reply preview bar */}
        {replyTo && recordingState === 'idle' && (
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Reply className="h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 border-l-2 border-primary pl-2">
              <p className="truncate text-[11px] font-semibold text-primary">{replyAuthor}</p>
              <p className="truncate text-xs text-muted-foreground">
                {replyPreview && replyPreview.length > 60
                  ? replyPreview.slice(0, 60) + '…'
                  : replyPreview}
              </p>
            </div>
            <button
              onClick={onCancelReply}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Cancel reply"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Mic error toast */}
        {micError && (
          <p className="px-4 pb-1 text-[11px] text-destructive">{micError}</p>
        )}

        {/* Recording state — replaces input row */}
        {recordingState === 'recording' && (
          <RecordingBar
            duration={duration}
            onStop={stopRecording}
            onDiscard={discard}
          />
        )}

        {/* Recorded state — preview before sending */}
        {recordingState === 'recorded' && blob && (
          <RecordedBar
            blob={blob}
            duration={duration}
            onDiscard={discard}
            onSend={handleSendVoiceNote}
            isSending={!!isSendingMedia}
          />
        )}

        {/* Normal input row */}
        {recordingState === 'idle' && (
          <div className="flex items-end gap-2 px-3 py-2">
            <textarea
              ref={ref ?? internalRef}
              rows={1}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Message…"
              disabled={disabled || isSendingMedia}
              className={cn(
                'flex-1 resize-none rounded-2xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground',
                'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40',
                'disabled:opacity-50 max-h-32 overflow-y-auto',
              )}
            />

            {/* Paperclip */}
            {onSendMedia && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isSendingMedia}
                aria-label="Attach media"
                className={cn(
                  'mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                  'bg-muted text-foreground transition-colors disabled:opacity-30',
                  !disabled && !isSendingMedia && 'hover:bg-muted-foreground/20',
                )}
              >
                <Paperclip className="h-4 w-4" />
              </button>
            )}

            {/* Mic (only when textarea is empty) */}
            {showMic && (
              <button
                onClick={startRecording}
                disabled={disabled || isSendingMedia}
                aria-label="Record voice note"
                className={cn(
                  'mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                  'bg-primary text-primary-foreground transition-opacity disabled:opacity-30',
                  !disabled && !isSendingMedia && 'hover:opacity-90',
                )}
              >
                <Mic className="h-4 w-4" />
              </button>
            )}

            {/* Send (only when text is present) */}
            {/* Using div instead of button so tapping it cannot steal focus   */}
            {/* from the textarea — buttons are focusable and blur the input,  */}
            {/* dismissing the mobile keyboard. A div with no tabIndex is not  */}
            {/* focusable, so the keyboard stays open after every send.        */}
            {!showMic && (
              <div
                role="button"
                aria-label="Send message"
                aria-disabled={!canSend || !!isSendingMedia}
                onClick={canSend && !isSendingMedia ? handleSend : undefined}
                className={cn(
                  'mb-0.5 flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full',
                  'bg-primary text-primary-foreground transition-opacity',
                  (!canSend || !!isSendingMedia) ? 'opacity-30' : 'cursor-pointer hover:opacity-90',
                )}
              >
                {isSendingMedia
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Send    className="h-4 w-4" />
                }
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
)
