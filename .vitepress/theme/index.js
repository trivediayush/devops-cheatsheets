import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import SubnetCalculator from './components/SubnetCalculator.vue'
import {
  armRouteRecovery,
  clearSuccessfulRecovery,
  completeRouteLoading,
  startRouteLoading,
} from './navigation.js'
import '@fontsource-variable/figtree'
import '@fontsource-variable/jetbrains-mono'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app, router }) {
    app.component('SubnetCalculator', SubnetCalculator)

    if (typeof window !== 'undefined' && router) {
      const prevBefore = router.onBeforeRouteChange
      const prevAfter = router.onAfterRouteChanged

      router.onBeforeRouteChange = async (to) => {
        const navId = startRouteLoading(to)
        armRouteRecovery(router, to, navId)
        if (typeof prevBefore === 'function') {
          return prevBefore(to)
        }
      }

      router.onAfterRouteChanged = async (to) => {
        clearSuccessfulRecovery()
        completeRouteLoading(to)
        if (typeof prevAfter === 'function') {
          return prevAfter(to)
        }
      }
    }
  },
}
