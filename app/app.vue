<template>
  <div class="min-h-screen bg-base-200 text-base-content font-sans antialiased">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from '~/composables/useTheme'

const { currentTheme, initTheme } = useTheme()

useHead({
  title: 'ImmoDB AI - Grundstücks-Tracker & KI-Analyse',
  htmlAttrs: {
    'data-theme': currentTheme
  }
})

onMounted(() => {
  initTheme()
})
</script>
