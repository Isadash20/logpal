import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { TopBar } from '../components/ui'
import { RateLimitedError, lookupBarcode } from '../services/openFoodFacts'

type Status = 'starting' | 'scanning' | 'looking' | 'error'

/**
 * Barcode scanner.
 *
 * Decoding goes through ZXing rather than the native `BarcodeDetector` API,
 * BarcodeDetector only exists in Chromium, so on Safari and Firefox the native
 * path silently never fires and the camera just sits there looking broken.
 * ZXing is a real decoder that runs everywhere `getUserMedia` does.
 */
export function BarcodeScanner({ date, mode = 'log' }: { date: string; mode?: 'log' | 'worth' }) {
  const { pop, push, saveScannedFood } = useApp()
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop(): void } | null>(null)
  const handledRef = useRef(false)

  const [status, setStatus] = useState<Status>('starting')
  const [message, setMessage] = useState('')
  const [manual, setManual] = useState('')
  const [lastCode, setLastCode] = useState('')

  const resolve = useCallback(
    async (code: string) => {
      if (handledRef.current) return
      handledRef.current = true
      setLastCode(code)
      setStatus('looking')
      controlsRef.current?.stop()

      try {
        const food = await lookupBarcode(code)
        if (food) {
          // Anything successfully scanned joins the on-device database, so it
          // is searchable later without another network round trip.
          saveScannedFood(food)
          pop()
          push(
            mode === 'worth'
              ? { name: 'worthIt', food, date }
              : { name: 'foodDetail', food, date },
          )
        } else {
          pop()
          push({ name: 'createFood', barcode: code, returnTo: { date } })
        }
      } catch (err) {
        setStatus('error')
        setMessage(
          err instanceof RateLimitedError
            ? `Too many lookups just now, try again in about ${err.retryInSeconds}s.`
            : 'Lookup failed. Check your connection and try again.'
        )
        handledRef.current = false
      }
    },
    [date, pop, push, saveScannedFood]
  )

  useEffect(() => {
    let cancelled = false
    handledRef.current = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error')
        setMessage('This browser has no camera access. Enter the number below instead.')
        return
      }
      // Camera requires a secure context: https, or localhost during dev.
      if (!window.isSecureContext) {
        setStatus('error')
        setMessage(
          'The camera needs a secure connection (https). Open the app over https, or enter the barcode below.'
        )
        return
      }

      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const { DecodeHintType, BarcodeFormat } = await import('@zxing/library')

        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
        ])
        const reader = new BrowserMultiFormatReader(hints)

        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current!,
          (result) => {
            if (result && !handledRef.current) void resolve(result.getText())
          }
        )
        if (cancelled) {
          controls.stop()
          return
        }
        controlsRef.current = controls
        setStatus('scanning')
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        const name = (err as Error)?.name
        setMessage(
          name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in your browser settings, or enter the barcode below.'
            : name === 'NotFoundError'
              ? 'No camera found on this device. Enter the barcode below instead.'
              : `Could not start the camera (${name ?? 'unknown error'}). Enter the barcode below.`
        )
      }
    }

    void start()
    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [resolve])

  const live = status === 'scanning' || status === 'starting' || status === 'looking'

  return (
    <>
      <TopBar title="Scan a barcode" onBack={pop} solid />
      <div className="scroll">
        {live && (
          <div
            style={{
              position: 'relative',
              background: '#000',
              aspectRatio: '3 / 4',
              overflow: 'hidden',
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div
              style={{
                position: 'absolute',
                inset: '30% 10%',
                border: '2px solid rgba(255,255,255,.9)',
                borderRadius: 14,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: '10%',
                right: '10%',
                top: '50%',
                height: 2,
                background: 'var(--danger)',
                boxShadow: '0 0 10px var(--danger)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: 14,
                left: 0,
                right: 0,
                textAlign: 'center',
                color: '#fff',
                fontSize: 13.5,
                textShadow: '0 1px 3px rgba(0,0,0,.85)',
              }}
            >
              {status === 'starting'
                ? 'Starting camera…'
                : status === 'looking'
                  ? `Looking up ${lastCode}…`
                  : 'Center the barcode in the box'}
            </div>
          </div>
        )}

        {message && <div className="hint">{message}</div>}

        <div className="section-label">Enter barcode manually</div>
        <div className="card">
          <label className="field">
            <span className="field__label">UPC / EAN</span>
            <span className="field__control">
              <input
                className="input"
                inputMode="numeric"
                placeholder="0123456789012"
                value={manual}
                onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))}
              />
            </span>
          </label>
        </div>
        <div className="btn-wrap">
          <button
            className="btn"
            disabled={manual.length < 8 || status === 'looking'}
            onClick={() => {
              handledRef.current = false
              void resolve(manual)
            }}
          >
            {status === 'looking' ? 'Looking up…' : 'Look up'}
          </button>
        </div>

        <div className="hint">
          Scanned products are checked against Open Food Facts and, when found, saved to
          your device so they turn up in search from then on.
        </div>

        <div style={{ height: 8 }} />
        <div className="hint" style={{ color: 'var(--text-3)' }}>
          <Icon name="info" size={13} /> Camera scanning needs https (or localhost) and
          permission to use the camera.
        </div>
      </div>
    </>
  )
}
