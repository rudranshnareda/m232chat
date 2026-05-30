'use client'

import { useState, useRef, useCallback } from 'react'

export type RecordingState = 'idle' | 'recording' | 'recorded'

export interface UseVoiceRecorderResult {
  recordingState: RecordingState
  duration:       number   // seconds elapsed / total
  blob:           Blob | null
  mimeType:       string
  micError:       string | null
  startRecording: () => Promise<void>
  stopRecording:  () => void
  discard:        () => void
}

export function useVoiceRecorder(): UseVoiceRecorderResult {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [duration,       setDuration]       = useState(0)
  const [blob,           setBlob]           = useState<Blob | null>(null)
  const [mimeType,       setMimeType]       = useState('audio/webm')
  const [micError,       setMicError]       = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const chunksRef   = useRef<Blob[]>([])
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const startRecording = useCallback(async () => {
    setMicError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Pick best supported type
      const type =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm')             ? 'audio/webm'             :
        MediaRecorder.isTypeSupported('audio/mp4')              ? 'audio/mp4'              :
        ''

      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : {})
      recorderRef.current = recorder
      chunksRef.current   = []
      setMimeType(recorder.mimeType || 'audio/webm')

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const result = new Blob(chunksRef.current, { type: recorder.mimeType })
        setBlob(result)
        setRecordingState('recorded')
        clearTimer()
        stopStream()
      }

      recorder.start(100)
      setDuration(0)
      setRecordingState('recording')
      timerRef.current = setInterval(() => setDuration(p => p + 1), 1000)
    } catch {
      setMicError('Microphone access denied.')
      stopStream()
    }
  }, [clearTimer, stopStream])

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop()
    clearTimer()
  }, [clearTimer])

  const discard = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    clearTimer()
    stopStream()
    setBlob(null)
    setDuration(0)
    setRecordingState('idle')
    chunksRef.current = []
  }, [clearTimer, stopStream])

  return { recordingState, duration, blob, mimeType, micError, startRecording, stopRecording, discard }
}
