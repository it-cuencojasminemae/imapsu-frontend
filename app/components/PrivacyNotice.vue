<script setup lang="ts">
// Data Privacy Notice under the Data Privacy Act of 2012 (RA 10173), shown at
// sign-up and on /privacy. Change LAST_UPDATED whenever the wording changes.
const LAST_UPDATED = 'October 30, 2026'
const CONTACT_EMAIL = 'main.imapsu@gmail.com'

const sections = [
  {
    title: 'Information we collect',
    items: [
      'Account details: full name, username, email address, contact number, the role you choose and, for tenants, your business name.',
      'Records you create: rental applications, tenancy and billing records, payment receipts, feedback, maintenance requests and the photos or files you upload.',
      'Security records: sign-in activity, IP addresses and an audit log of important account actions.'
    ]
  },
  {
    title: 'Why we use it',
    items: [
      'To create your account and verify your email address.',
      'To process stall applications, manage tenancies and billing, and respond to feedback and maintenance requests.',
      'To send you account codes, notices and announcements.',
      'To keep the system secure and to detect misuse.'
    ]
  },
  {
    title: 'Who can see it',
    items: [
      'Only authorized OAS and MIS personnel, and only the records their role needs.',
      'Tenant business names and stall details appear on the campus map.',
      'The services that host iMapSU (Vercel, Render, Neon, Cloudflare and Brevo) store or deliver data on our behalf. We do not sell or share your personal data with anyone else.'
    ]
  },
  {
    title: 'How we protect it',
    items: [
      'All connections are encrypted (HTTPS). Passwords are stored as one-way hashes, never as readable text.',
      'Access is limited by role, sign-in attempts are rate limited, and important actions are logged.',
      'Data is stored on servers in Singapore.'
    ]
  },
  {
    title: 'How long we keep it',
    items: [
      'iMapSU is a capstone project prototype. Your data is kept only while the system is being demonstrated and evaluated, and is permanently deleted when the system is taken offline. You may ask for earlier deletion at any time.'
    ]
  },
  {
    title: 'Your rights',
    items: [
      'You have the right to be informed, to access your data, to correct it, to object to its processing, to have it erased or blocked, and to data portability.',
      'You may file a complaint with the National Privacy Commission (privacy.gov.ph).'
    ]
  }
]
</script>

<template>
  <div class="space-y-5 text-sm">
    <p class="text-muted">
      iMapSU (Interactive Map-Driven Stall Management System) respects your privacy. We collect and use personal data in line with the
      <span class="font-medium text-highlighted">Data Privacy Act of 2012 (Republic Act No. 10173)</span>.
    </p>
    <section v-for="section in sections" :key="section.title">
      <h3 class="font-semibold text-highlighted">{{ section.title }}</h3>
      <ul class="mt-1.5 list-disc space-y-1 pl-5 text-muted">
        <li v-for="item in section.items" :key="item">{{ item }}</li>
      </ul>
    </section>
    <section>
      <h3 class="font-semibold text-highlighted">Contact us</h3>
      <p class="mt-1.5 text-muted">
        For questions or requests about your data, email
        <a :href="`mailto:${CONTACT_EMAIL}`" class="font-medium text-primary hover:underline">{{ CONTACT_EMAIL }}</a>.
      </p>
    </section>
    <p class="text-xs text-dimmed">Last updated {{ LAST_UPDATED }}</p>
  </div>
</template>
