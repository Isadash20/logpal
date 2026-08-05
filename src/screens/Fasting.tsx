import { useEffect, useMemo, useState } from 'react'
import type { FastProtocol } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Dialog, Row, TopBar } from '../components/ui'
import {
  FAST_PROTOCOLS,
  PROTOCOL_BY_KEY,
  activeFast,
  completedFasts,
  fastElapsedMs,
  fastProgress,
  fastStats,
  formatClock,
  formatDuration,
  targetHoursFor,
  windowFor,
} from '../lib/fasting'
import { shortDate } from '../lib/dates'

export function Fasting() {
  const { pop, data, startFast, endFast, deleteFast, saveFasting } = useApp()
  const { fasting, fasts } = data

  const current = activeFast(fasts)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  /* A running fast needs a ticking clock; a finished one doesn't. Only mount
     the interval while it's actually counting. */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!current) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [current])

  const stats = useMemo(() => fastStats(fasts, now), [fasts, now])
  const history = useMemo(() => completedFasts(fasts).slice(0, 20), [fasts])

  const targetH = targetHoursFor(fasting)
  const progress = current ? fastProgress(current, now) : 0
  const elapsed = current ? fastElapsedMs(current, now) : 0
  const win = current ? windowFor(current) : null
  const complete = progress >= 1

  const size = 232
  const stroke = 16
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = Math.min(1, progress) * c

  return (
    <>
      <TopBar
        title="Intermittent fasting"
        onBack={pop}
        solid
        right={
          <button className="iconbtn" onClick={() => setPickerOpen(true)} aria-label="Change plan">
            <Icon name="settings" size={20} />
          </button>
        }
      />

      <div className="scroll">
        <div style={{ display: 'grid', placeItems: 'center', padding: '26px 16px 8px' }}>
          <div style={{ position: 'relative', width: size, height: size }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="var(--surface-3)"
                strokeWidth={stroke}
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={complete ? 'var(--positive)' : 'var(--accent)'}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray .6s linear' }}
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeContent: 'center',
                textAlign: 'center',
              }}
            >
              {current ? (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
                    {complete ? 'GOAL REACHED' : 'FASTING'}
                  </div>
                  <div
                    className="num"
                    style={{
                      fontSize: 42,
                      fontWeight: 800,
                      letterSpacing: '-0.04em',
                      lineHeight: 1.1,
                      color: complete ? 'var(--positive)' : 'var(--text)',
                    }}
                  >
                    {formatDuration(elapsed)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    of {current.targetHours}h · {Math.round(progress * 100)}%
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="num"
                    style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em' }}
                  >
                    {PROTOCOL_BY_KEY[fasting.protocol].label}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
                    {targetH}h fast · {Math.max(0, 24 - targetH)}h eating
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="btn-wrap" style={{ display: 'grid', gap: 10 }}>
          {current ? (
            <button className="btn btn--ink" onClick={() => setConfirmEnd(true)}>
              End fast
            </button>
          ) : (
            <button className="btn" onClick={startFast}>
              <Icon name="clock" size={19} />
              Start fasting
            </button>
          )}
          <button className="btn btn--ghost" onClick={() => setPickerOpen(true)}>
            {current ? 'Change plan for next fast' : 'Choose a plan'}
          </button>
        </div>

        {current && win && (
          <div className="card">
            <Row title="Started" value={formatClock(current.startedAt)} />
            <Row
              title={complete ? 'Target reached at' : 'Target ends at'}
              value={formatClock(win.endsAt)}
            />
            <Row
              title="Eating window"
              sub={`${win.eatHours}h once the fast ends`}
              value={`${formatClock(win.endsAt)} – ${formatClock(win.eatingClosesAt)}`}
            />
          </div>
        )}

        <div className="section-head">
          <span>Your record</span>
        </div>
        <div className="card">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              textAlign: 'center',
              padding: '16px 8px',
            }}
          >
            <Stat label="Day streak" value={String(stats.streak)} />
            <Stat label="Fasts done" value={String(stats.total)} />
            <Stat
              label="Longest"
              value={stats.longestMs ? formatDuration(stats.longestMs) : '—'}
            />
          </div>
          <Row
            title="Hit the target"
            value={`${stats.hitTarget} of ${stats.total}`}
          />
          <Row
            title="Average length"
            value={stats.averageMs ? formatDuration(stats.averageMs) : '—'}
          />
        </div>

        <div className="section-head">
          <span>History</span>
        </div>
        <div className="card">
          {history.length === 0 ? (
            <div className="hint">
              No completed fasts yet. Start one above and it will show up here.
            </div>
          ) : (
            history.map((f) => {
              const len = fastElapsedMs(f)
              const hit = len >= f.targetHours * 3_600_000
              return (
                <Row
                  key={f.id}
                  title={formatDuration(len)}
                  sub={`${shortDate(new Date(f.startedAt).toISOString().slice(0, 10))} · ${formatClock(
                    f.startedAt
                  )} – ${formatClock(f.endedAt!)} · ${PROTOCOL_BY_KEY[f.protocol].label}`}
                  left={
                    <span
                      style={{
                        color: hit ? 'var(--positive)' : 'var(--text-3)',
                        display: 'flex',
                        flex: 'none',
                      }}
                    >
                      <Icon name={hit ? 'check' : 'close'} size={18} strokeWidth={2.6} />
                    </span>
                  }
                  right={
                    <button
                      className="iconbtn"
                      style={{ width: 32, height: 32, color: 'var(--danger)' }}
                      onClick={() => deleteFast(f.id)}
                      aria-label="Delete fast"
                    >
                      <Icon name="trash" size={17} />
                    </button>
                  }
                />
              )
            })
          )}
        </div>

        <div className="hint">
          Fasting suits some people and not others. If you&apos;re pregnant, diabetic, on
          medication that needs food, or have a history of disordered eating, talk to a
          clinician before restricting when you eat.
        </div>
      </div>

      {pickerOpen && (
        <PlanPicker
          onClose={() => setPickerOpen(false)}
          protocol={fasting.protocol}
          customHours={fasting.customFastHours}
          onSave={(protocol, customFastHours) => {
            saveFasting({ protocol, customFastHours })
            setPickerOpen(false)
          }}
        />
      )}

      {confirmEnd && current && (
        <Dialog title="End this fast?" onClose={() => setConfirmEnd(false)}>
          <div style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 16 }}>
            You&apos;re {formatDuration(elapsed)} in
            {complete
              ? ' and past your target — nicely done.'
              : `, ${formatDuration(current.targetHours * 3_600_000 - elapsed)} short of ${current.targetHours}h.`}
          </div>
          <button
            className="btn"
            onClick={() => {
              endFast(current.id)
              setConfirmEnd(false)
            }}
          >
            End fast
          </button>
          <button
            className="btn btn--ghost"
            style={{ marginTop: 8 }}
            onClick={() => setConfirmEnd(false)}
          >
            Keep going
          </button>
        </Dialog>
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="num" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function PlanPicker({
  protocol,
  customHours,
  onClose,
  onSave,
}: {
  protocol: FastProtocol
  customHours: number
  onClose(): void
  onSave(p: FastProtocol, hours: number): void
}) {
  const [sel, setSel] = useState<FastProtocol>(protocol)
  const [hours, setHours] = useState(String(customHours))

  return (
    <Dialog title="Fasting plan" onClose={onClose}>
      <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        {FAST_PROTOCOLS.map((p) => (
          <button
            key={p.key}
            onClick={() => setSel(p.key)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              textAlign: 'left',
              padding: '11px 12px',
              borderRadius: 10,
              border: `1.5px solid ${sel === p.key ? 'var(--accent)' : 'var(--border-strong)'}`,
              background: sel === p.key ? 'var(--accent-soft)' : 'var(--surface)',
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontWeight: 700,
                  color: sel === p.key ? 'var(--accent)' : 'var(--text)',
                }}
              >
                {p.label}
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--text-2)',
                  marginTop: 2,
                  lineHeight: 1.4,
                }}
              >
                {p.description}
              </span>
            </span>
          </button>
        ))}
      </div>

      {sel === 'custom' && (
        <label className="field" style={{ border: 0, padding: '0 0 14px' }}>
          <span className="field__label">Fast for</span>
          <span className="field__control">
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min="1"
              max="36"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
            <span className="unit">hours</span>
          </span>
        </label>
      )}

      <button className="btn" onClick={() => onSave(sel, parseInt(hours) || 16)}>
        Save plan
      </button>
    </Dialog>
  )
}
