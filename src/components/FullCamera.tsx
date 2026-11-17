import { useState } from 'react'
import { Icon } from './Icon'
import { useRearCamera } from '../lib/useCamera'

/**
 * The camera the way the Camera app does it: the live frame fills the whole
 * screen, the shutter sits under the thumb, and the only chrome is a close
 * button and one line of advice.
 *
 * Meal scan used to show the camera in a small box above its buttons, which
 * meant holding the phone far back and high to get a plate in; the frame
 * is now the screen, so the plate fills it from a normal height.
 */
export function FullCamera({
  title,
  hint,
  onCapture,
  onClose,
}: {
  title: string
  hint?: string
  onCapture(dataUrl: string): void
  onClose(): void
}) {
  const cam = useRearCamera(true)
  const [ready, setReady] = useState(false)

  function take() {
    const shot = cam.capture(1600)
    if (shot) onCapture(shot)
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      cam.stop()
      onCapture(String(reader.result))
    }
    reader.readAsDataURL(f)
  }

  return (
    <div className="fullcam" role="dialog" aria-label={title}>
      <video
        ref={cam.videoRef}
        className="fullcam__video"
        playsInline
        muted
        autoPlay
        onPlaying={() => setReady(true)}
      />

      <div className="fullcam__top">
        <button className="fullcam__close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={22} strokeWidth={2.4} />
        </button>
        <div className="fullcam__title">{title}</div>
      </div>

      {cam.error && <div className="fullcam__error">{cam.error}</div>}

      <div className="fullcam__bottom">
        {hint && !cam.error && <div className="fullcam__hint">{hint}</div>}
        <div className="fullcam__controls">
          <label className="fullcam__library">
            Library
            <input type="file" accept="image/*" hidden onChange={onFile} />
          </label>
          <button
            className="fullcam__shutter"
            onClick={take}
            disabled={!ready || !!cam.error}
            aria-label="Take photo"
          >
            <span />
          </button>
          <span className="fullcam__spacer" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
