import { useState } from 'react'
import { useApp } from '../state/store'
import { Tabs, TopBar } from '../components/ui'
import { PlanPane, PrepPane } from './Planner'

/**
 * Plan tab — meal planning, and nothing else.
 *
 * ## Two halves, one sitting
 *
 * **Plan** is where you decide what to eat: browse the meal ideas that ship
 * with the app, search them, or write your own. **Prep** is where you decide
 * when: a week of days you drop those meals onto, with the grocery list that
 * falls out of it.
 *
 * They are segmented tabs rather than two destinations because choosing and
 * scheduling are one activity interrupted — pick a recipe, place it, pick the
 * next. Putting Prep behind a push meant leaving the recipes to place each one
 * and coming back.
 *
 * ## What used to be here
 *
 * Daily targets, repeat meals, my meals, my recipes, my foods and shortcuts.
 * All of it had a second home already — targets under Settings → Plan → Goals,
 * the three food libraries under Settings → Foods, and the shortcuts on the
 * add sheet behind the "+" — so this tab was the duplicate rather than the
 * original. Nothing was lost by clearing it; the tab just stopped being a
 * table of contents for other screens and started doing one job.
 */

type Half = 'plan' | 'prep'

export function Plan() {
  const { data } = useApp()
  const [half, setHalf] = useState<Half>('plan')

  const planned = data.planEntries.length

  return (
    <>
      <TopBar />
      <div className="pagetitle">Meals</div>

      <Tabs
        tabs={[
          { key: 'plan' as Half, label: 'Plan' },
          { key: 'prep' as Half, label: `Prep ${planned || ''}`.trim() },
        ]}
        active={half}
        onChange={setHalf}
      />

      <div className="scroll">{half === 'plan' ? <PlanPane /> : <PrepPane />}</div>
    </>
  )
}
