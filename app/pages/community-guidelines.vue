<script setup lang="ts">
useHead({ title: 'Community Guidelines | iMapSU' })

const sections = [
  {
    title: 'Rate your own experience',
    points: [
      'Rate a stall for something you bought, used or saw yourself.',
      'Say what was good and what could be better: food, service, prices, cleanliness, staff.',
      'One rating per stall. When a new tenant takes over a stall, you can rate it again.'
    ]
  },
  {
    title: 'Be respectful',
    points: [
      'No profanity, insults or slurs, in English, Filipino, Kapampangan or any other language. Disguised spellings count too.',
      'Criticize the service, not the person. No name-calling of tenants, staff or other visitors.',
      'No threats, harassment, or content about anyone\'s private life.'
    ]
  },
  {
    title: 'Keep it on topic and private',
    points: [
      'No links, advertising or promotions.',
      'No phone numbers, email addresses, social media handles or other contact details, yours or anyone else\'s.',
      'No writing in all capital letters or long runs of the same character.',
      'Comments can be up to 500 characters.'
    ]
  }
]
</script>

<template>
  <AuthShell
    variant="center"
    wide
    heading="Community guidelines"
    description="How to rate a campus stall. Anyone can rate, no account needed."
  >
    <div class="space-y-6 text-sm leading-relaxed text-toned">
      <p>
        Ratings help stall tenants improve and help the Office of Auxiliary Services (OAS) look after campus services.
        Anyone can see a stall's average rating and its latest ratings on the campus map. Ratings are anonymous: iMapSU does not ask who you are.
      </p>

      <section v-for="section in sections" :key="section.title">
        <h2 class="text-base font-semibold text-highlighted">{{ section.title }}</h2>
        <ul class="mt-2 list-disc space-y-1.5 pl-5">
          <li v-for="point in section.points" :key="point">{{ point }}</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base font-semibold text-highlighted">What happens when a rating breaks the guidelines</h2>
        <p class="mt-2">
          A comment with profanity, insults, threats, hate against a group, links or contact details is stopped before it is sent, and you can change it and try again.
          The OAS can also hide a rating that slips through. A hidden rating no longer reaches the tenant or counts toward the stall's average.
          To prevent spam, each device can only send a few ratings at a time.
        </p>
      </section>
    </div>

    <template #footer>
      <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm">
        <NuxtLink to="/" class="imapsu-auth-link">Back to home</NuxtLink>
        <span class="text-dimmed" aria-hidden="true">|</span>
        <NuxtLink to="/campus-map" class="imapsu-auth-link">Rate a stall on the map</NuxtLink>
      </div>
    </template>
  </AuthShell>
</template>
