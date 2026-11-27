<script setup>
import DefaultTheme from 'vitepress/theme'
import BackToTop from './components/BackToTop.vue'
import HomeFilterBar from './components/HomeFilterBar.vue'
import ReadingProgress from './components/ReadingProgress.vue'
import TopicBrand from './components/TopicBrand.vue'

const Layout = DefaultTheme.Layout
</script>

<template>
  <Layout>
    <template #layout-top>
      <ReadingProgress />
    </template>
    <template #home-features-before>
      <HomeFilterBar />
    </template>
    <template #doc-before>
      <TopicBrand />
    </template>
    <template #layout-bottom>
      <BackToTop />
    </template>
  </Layout>
</template>
