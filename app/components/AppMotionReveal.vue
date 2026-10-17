<script setup lang="ts">
import { motion } from 'motion-v'
defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{ index?: number; panel?: boolean; loaded?: boolean; layout?: boolean }>(), { index: 0, panel: false, loaded: false, layout: false })
const { reducedMotion, navigated, revealTransition, appMotion } = useAppMotion()
const initial = navigated.value ? { opacity: 0, y: reducedMotion.value || props.loaded ? 0 : props.panel ? 8 : 6 } : false
const transition = computed(() => props.loaded ? { duration: appMotion.loaded, ease: appMotion.ease } : props.layout && !reducedMotion.value ? appMotion.spring : revealTransition(props.index, !!reducedMotion.value))
</script>

<template>
  <motion.div v-bind="$attrs" :initial="initial" :animate="{ opacity: 1, y: 0 }" :layout="layout && !reducedMotion" :transition="transition">
    <slot />
  </motion.div>
</template>
