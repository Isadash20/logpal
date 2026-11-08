import { useEffect, useRef, useState } from 'react'
import { Sheet } from './ui'
import { Icon } from './Icon'

/**
 * A live camera in a sheet, for one photo.
 *
 * Opens the back camera straight away, shows the frame with an optional
 * guide over it, and hands back a JPEG data URL on capture. Where the camera
 * is blocked or unavailable (desktop, http, a denied permission), the fallback
 * is the device's own photo picker, so the step is never a dead end.
 */
export function CameraSheet({
  title,
  guide,
  caption,
  onCapture,
  onClose,
}: {
  title: string
  /** Drawn over the live frame, e.g. a hand outline. */
  guide?: React.ReactNode
  caption?: string
  onCapture(dataUrl: string): void
  onClose(): void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        setError('The camera needs https. Choose a photo instead.')
        return
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          await videoRef.current.play()
          setReady(true)
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
  }, [])

  function take() {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 900 / v.videoWidth)
    canvas.width = v.videoWidth * scale
    canvas.height = v.videoHeight * scale
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height)
    onCapture(canvas.toDataURL('image/jpeg', 0.8))
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => onCapture(String(reader.result))
    reader.readAsDataURL(f)
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="camsheet">
        <div className="camsheet__frame">
          <video ref={videoRef} playsInline muted autoPlay />
          {guide && !error && <div className="camsheet__guide">{guide}</div>}
          {caption && <div className="camsheet__caption">{caption}</div>}
          {error && <div className="camsheet__error">{error}</div>}
        </div>
        <div style={{ display: 'grid', gap: 10, padding: '14px 4px 6px' }}>
          <button className="btn" onClick={take} disabled={!ready}>
            <Icon name="camera" size={19} />
            Take photo
          </button>
          <label className="btn btn--ghost" style={{ cursor: 'pointer' }}>
            Choose a photo
            <input type="file" accept="image/*" hidden onChange={onFile} />
          </label>
        </div>
      </div>
    </Sheet>
  )
}
