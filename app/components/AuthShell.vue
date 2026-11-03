<script setup lang="ts">
// Backdrop for the sign-in, sign-up and verification screens. `split` pairs a
// brand panel with the form; `center` holds a single card over the backdrop.
withDefaults(defineProps<{
  variant?: 'split' | 'center'
  heading: string
  description: string
  features?: string[]
  compact?: boolean
  wide?: boolean
}>(), { variant: 'split', features: () => [], compact: false, wide: false })
</script>

<template>
  <!-- These screens are always dark, whatever theme the signed-in app uses. -->
  <div class="imapsu-auth-page dark" :class="{ 'imapsu-auth-page--center': variant === 'center' }">
    <template v-if="variant === 'center'">
      <picture>
        <source media="(orientation: landscape)" srcset="/landscape-version.jpg" />
        <img src="/login-register-image.jpg" alt="" class="imapsu-auth-page-art" />
      </picture>
      <main class="imapsu-auth-center">
        <div class="imapsu-auth-center-card" :class="{ 'is-wide': wide }">
          <AuthBrand class="justify-center" />
          <hr class="imapsu-auth-rule" />
          <div class="text-center">
            <h1 class="imapsu-auth-center-heading">{{ heading }}</h1>
            <p class="mx-auto mt-2 max-w-md text-base text-balance text-muted">{{ description }}</p>
          </div>
          <div class="mt-6">
            <slot />
          </div>
          <template v-if="$slots.footer">
            <hr class="imapsu-auth-rule" />
            <slot name="footer" />
          </template>
        </div>
      </main>
    </template>

    <div v-else class="imapsu-auth-split">
      <aside class="imapsu-auth-panel" :class="{ 'is-compact': compact }">
        <AuthBrand />
        <hr class="imapsu-auth-rule imapsu-auth-panel-rule" />
        <h1 class="imapsu-auth-panel-heading">{{ heading }}</h1>
        <p class="imapsu-auth-panel-text">{{ description }}</p>
        <ul v-if="features.length" class="imapsu-auth-features">
          <li v-for="feature in features" :key="feature">
            <span class="imapsu-auth-feature-mark" aria-hidden="true"><UIcon name="i-lucide-map-pin" class="size-3.5" /></span>
            {{ feature }}
          </li>
        </ul>
        <div class="imapsu-auth-panel-art" aria-hidden="true">
          <img src="/login-register-image.jpg" alt="" />
        </div>
      </aside>
      <main class="imapsu-auth-main">
        <slot />
      </main>
    </div>
  </div>
</template>
