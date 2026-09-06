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
  const { push, data } = useApp()

  const planned = data.planEntries.length
  const unbought = data.shopping.filter((s) => !s.checked).length

  return (
    <>
      <TopBar />
      <div className="pagetitle">Meals</div>

      <div className="scroll">
        {/* The planner entry sits under the search box and its chips: it is
            where you go when browsing did not answer the question, not the
            first thing between the title and the search. */}
        <PlanPane
          aboveSearch={
            <>
              {/* Two entries, not one with a subtitle. Planning a week and
                  buying the food are separate jobs, done on different days,
                  and one was hidden inside the other's caption. */}
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
                      ? `${planned} meal${planned === 1 ? '' : 's'} scheduled`
                      : 'Put recipes on days'}
                  </span>
                </span>
                <span className="row__chev">
                  <Icon name="forward" size={18} strokeWidth={2.2} />
                </span>
              </button>

              <button className="planbanner" onClick={() => push({ name: 'shoppingList' })}>
                <span className="planbanner__icon">
                  <Icon name="check" size={22} />
                </span>
                <span className="planbanner__main">
                  <span className="planbanner__title">Grocery list</span>
                  <span className="planbanner__sub">
                    {data.shopping.length
                      ? `${unbought} left to buy of ${data.shopping.length}`
                      : 'Nothing on it yet'}
                  </span>
                </span>
                <span className="row__chev">
                  <Icon name="forward" size={18} strokeWidth={2.2} />
                </span>
              </button>
            </>
          }
        />
      </div>
    </>
  )
}
