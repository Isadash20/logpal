import { useEffect, useRef, useState } from 'react'

/**
 * The rear camera in a <video>, with a still capture.
 *
 * `active` false stops the stream, so a screen can hand the camera back the
 * moment a photo is taken rather than at unmount.
 */
export function useRearCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        setError('Camera needs https (or localhost). You can choose a photo instead.')
        return
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        })
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          await videoRef.current.play()
        }
      } catch {
        setError('Camera access was blocked. Choose a photo from your device instead.')
      }
    }
    void start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [active])

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  /** The current frame as a JPEG data URL, no wider than `maxWidth`. */
  function capture(maxWidth = 1600): string | null {
    const v = videoRef.current
    if (!v || !v.videoWidth) return null
    const scale = Math.min(1, maxWidth / v.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(v.videoWidth * scale)
    canvas.height = Math.round(v.videoHeight * scale)
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height)
    const out = canvas.toDataURL('image/jpeg', 0.92)
    stop()
    return out
  }

  return { videoRef, error, stop, capture }
}
