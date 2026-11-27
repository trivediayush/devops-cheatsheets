import test from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORY_CATALOG, filterCategories, countVisible } from './catalog.mjs'

const sampleFeatures = CATEGORY_CATALOG.map((item) => ({
  title: item.title,
  details: item.keywords,
}))

test('returns all categories when track is all and query is empty', () => {
  const results = filterCategories(sampleFeatures, { track: 'all', query: '' })
  assert.equal(countVisible(results), CATEGORY_CATALOG.length)
})

test('filters by learning track accurately', () => {
  const results = filterCategories(sampleFeatures, { track: 'cloud-k8s', query: '' })
  const titles = results.filter((r) => r.visible).map((r) => sampleFeatures[r.index].title)
  assert.deepEqual(titles, [
    'Containers & Images',
    'Kubernetes',
    'Platform Engineering',
    'Infrastructure as Code',
    'Cloud',
    'Networking & Service Mesh',
  ])
})

test('matches aliases like k8s, sbom, and 2026 platform/SRE terms case-insensitively', () => {
  const k8sResults = filterCategories(sampleFeatures, { track: 'all', query: 'K8S' })
  assert.equal(countVisible(k8sResults), 1)
  assert.equal(sampleFeatures[k8sResults.find((r) => r.visible).index].title, 'Kubernetes')

  const sbomResults = filterCategories(sampleFeatures, { track: 'ops-sec', query: 'sbom' })
  assert.equal(countVisible(sbomResults), 1)
  assert.equal(sampleFeatures[sbomResults.find((r) => r.visible).index].title, 'DevSecOps')

  const idpResults = filterCategories(sampleFeatures, { track: 'all', query: 'backstage' })
  assert.equal(countVisible(idpResults), 1)
  assert.equal(sampleFeatures[idpResults.find((r) => r.visible).index].title, 'Platform Engineering')

  const sreResults = filterCategories(sampleFeatures, { track: 'ops-sec', query: 'velero' })
  assert.equal(countVisible(sreResults), 1)
  assert.equal(sampleFeatures[sreResults.find((r) => r.visible).index].title, 'SRE & Reliability')

  const ebpfResults = filterCategories(sampleFeatures, { track: 'all', query: 'cilium' })
  assert.equal(countVisible(ebpfResults), 1)
  assert.equal(sampleFeatures[ebpfResults.find((r) => r.visible).index].title, 'Networking & Service Mesh')

  const gpuResults = filterCategories(sampleFeatures, { track: 'all', query: 'vllm' })
  assert.equal(countVisible(gpuResults), 1)
  assert.equal(sampleFeatures[gpuResults.find((r) => r.visible).index].title, 'AI, GenAI & FinOps')
})

test('returns zero matches for unknown terms', () => {
  const results = filterCategories(sampleFeatures, { track: 'all', query: 'nonexistent-tool-xyz' })
  assert.equal(countVisible(results), 0)
})
