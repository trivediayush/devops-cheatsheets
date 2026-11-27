<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { SUBNET_PRESETS, calculateSubnet } from '../utils/subnet.mjs'

const input = ref('192.168.10.77/26')
const copiedLabel = ref('')
let copyTimer

const result = computed(() => calculateSubnet(input.value))

function selectPreset(cidr) {
  input.value = cidr
}

async function copyRow(row) {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return
  try {
    await navigator.clipboard.writeText(row.copyValue || row.value)
    copiedLabel.value = row.label
    if (copyTimer) window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => {
      copiedLabel.value = ''
    }, 1500)
  } catch {
    // Clipboard access may be denied in restricted iframes.
  }
}

onBeforeUnmount(() => {
  if (copyTimer && typeof window !== 'undefined') window.clearTimeout(copyTimer)
})
</script>

<template>
  <div class="subnet-calc">
    <div class="subnet-calc__row">
      <label for="subnet-input">IPv4 / CIDR</label>
      <input
        id="subnet-input"
        v-model="input"
        type="text"
        inputmode="text"
        autocomplete="off"
        spellcheck="false"
        aria-describedby="subnet-hint"
      >
    </div>

    <div class="subnet-calc__presets" role="group" aria-label="Quick CIDR presets">
      <button
        v-for="preset in SUBNET_PRESETS"
        :key="preset.cidr"
        type="button"
        class="subnet-calc__preset"
        :class="{ 'is-active': input.trim() === preset.cidr }"
        :aria-pressed="input.trim() === preset.cidr"
        @click="selectPreset(preset.cidr)"
      >
        {{ preset.label }}
      </button>
    </div>

    <p id="subnet-hint" class="subnet-calc__hint">Results update as you type. Runs entirely in your browser.</p>
    <p v-if="result.error" class="subnet-calc__err" role="alert">{{ result.error }}</p>
    <dl v-else>
      <div v-for="row in result.rows" :key="row.label" class="subnet-calc__card">
        <div class="subnet-calc__card-head">
          <dt>{{ row.label }}</dt>
          <button
            v-if="row.copyable"
            type="button"
            class="subnet-calc__copy"
            :aria-label="`Copy ${row.label}`"
            @click="copyRow(row)"
          >
            {{ copiedLabel === row.label ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <dd class="tabular-nums">{{ row.value }}</dd>
      </div>
    </dl>
  </div>
</template>
