import { useState, useCallback, useEffect } from 'react'

export function useResizable({ initial, min, max, storageKey, from = 'right' }) {
  const [width, setWidth] = useState(() => {
    if (storageKey) {
      const saved = parseInt(localStorage.getItem(storageKey) || '', 10)
      if (Number.isFinite(saved)) return Math.min(max, Math.max(min, saved))
    }
    return initial
  })

  useEffect(() => {
    if (storageKey) localStorage.setItem(storageKey, String(width))
  }, [width, storageKey])

  const startResize = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const dir = from === 'right' ? 1 : -1
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function onMove(ev) {
      const dx = ev.clientX - startX
      setWidth(Math.min(max, Math.max(min, startW + dir * dx)))
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [width, min, max, from])

  return { width, startResize }
}

export const resizeHandleStyle = (side) => ({
  position: 'absolute', top: 0, bottom: 0,
  [side]: -3, width: 6,
  cursor: 'col-resize', zIndex: 5,
  background: 'transparent',
})

export function onHandleHoverIn(e)  { e.currentTarget.style.background = 'rgba(0,112,243,0.15)' }
export function onHandleHoverOut(e) { e.currentTarget.style.background = 'transparent' }
