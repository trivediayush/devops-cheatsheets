<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData, useRoute } from 'vitepress'
import { isRouteLoading, routeLoadFailed, routeProgress } from '../navigation.js'

const { frontmatter } = useData()
const route = useRoute()

const readRatio = ref(0)
let rafId = 0

const isDocPage = computed(() => frontmatter.value?.layout !== 'home')

function updateReadingProgress() {
  rafId = 0
  if (typeof window === 'undefined' || !isDocPage.value) {
    readRatio.value = 0
    return
  }
  const docEl = document.documentElement
  const scrollable = docEl.scrollHeight - window.innerHeight
  if (scrollable <= 120) {
    readRatio.value = 0
    return
  }
  readRatio.value = Math.min(1, Math.max(0, window.scrollY / scrollable))
}

function scheduleUpdate() {
  if (rafId || typeof window === 'undefined') return
  rafId = window.requestAnimationFrame(updateReadingProgress)
}

function reloadPage() {
  if (typeof window !== 'undefined') window.location.reload()
}

const activeRatio = computed(() => {
  if (isRouteLoading.value) return Math.min(1, Math.max(0.08, routeProgress.value / 100))
  if (isDocPage.value) return readRatio.value
  return 0
})

const isVisible = computed(() => isRouteLoading.value || (isDocPage.value && readRatio.value > 0.015))

watch(() => route.path, () => {
  readRatio.value = 0
  scheduleUpdate()
})

onMounted(() => {
  updateReadingProgress()
  window.addEventListener('scroll', scheduleUpdate, { passive: true })
  window.addEventListener('resize', scheduleUpdate, { passive: true })
})

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('scroll', scheduleUpdate)
  window.removeEventListener('resize', scheduleUpdate)
  if (rafId) window.cancelAnimationFrame(rafId)
})
</script>

<template>
  <div
    class="progress-rail"
    :class="{ 'is-visible': isVisible, 'is-loading': isRouteLoading }"
    aria-hidden="true"
  >
    <div
      class="progress-rail__fill"
      :style="{ transform: `scaleX(${activeRatio})` }"
    />
  </div>

  <div v-if="routeLoadFailed" class="route-error-banner" role="alert">
    <span>That page took too long to load.</span>
    <button type="button" class="route-error-banner__btn" @click="reloadPage">
      Reload page
    </button>
  </div>
</template>
