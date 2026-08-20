import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { TopBar } from '../components/ui'
import { PlanPane } from './Planner'

/**
 * Plan tab, finding something to cook.
 *
 * ## One surface, not two
 *
 * This was briefly split into Plan and Prep, browsing on one tab and a calendar
 * on the other. Halving the width of the thing people actually came for made
 * the browsing feel like a preamble, so the split is gone: the whole tab is
 * search, filters and recipes, and the calendar is a screen you open from the
 * banner at the top when you have found something worth scheduling.
 *
 * ## What used to be here
 *
 * Daily targets, repeat meals, my meals, my recipes, my foods and shortcuts,
 * every one of which had a second home already, under Settings → Plan → Goals,
 * Settings → Foods, or the add sheet behind the "+". This tab was the duplicate
 * rather than the original, so clearing it lost nothing and gave the space to
 * the one job it now does.
 */
export function Plan() {
  const { push, data, date } = useApp()

  const planned = data.planEntries.length
  const unbought = data.shopping.filter((s) => !s.checked).length

  return (
    <>
      <TopBar />
      <div className="pagetitle">Meals</div>

      {/* Planning sits at the top as an entry rather than a tab. The same
          shape the reference app uses on its own home screen, where "Ready to
          plan your meals?" is the first card and the planner is elsewhere. */}
      <button className="planbanner" onClick={() => push({ name: 'mealPlanner' })}>
        <span className="planbanner__icon">
          <Icon name="calendar" size={22} />
        </span>
        <span className="planbanner__main">
          <span className="planbanner__title">
            {planned ? 'Your meal plan' : 'Plan your week'}
          </span>
          <span className="planbanner__sub">
            {planned
              ? `${planned} meal${planned === 1 ? '' : 's'} scheduled${
                  unbought ? ` · ${unbought} to buy` : ''
                }`
              : 'Put recipes on days and build a grocery list'}
          </span>
        </span>
        <span className="row__chev">
          <Icon name="forward" size={18} strokeWidth={2.2} />
        </span>
      </button>

      <button className="planbanner" onClick={() => push({ name: 'worthIt', date })}>
        <span className="planbanner__icon">
          <Icon name="chart" size={22} />
        </span>
        <span className="planbanner__main">
          <span className="planbanner__title">NutriScan</span>
          <span className="planbanner__sub">Scan or search a food, see how it scores</span>
        </span>
        <span className="row__chev">
          <Icon name="forward" size={18} strokeWidth={2.2} />
        </span>
      </button>

      <div className="scroll">
        <PlanPane />
      </div>
    </>
  )
}
