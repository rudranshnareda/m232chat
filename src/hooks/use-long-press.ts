import { useRef, useCallback } from 'react'

// Returns pointer event props that fire a callback after a sustained press.
// Cancels if the pointer moves more than 10 px (scroll gesture).
export function useLongPress(callback: () => void, delayMs = 500) {
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPos   = useRef<{ x: number; y: number } | null>(null)
  const firedRef   = useRef(false)

  const cancel = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    startPos.current = null
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    firedRef.current = false
    startPos.current = { x: e.clientX, y: e.clientY }
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      startPos.current = null
      callback()
    }, delayMs)
  }, [callback, delayMs])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPos.current) return
    const dx = e.clientX - startPos.current.x
    const dy = e.clientY - startPos.current.y
    if (dx * dx + dy * dy > 100) cancel()  // > 10px
  }, [cancel])

  // Suppress the click that fires right after a long-press pointerup
  const onClick = useCallback((e: React.MouseEvent) => {
    if (firedRef.current) { e.preventDefault(); e.stopPropagation(); firedRef.current = false }
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel, onClick }
}
