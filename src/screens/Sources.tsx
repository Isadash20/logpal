import { useEffect, useRef } from 'react'
import { useApp } from '../state/store'
import { Row, TopBar } from '../components/ui'
import { Icon } from '../components/Icon'
import { SOURCE_SECTIONS, type SourceTopic } from '../data/sources'
import { openUrl } from '../lib/native'

/**
 * Every figure the app computes, with the paper or guideline it rests on.
 *
 * Reached from About and from a "Sources" link on each screen that shows a
 * recommendation. A link with a topic scrolls straight to that section.
 */
export function Sources({ topic }: { topic?: SourceTopic }) {
  const { pop } = useApp()
  const target = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (topic) target.current?.scrollIntoView({ block: 'start' })
  }, [topic])

  return (
    <>
      <TopBar title="Sources" onBack={pop} solid />
      <div className="scroll">
        <div className="hint" style={{ paddingTop: 14 }}>
          LogPal's targets and scores are estimates from the published sources below.
          They are general information, not medical advice. If you have a medical
          condition, are pregnant, or take medication that depends on food, ask a
          clinician before changing how you eat.
        </div>

        {SOURCE_SECTIONS.map((s) => (
          <div key={s.topic} ref={s.topic === topic ? target : undefined} style={{ scrollMarginTop: 8 }}>
            <div className="section-label">{s.heading}</div>
            <div className="hint" style={{ paddingTop: 0 }}>
              {s.summary}
            </div>
            <div className="card">
              {s.sources.map((src) => (
                <Row
                  key={src.url}
                  className="row--wrap"
                  title={src.title}
                  sub={
                    <>
                      {src.publisher}
                      <br />
                      {src.usedFor}
                    </>
                  }
                  right={
                    <span style={{ color: 'var(--text-3)', display: 'inline-flex' }}>
                      <Icon name="globe" size={18} />
                    </span>
                  }
                  onClick={() => void openUrl(src.url)}
                />
              ))}
            </div>
          </div>
        ))}
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}

/**
 * The one-line pointer under a figure: "Where these numbers come from".
 * Rendered as a hint so it sits in the flow of the screen it explains.
 */
export function SourcesLink({ topic, label = 'Where these numbers come from' }: { topic: SourceTopic; label?: string }) {
  const { push } = useApp()
  return (
    <div className="hint" style={{ paddingTop: 4 }}>
      <button className="textbtn" style={{ padding: 0, fontSize: 'inherit' }} onClick={() => push({ name: 'sources', topic })}>
        {label}
        <Icon name="forward" size={14} />
      </button>
    </div>
  )
}
