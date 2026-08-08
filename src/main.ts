import './styles.css'
import { createRouter } from './ui/router'
import type { ScreenId } from './ui/router'
import { setupScreen } from './ui/screens/setup'
import { homeScreen } from './ui/screens/home'
import { settingsScreen } from './ui/screens/settings'
import { resultsScreen } from './ui/screens/results'
import { sessionScreen } from './ui/screens/session'
import { isCalibrated } from './core/settings'

const root = document.getElementById('app')
if (!root) throw new Error('#app not found')

const nav = createRouter(root, {
  setup: setupScreen,
  home: homeScreen,
  settings: settingsScreen,
  results: resultsScreen,
  session: sessionScreen,
})

/**
 * Resolve the opening route.
 *
 * Calibration gates everything — without pixels-per-centimetre and a viewing
 * distance we cannot express a demand in prism dioptres at all — so an uncalibrated
 * app always opens the wizard, whatever the URL said.
 *
 * A deep link straight into `#/session` is also refused on a cold load: a session is
 * something you start from the home screen after the equipment reminders, not a
 * bookmarkable page, and restoring one from a URL would resume an exercise with no
 * runner behind it. Both redirects `replace` rather than `push`, so pressing back
 * does not bounce the user straight into the route they were just redirected out of.
 */
function openingRoute(): ScreenId {
  if (!isCalibrated()) return 'setup'
  const path = window.location.hash.replace(/^#\/?/, '').split('?')[0] ?? ''
  const restorable: ScreenId[] = ['home', 'results', 'settings', 'setup']
  return (restorable as string[]).includes(path) ? (path as ScreenId) : 'home'
}

nav.replace(openingRoute())
