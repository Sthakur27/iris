import './styles.css'
import { createRouter } from './ui/router'
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

// Calibration gates everything: without pxPerCm and viewing distance we cannot
// express demand in prism dioptres at all, so a first run always starts there.
nav.go(isCalibrated() ? 'home' : 'setup')
