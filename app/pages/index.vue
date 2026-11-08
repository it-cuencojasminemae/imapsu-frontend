<script setup lang="ts">
import { landingPath } from '~/utils/accountNavigation'

// Visitors land here; signed-in accounts go straight to their own dashboard.
definePageMeta({
  layout: false,
  middleware: () => {
    const { user } = useAuth()
    if (user.value) return navigateTo(landingPath(user.value), { replace: true })
  }
})
useHead({ title: 'iMapSU | Campus Stall Management for Pampanga State University' })

const applyLink = '/register?role=aspiring-tenant'

const colorMode = useColorMode()
const toggleColorMode = () => { colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark' }

const features = [
  { title: 'Explore the campus', text: 'Find stalls and open spaces on a 3D map, and rate the stalls you visit. No account needed.' },
  { title: 'Apply for a stall', text: 'Send your rental application and requirements online, any time.' },
  { title: 'Manage with ease', text: 'Your lease, monthly bills, receipts and requests in one place.' }
]

const applySteps = [
  { title: 'Create your account', text: 'Sign up as an aspiring tenant and verify your email.' },
  { title: 'Choose a vacant stall', text: 'Find an open space on the map or in the list of rentable spaces.' },
  { title: 'Send your requirements', text: 'Upload your letter of intent, SEC/DTI, BIR and permits, and accept the stall rules.' },
  { title: 'Visit the office', text: 'The OAS reviews your application and schedules your office visit.' }
]

const tenantTools = [
  'View each month’s bill with the electricity and water breakdown',
  'Upload your official receipt and track its verification',
  'Report maintenance concerns and follow their progress',
  'Read announcements from the Office of Auxiliary Services'
]
</script>

<template>
  <div class="landing min-h-dvh bg-default text-default">
    <a href="#landing-main" class="imapsu-skip-link">Skip to content</a>

    <header class="landing-bar">
      <div class="landing-wrap flex h-[4.5rem] items-center gap-3 sm:gap-6">
        <NuxtLink to="/" class="flex shrink-0 items-center gap-3" aria-label="iMapSU home">
          <BrandLogo size="size-10" />
          <span class="leading-tight">
            <span class="block text-lg font-bold tracking-tight text-maroon-800 dark:text-gold-300">iMapSU</span>
            <span class="block text-xs text-muted max-sm:hidden">Office of Auxiliary Services</span>
          </span>
        </NuxtLink>
        <div class="ml-auto flex items-center gap-2 sm:gap-3">
          <!-- Both icons render and CSS shows the right one, so the server render matches the saved theme. -->
          <UButton class="imapsu-appbar-btn size-9" color="neutral" variant="ghost" square aria-label="Toggle color theme" title="Toggle color theme" @click="toggleColorMode">
            <UIcon name="i-lucide-moon" class="imapsu-theme-light size-4" />
            <UIcon name="i-lucide-sun" class="imapsu-theme-dark size-4" />
          </UButton>
          <NuxtLink to="/login" class="landing-signin">Sign In</NuxtLink>
          <UButton :to="applyLink" label="Apply Now" trailing-icon="i-lucide-arrow-right" class="landing-btn-primary landing-btn-raised rounded-xl px-4" :ui="{ trailingIcon: 'max-[400px]:hidden' }" />
        </div>
      </div>
    </header>

    <main id="landing-main">
      <section class="landing-hero">
        <div class="landing-hero-wash" aria-hidden="true" />
        <div class="landing-hero-art" aria-hidden="true">
          <img src="/landscape-version.jpg" alt="" fetchpriority="high" />
        </div>
        <div class="landing-hero-swoosh" aria-hidden="true" />

        <div class="landing-wrap relative">
          <div class="landing-hero-copy">
            <p class="landing-tag">Pampanga State University – Main Campus</p>
            <h1 class="landing-title">Find, rent and manage campus stalls <span class="text-maroon-700 dark:text-maroon-400">in one place.</span></h1>
            <p class="landing-lead">
              iMapSU is the Office of Auxiliary Services' map-driven system for campus stalls. Explore the campus in 3D, apply for a vacant space and manage your tenancy online.
            </p>
            <div class="mt-8 flex flex-wrap gap-3">
              <UButton to="/campus-map" size="xl" label="Explore the Campus Map" trailing-icon="i-lucide-arrow-right" class="landing-btn-primary landing-btn-raised rounded-xl" />
              <UButton :to="applyLink" size="xl" label="Apply Now" class="landing-btn-outline rounded-xl" />
            </div>
            <p class="mt-6 text-muted">
              Already a tenant? <NuxtLink to="/login" class="font-semibold text-maroon-800 underline underline-offset-4 dark:text-maroon-300">Sign In</NuxtLink>
            </p>
          </div>
        </div>

        <!-- Phones get the art as its own picture under the copy. -->
        <div class="landing-hero-art-mobile" aria-hidden="true">
          <img src="/landscape-version.jpg" alt="" />
        </div>
      </section>

      <section id="features" class="landing-features" aria-label="Features">
        <div class="landing-wrap">
          <ul class="landing-feature-card">
            <li v-for="feature in features" :key="feature.title" class="landing-feature">
              <span class="landing-feature-bar" aria-hidden="true" />
              <h2 class="mt-4 text-xl font-bold tracking-tight text-highlighted">{{ feature.title }}</h2>
              <p class="mt-1.5 leading-relaxed text-muted">{{ feature.text }}</p>
            </li>
          </ul>
        </div>
      </section>

      <section id="tenants" class="landing-section" aria-labelledby="tenants-heading">
        <div class="landing-wrap">
          <h2 id="tenants-heading" class="landing-heading">From application to your first month</h2>
          <div class="mt-12 grid gap-12 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <h3 class="font-semibold text-highlighted">Applying for a stall</h3>
              <ol class="mt-5 grid gap-x-8 gap-y-7 sm:grid-cols-2">
                <li v-for="(step, index) in applySteps" :key="step.title" class="landing-step">
                  <span class="landing-step-number">{{ index + 1 }}</span>
                  <p class="mt-3 font-semibold text-highlighted">{{ step.title }}</p>
                  <p class="mt-1 leading-relaxed text-muted">{{ step.text }}</p>
                </li>
              </ol>
              <UButton :to="applyLink" label="Start your application" class="landing-btn-primary mt-8 rounded-lg" />
            </div>
            <div class="landing-panel">
              <h3 class="font-semibold text-highlighted">Already renting a stall?</h3>
              <ul class="mt-4 divide-y divide-default">
                <li v-for="tool in tenantTools" :key="tool" class="py-3 leading-relaxed text-toned">{{ tool }}</li>
              </ul>
              <UButton to="/login" label="Sign in to your account" color="neutral" variant="outline" class="mt-4 rounded-lg" />
            </div>
          </div>
        </div>
      </section>

      <section id="about" class="landing-section landing-section--muted" aria-labelledby="about-heading">
        <div class="landing-wrap grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-16">
          <div class="max-w-xl">
            <h2 id="about-heading" class="landing-heading">See which stalls are free before you apply</h2>
            <p class="mt-4 text-base leading-relaxed text-toned">
              Every building on campus is on the map. Green pins are vacant spaces you can apply for; red ones are taken. Select a building to see its stalls, rent and ratings.
            </p>
            <p class="mt-4 leading-relaxed text-muted">
              iMapSU (Interactive Map-Driven Stall Management System) is run by the Office of Auxiliary Services of Pampanga State University.
            </p>
            <UButton to="/campus-map" label="Open the campus map" trailing-icon="i-lucide-arrow-right" color="neutral" variant="outline" class="mt-6 rounded-lg" />
          </div>
          <NuxtLink to="/campus-map" class="landing-shot" aria-label="Open the campus map">
            <img src="/campus-map-preview.png" width="400" height="390" alt="The iMapSU 3D campus map, with buildings labelled and pins marking vacant and occupied stalls" loading="lazy" />
          </NuxtLink>
        </div>
      </section>

      <section class="landing-section" aria-labelledby="cta-heading">
        <div class="landing-wrap">
          <div class="landing-band">
            <div>
              <h2 id="cta-heading" class="text-2xl font-bold tracking-tight text-white sm:text-3xl">Ready to open a stall on campus?</h2>
              <p class="mt-2 max-w-xl text-maroon-100">Create your account and send your application. The OAS will review it and schedule your office visit.</p>
            </div>
            <UButton :to="applyLink" size="xl" label="Apply now" class="landing-btn-light shrink-0 rounded-lg" />
          </div>
        </div>
      </section>
    </main>

    <footer class="border-t border-default">
      <div class="landing-wrap flex flex-col gap-3 py-8 text-sm text-muted sm:flex-row sm:items-center">
        <p>© {{ new Date().getFullYear() }} iMapSU · Office of Auxiliary Services, Pampanga State University</p>
        <nav class="flex gap-5 sm:ml-auto" aria-label="Footer">
          <NuxtLink to="/campus-map" class="hover:text-highlighted">Campus map</NuxtLink>
          <NuxtLink to="/community-guidelines" class="hover:text-highlighted">Community guidelines</NuxtLink>
          <NuxtLink to="/privacy" class="hover:text-highlighted">Privacy</NuxtLink>
          <NuxtLink to="/login" class="hover:text-highlighted">Sign in</NuxtLink>
        </nav>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.landing { --landing-wash: #fbf3f2; scroll-behavior: smooth; }
.dark .landing { --landing-wash: #1c1514; }
.landing-wrap { width: 100%; max-width: 76rem; margin-inline: auto; padding-inline: 1rem; }
@media (min-width: 640px) { .landing-wrap { padding-inline: 1.5rem; } }
#features, #tenants, #about { scroll-margin-top: 5rem; }

/* Top bar */
.landing-bar { position: sticky; top: 0; z-index: 30; background: color-mix(in srgb, var(--ui-bg) 92%, transparent); backdrop-filter: blur(12px); border-bottom: 1px solid var(--ui-border); }
.landing-signin { font-weight: 600; color: var(--ui-text-highlighted); padding: 0.5rem 0.25rem; }
.landing-signin:hover { color: var(--color-maroon-700); }
@media (max-width: 380px) { .landing-signin { display: none; } }

/* Buttons */
.landing-btn-primary { background: var(--color-maroon-800); color: #fff; font-weight: 600; }
.landing-btn-primary:hover { background: var(--color-maroon-700); }
.landing-btn-raised { box-shadow: 0 8px 20px -10px rgb(98 34 29 / 60%); }
.landing-btn-outline { background: var(--ui-bg); color: var(--color-maroon-800); font-weight: 600; box-shadow: inset 0 0 0 1.5px var(--color-maroon-700); }
.landing-btn-outline:hover { background: var(--color-maroon-50); }
.dark .landing-btn-outline { color: var(--color-maroon-200); box-shadow: inset 0 0 0 1.5px var(--color-maroon-400); }
.dark .landing-btn-outline:hover { background: rgb(255 255 255 / 6%); }
.landing-btn-light { background: #fff; color: var(--color-maroon-900); font-weight: 600; }
.landing-btn-light:hover { background: var(--color-maroon-50); }

/* Hero: light copy on the left, the campus art in a curved maroon panel on the right. */
.landing-hero { position: relative; overflow: hidden; isolation: isolate; padding-block: 4.5rem 9rem; }
.landing-hero-wash { position: absolute; inset: 0; z-index: -3; background: radial-gradient(120% 90% at 0% 0%, var(--ui-bg) 40%, var(--landing-wash) 100%); }
.landing-hero-art { position: absolute; z-index: -2; top: 0; right: 0; bottom: 0; width: 58%; overflow: hidden; background: var(--color-maroon-900); clip-path: ellipse(100% 130% at 100% 100%); }
.landing-hero-art img { width: 100%; height: 100%; object-fit: cover; object-position: 72% 62%; }
/* A pale band follows the panel's curved edge, like a ribbon over the art. */
.landing-hero-swoosh { position: absolute; z-index: -1; top: 0; right: 0; bottom: 0; width: 61%; pointer-events: none; clip-path: ellipse(100% 130% at 100% 100%); -webkit-mask: radial-gradient(ellipse 100% 130% at 100% 100%, transparent 95.5%, #000 96%); mask: radial-gradient(ellipse 100% 130% at 100% 100%, transparent 95.5%, #000 96%); background: linear-gradient(180deg, color-mix(in srgb, var(--color-maroon-200) 55%, transparent), color-mix(in srgb, var(--color-maroon-300) 25%, transparent)); }
.dark .landing-hero-swoosh { opacity: 0.25; }
.landing-hero-copy { max-width: 31rem; animation: landing-rise 700ms var(--app-ease) both; }
.landing-tag { display: inline-block; padding: 0.4rem 0.9rem; border-radius: 999px; background: var(--color-maroon-100); color: var(--color-maroon-800); font-size: 0.875rem; font-weight: 600; }
.dark .landing-tag { background: rgb(184 64 52 / 18%); color: var(--color-maroon-200); }
.landing-title { margin-top: 1.25rem; font-size: clamp(2.5rem, 4.6vw, 4rem); line-height: 1.02; font-weight: 800; letter-spacing: -0.035em; color: var(--ui-text-highlighted); text-wrap: balance; }
.landing-lead { margin-top: 1.5rem; max-width: 30rem; font-size: 1.0625rem; line-height: 1.7; color: var(--ui-text-toned); text-wrap: pretty; }
.landing-hero-art-mobile { display: none; }

/* Under 1024px the panel would sit behind the copy, so the art moves below it. */
@media (max-width: 1023px) {
  .landing-hero { padding-block: 3rem 7rem; }
  .landing-hero-art, .landing-hero-swoosh { display: none; }
  .landing-hero-copy { max-width: 40rem; }
  .landing-hero-art-mobile { display: block; margin: 2.5rem 1rem 0; overflow: hidden; border-radius: 1.5rem; aspect-ratio: 4 / 3; background: var(--color-maroon-900); }
  .landing-hero-art-mobile img { width: 100%; height: 100%; object-fit: cover; object-position: 80% 70%; }
}
@media (min-width: 640px) and (max-width: 1023px) { .landing-hero-art-mobile { margin-inline: 1.5rem; aspect-ratio: 16 / 9; } }

/* Feature strip overlapping the bottom of the hero. */
.landing-features { position: relative; z-index: 2; margin-top: -5.5rem; }
.landing-feature-card { display: grid; gap: 0; padding: 0.5rem 1.5rem; border-radius: 1.25rem; border: 1px solid var(--ui-border); background: color-mix(in srgb, var(--ui-bg) 94%, transparent); backdrop-filter: blur(14px); box-shadow: 0 24px 48px -28px rgb(56 15 12 / 35%); }
.landing-feature { padding: 1.5rem 0.5rem; }
.landing-feature + .landing-feature { border-top: 1px solid var(--ui-border); }
@media (min-width: 768px) {
  .landing-feature-card { grid-template-columns: repeat(3, 1fr); padding: 0.5rem 1rem; }
  .landing-feature { padding: 2rem 2rem; }
  .landing-feature + .landing-feature { border-top: 0; border-left: 1px solid var(--ui-border); }
}

.landing-feature-bar { display: block; width: 2.75rem; height: 4px; border-radius: 4px; background: var(--color-maroon-700); }

/* Sections */
.landing-section { padding-block: 5.5rem; }
.landing-section--muted { background: var(--landing-wash); border-block: 1px solid var(--ui-border); }
.landing-heading { font-size: clamp(1.75rem, 3vw, 2.5rem); line-height: 1.12; font-weight: 800; letter-spacing: -0.025em; color: var(--ui-text-highlighted); text-wrap: balance; }
.landing-step { padding-top: 1.25rem; border-top: 2px solid var(--ui-border); }
.landing-step-number { font-size: 0.875rem; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--color-maroon-700); }
.dark .landing-step-number { color: var(--color-maroon-300); }
.landing-panel { align-self: start; padding: 1.75rem; border-radius: 1rem; border: 1px solid var(--ui-border); background: var(--landing-wash); }

.landing-band { display: flex; flex-direction: column; gap: 1.5rem; padding: 2.5rem; border-radius: 1rem; background: var(--color-maroon-900); }
.landing-shot { display: block; justify-self: center; width: min(100%, 25rem); padding: 0.5rem; border: 1px solid var(--ui-border); border-radius: 1.25rem; background: var(--ui-bg); transition: border-color var(--app-motion-fast); }
.landing-shot:hover { border-color: var(--ui-border-accented); }
.landing-shot img { display: block; width: 100%; height: auto; border-radius: 0.75rem; }
@media (min-width: 768px) { .landing-band { flex-direction: row; align-items: center; justify-content: space-between; padding: 3rem; } }

@keyframes landing-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .landing-hero-copy { animation: none; } .landing { scroll-behavior: auto; } }
</style>
