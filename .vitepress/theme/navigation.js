import { ref } from 'vue'

export const isRouteLoading = ref(false)
export const routeProgress = ref(0)
export const routeLoadFailed = ref(false)

let progressFrame
let finishTimer
let showTimer
let recoveryTimer
let activeNavigationId = 0
let activeTargetPath = ''
let progressStartedAt = 0

const PROGRESS_DELAY_MS = 75
const RECOVERY_DELAY_MS = 12000

function clearTimeoutHandle(timer) {
  if (timer && typeof window !== 'undefined') window.clearTimeout(timer)
}

function clearAnimationFrame(frame) {
  if (frame && typeof window !== 'undefined') window.cancelAnimationFrame(frame)
}

function routePath(target) {
  if (typeof window === 'undefined') return String(target || '')
  try {
    return new URL(target, window.location.origin).pathname
  } catch {
    return String(target || '')
  }
}

function stopProgressAnimation() {
  clearAnimationFrame(progressFrame)
  progressFrame = undefined
}

function animateProgress(now) {
  if (!isRouteLoading.value) return
  const elapsed = Math.max(0, now - progressStartedAt)
  // Ease toward 90% without implying completion while the page chunk is pending.
  routeProgress.value = Math.min(90, 10 + 80 * (1 - Math.exp(-elapsed / 1750)))
  if (routeProgress.value < 90) {
    progressFrame = window.requestAnimationFrame(animateProgress)
  }
}

export function startRouteLoading(target) {
  if (typeof window === 'undefined') return activeNavigationId

  activeNavigationId += 1
  activeTargetPath = routePath(target)
  routeLoadFailed.value = false
  clearTimeoutHandle(finishTimer)
  clearTimeoutHandle(showTimer)
  clearTimeoutHandle(recoveryTimer)
  stopProgressAnimation()

  // Keep an already-visible indicator mounted between rapid topic switches.
  routeProgress.value = 10
  showTimer = window.setTimeout(() => {
    if (activeTargetPath !== routePath(target)) return
    isRouteLoading.value = true
    progressStartedAt = window.performance?.now?.() ?? Date.now()
    progressFrame = window.requestAnimationFrame(animateProgress)
  }, PROGRESS_DELAY_MS)

  return activeNavigationId
}

export function completeRouteLoading(target) {
  if (typeof window === 'undefined') return false
  if (target !== undefined && routePath(target) !== activeTargetPath) return false

  clearTimeoutHandle(showTimer)
  clearTimeoutHandle(finishTimer)
  clearTimeoutHandle(recoveryTimer)
  stopProgressAnimation()

  if (!isRouteLoading.value) {
    routeProgress.value = 0
    activeTargetPath = ''
    return true
  }

  const completedNavigationId = activeNavigationId
  routeProgress.value = 100
  finishTimer = window.setTimeout(() => {
    if (completedNavigationId !== activeNavigationId) return
    isRouteLoading.value = false
    routeProgress.value = 0
    activeTargetPath = ''
  }, 190)
  return true
}

export function clearRouteRecoveryTimer() {
  if (typeof window === 'undefined') return
  clearTimeoutHandle(recoveryTimer)
  recoveryTimer = undefined
}

export function armRouteRecovery(router, target, navigationId = activeNavigationId) {
  if (typeof window === 'undefined') return

  clearRouteRecoveryTimer()
  recoveryTimer = window.setTimeout(() => {
    if (navigationId !== activeNavigationId) return

    const expectedPath = routePath(target)
    const currentRoutePath = routePath(router.route.path)
    if (currentRoutePath === expectedPath) {
      completeRouteLoading(target)
      clearRouteRecoveryTimer()
      return
    }

    const recoveryKey = 'devops-cheatsheets:route-recovery'
    let recoveryAllowed = false
    try {
      const alreadyRecovered = window.sessionStorage.getItem(recoveryKey) === expectedPath
      if (!alreadyRecovered) {
        window.sessionStorage.setItem(recoveryKey, expectedPath)
        recoveryAllowed = true
      }
    } catch {
      // Never risk an automatic reload loop when browser storage is blocked.
    }

    if (recoveryAllowed) {
      window.location.replace(window.location.href)
      return
    }

    routeLoadFailed.value = true
    completeRouteLoading(target)
  }, RECOVERY_DELAY_MS)
}

export function clearSuccessfulRecovery() {
  if (typeof window === 'undefined') return
  clearRouteRecoveryTimer()
  try {
    window.sessionStorage.removeItem('devops-cheatsheets:route-recovery')
  } catch {
    // Storage may be unavailable; route loading can still complete normally.
  }
}
