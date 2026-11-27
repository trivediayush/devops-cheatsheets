<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const visible = ref(false)
let rafId = 0

function checkScroll() {
  rafId = 0
  if (typeof window === 'undefined') return
  visible.value = window.scrollY > 420
}

function onScroll() {
  if (rafId || typeof window === 'undefined') return
  rafId = window.requestAnimationFrame(checkScroll)
}

function scrollToTop() {
  if (typeof window === 'undefined') return
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
}

onMounted(() => {
  checkScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('scroll', onScroll)
  if (rafId) window.cancelAnimationFrame(rafId)
})
</script>

<template>
  <button
    type="button"
    class="back-to-top"
    :class="{ 'is-visible': visible }"
    :tabindex="visible ? 0 : -1"
    aria-label="Back to top"
    @click="scrollToTop"
  >
    <svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true">
      <path
        d="M10 15.5V4.5m0 0-4.5 4.5M10 4.5l4.5 4.5"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
</template>
