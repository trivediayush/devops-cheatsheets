<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'
import { TRACKS, countVisible, filterCategories } from '../utils/catalog.mjs'

const { frontmatter } = useData()

const activeTrack = ref('all')
const query = ref('')

const features = computed(() => Array.isArray(frontmatter.value?.features) ? frontmatter.value.features : [])

const filtered = computed(() => filterCategories(features.value, {
  track: activeTrack.value,
  query: query.value,
}))

const visibleCount = computed(() => countVisible(filtered.value))
const totalCount = computed(() => features.value.length)
const isFiltered = computed(() => activeTrack.value !== 'all' || query.value.trim().length > 0)

function syncFeatureGrid() {
  if (typeof document === 'undefined') return
  const cards = document.querySelectorAll('.VPHome .VPFeatures .items > .item')
  if (!cards.length) return

  filtered.value.forEach(({ index, visible }) => {
    const el = cards[index]
    if (!el) return
    el.classList.toggle('is-filtered-out', !visible)
    if (visible) el.removeAttribute('aria-hidden')
    else el.setAttribute('aria-hidden', 'true')
  })
}

function resetFilters() {
  activeTrack.value = 'all'
  query.value = ''
}

watch([activeTrack, query, features], () => {
  nextTick(syncFeatureGrid)
})

onMounted(() => {
  nextTick(syncFeatureGrid)
})

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return
  const cards = document.querySelectorAll('.VPHome .VPFeatures .items > .item.is-filtered-out')
  cards.forEach((el) => {
    el.classList.remove('is-filtered-out')
    el.removeAttribute('aria-hidden')
  })
})
</script>

<template>
  <section v-if="totalCount" class="home-explorer" aria-label="Filter cheatsheet categories">
    <div class="home-explorer__inner">
      <div class="home-explorer__head">
        <div>
          <h2 class="home-explorer__title">Explore by domain</h2>
          <p class="home-explorer__meta" role="status" aria-live="polite">
            <span class="tabular-nums">{{ visibleCount }}</span>
            <span> of </span>
            <span class="tabular-nums">{{ totalCount }}</span>
            <span> tracks</span>
            <span aria-hidden="true"> · </span>
            <span>120+ cheatsheets</span>
          </p>
        </div>

        <div class="home-explorer__search">
          <label for="home-topic-filter" class="sr-only">Filter categories by tool or keyword</label>
          <svg class="home-explorer__search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M9 15.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm8 1.5-3.35-3.35"
              stroke="currentColor"
              stroke-width="1.65"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <input
            id="home-topic-filter"
            v-model="query"
            type="search"
            class="home-explorer__input"
            placeholder="Filter tools (Backstage, Cilium, k8s, SLO…)"
            autocomplete="off"
            spellcheck="false"
          >
          <button
            v-if="query"
            type="button"
            class="home-explorer__clear"
            aria-label="Clear filter query"
            @click="query = ''"
          >
            Clear
          </button>
        </div>
      </div>

      <div class="home-explorer__tracks" role="tablist" aria-label="Learning tracks">
        <button
          v-for="track in TRACKS"
          :key="track.id"
          type="button"
          role="tab"
          class="home-explorer__tab"
          :class="{ 'is-active': activeTrack === track.id }"
          :aria-selected="activeTrack === track.id"
          @click="activeTrack = track.id"
        >
          {{ track.label }}
        </button>
      </div>

      <div v-if="visibleCount === 0" class="home-explorer__empty" role="status">
        <p>No categories match “{{ query.trim() }}” in this track.</p>
        <button type="button" class="home-explorer__reset" @click="resetFilters">
          Reset filters
        </button>
      </div>
    </div>
  </section>
</template>
