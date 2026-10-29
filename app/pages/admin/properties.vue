<script setup lang="ts">
import { PAMSU_BUILDINGS } from '~/utils/pamsu'
import { uploadInBatches } from '~/utils/uploadFile'
import type { MapPin, MapPosition } from '~/types/map'

definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas']
})

type UploadedFile = { id: number; url?: string; name?: string }

type PropertySpace = {
  id: number | string
  documentId?: string
  propertyCode: string
  name: string
  building: string
  campus?: string
  floor?: string
  description?: string
  area?: number | string
  rentalClassification?: string
  businessName?: string
  photos?: UploadedFile[] | null
  productsServices?: string
  operatingDetails?: string
  space_status: 'Vacant' | 'Occupied'
  monthlyRent?: number | string
  mapPosition?: MapPosition | null
  tenancies?: { documentId?: string; status?: string; user?: { username?: string; email?: string } | null }[] | null
}

type ListResponse<T> = { data: T[] }

useHead({ title: 'Manage Properties | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { confirm } = useConfirmDialog()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = {}

const filterSearch = ref('')
const filterCampus = ref('all')
const filterClassification = ref('all')
const filterStatus = ref('all')
const recordsPage = useRecordPage(["name","propertyCode","businessName","building","campus"], { campus: { ref: filterCampus, field: 'campus' }, classification: { ref: filterClassification, field: 'rentalClassification' }, status: { ref: filterStatus, field: 'space_status' } }, filterSearch)
const { data: responseData, status, error, refresh } = await useFetch<ListResponse<PropertySpace>>('/api/property-spaces', {
  baseURL,
  headers,
  query: computed(() => ({
    sort: 'building:asc',

    'populate[photos]': true,
    'populate[tenancies][filters][status][$eq]': 'Active',
    'populate[tenancies][populate][user]': true
   , ...recordsPage.query.value }))
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)


const properties = computed(() => data.value?.data ?? [])

// The Building dropdown lists only the current campus building directory
// (pamsu-buildings.json, shared with the map). Historic GLB-derived names and
// stale values stored on older property rows are never offered again. When
// editing an old row whose building name is no longer in the directory, the
// stored value is kept so the select can still display it.
const buildingOptions = computed(() => {
  const names = PAMSU_BUILDINGS.map((building) => building.name)
  const current = editing.value?.building
  if (current && !names.includes(current)) return [...names, current]
  return names
})

const CAMPUS_OPTIONS = ['Main Campus']
const campusOptions = computed(() => {
  const known = new Set(CAMPUS_OPTIONS)
  const existing = properties.value.map((p) => p.campus).filter((c): c is string => Boolean(c) && !known.has(c))
  return [...CAMPUS_OPTIONS, ...existing]
})

const CLASSIFICATION_OPTIONS = [
  { label: 'Food and Beverage', value: 'Food and Beverage' },
  { label: 'Retail', value: 'Retail' },
  { label: 'Services', value: 'Services' },
  { label: 'Office', value: 'Office' },
  { label: 'Storage', value: 'Storage' },
  { label: 'Other', value: 'Other' }
]

const page = recordsPage.page
const pageSize = recordsPage.pageSize

watch(pageSize, () => {
  page.value = 1
})

const filteredProperties = computed(() => properties.value)

const filterCount = computed(() => {
  let count = 0
  if (filterCampus.value !== 'all') count++
  if (filterClassification.value !== 'all') count++
  if (filterStatus.value !== 'all') count++
  if (filterSearch.value.trim()) count++
  return count
})

const clearFilters = () => {
  filterSearch.value = ''
  filterCampus.value = 'all'
  filterClassification.value = 'all'
  filterStatus.value = 'all'
  page.value = 1
}

const totalPages = computed(() => (responseData.value as any)?.meta?.pagination?.pageCount || 1)



const pagedProperties = computed(() => filteredProperties.value)

const tenantOf = (property: PropertySpace) => {
  const active = property.tenancies?.find(tenancy => tenancy.status === 'Active')
  return active?.user?.username || active?.user?.email || null
}

const formatCurrency = (amount?: number | string) => amount == null || amount === ''
  ? '—'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(amount))

const formOpen = ref(false)
const editing = ref<PropertySpace | null>(null)
const saving = ref(false)
const formError = ref('')
// Staged listing photos: selected files are kept as local previews and
// existing photos can be removed from the working set, but nothing is
// persisted to the property until the form is saved.
type DraftPhoto = { url: string; serverId?: number; name?: string; file?: File }
const photoDrafts = ref<DraftPhoto[]>([])

const form = reactive({
  propertyCode: '',
  name: '',
  building: '',
  campus: 'Main Campus',
  floor: '',
  description: '',
  area: '',
  monthlyRent: '',
  rentalClassification: 'Other',
  space_status: 'Vacant' as 'Vacant' | 'Occupied',
  mapPosition: null as MapPosition | null
})

// Stall pin on the campus map. Other stalls on this page are shown faded in
// the picker so the OAS can place neighbours relative to each other.
const mapPickerOpen = ref(false)
const otherStallPins = computed<MapPin[]>(() => properties.value
  .filter(property => property.mapPosition && (property.documentId ?? property.id) !== (editing.value?.documentId ?? editing.value?.id))
  .map(property => ({ id: String(property.documentId ?? property.id), ...property.mapPosition!, label: property.name, status: property.space_status })))
const onBuildingPicked = (name: string) => {
  if (buildingOptions.value.includes(name)) form.building = name
}

const resetForm = (property: PropertySpace | null) => {
  editing.value = property
  photoDrafts.value = (property?.photos ?? []).filter(photo => photo?.id != null).map(photo => ({
    url: `${baseURL}${photo.url}`,
    serverId: photo.id,
    name: photo.name
  }))
  Object.assign(form, {
    propertyCode: property?.propertyCode ?? '',
    name: property?.name ?? '',
    building: property?.building ?? '',
    campus: property?.campus ?? 'Main Campus',
    floor: property?.floor ?? '',
    description: property?.description ?? '',
    area: property?.area != null ? String(property.area) : '',
    monthlyRent: property?.monthlyRent != null ? String(property.monthlyRent) : '',
    rentalClassification: property?.rentalClassification ?? 'Other',
    space_status: property?.space_status ?? 'Vacant',
    mapPosition: property?.mapPosition ?? null
  })
  formError.value = ''
}

const openCreate = () => {
  resetForm(null)
  formOpen.value = true
}

const openEdit = (property: PropertySpace) => {
  resetForm(property)
  formOpen.value = true
}

const onPhotosSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return
  for (const file of files) {
    photoDrafts.value.push({ url: URL.createObjectURL(file), file })
  }
  formError.value = ''
}

const removePhoto = (photo: DraftPhoto) => {
  photoDrafts.value = photoDrafts.value.filter(item => item !== photo)
}

const save = async () => {
  saving.value = true
  formError.value = ''
  try {
    const pending = photoDrafts.value.filter(photo => photo.file)
    let uploadedIds: UploadedFile[] = []
    if (pending.length) {
      uploadedIds = await uploadInBatches(pending.map(photo => photo.file as File), batch => {
        const formData = new FormData()
        formData.append('purpose', 'property-photo')
        for (const file of batch) formData.append('files', file)
        return $api<UploadedFile[]>('/api/upload', {
          method: 'POST',
          body: formData
        })
      })
    }
    const body = {
      data: {
        name: form.name,
        building: form.building,
        campus: form.campus?.trim() || undefined,
        floor: form.floor || undefined,
        description: form.description || undefined,
        area: form.area !== '' ? Number(form.area) : undefined,
        monthlyRent: form.monthlyRent !== '' ? Number(form.monthlyRent) : undefined,
        rentalClassification: form.rentalClassification,
        photos: [...photoDrafts.value.filter(photo => photo.serverId != null).map(photo => photo.serverId as number), ...uploadedIds.filter(photo => photo?.id != null).map(photo => photo.id)],
        space_status: form.space_status,
        mapPosition: form.mapPosition
      }
    }
    if (editing.value) {
      await $api(`/api/property-spaces/${editing.value.documentId ?? editing.value.id}`, { method: 'PUT', body })
      toast.add({ title: 'Property updated', color: 'success', icon: 'i-lucide-check-circle-2' })
    } else {
      await $api('/api/property-spaces', { method: 'POST', body })
      toast.add({ title: 'Property created', color: 'success', icon: 'i-lucide-check-circle-2' })
    }
    formOpen.value = false
    await refresh()
  } catch (err) {
    formError.value = getErrorMessage(err)
  } finally {
    saving.value = false
  }
}

const remove = async (property: PropertySpace) => {
  const tenantNote = property.space_status === 'Occupied' ? ' Its active tenancy will be ended and the tenant returned to aspiring tenant.' : ''
  if (!await confirm({ title: 'Delete rentable space?', description: `"${property.name}" (${property.propertyCode}) will be permanently removed.${tenantNote} This cannot be undone.`, confirmLabel: 'Delete space', icon: 'i-lucide-trash-2' })) return
  try {
    await $api(`/api/property-spaces/${property.documentId ?? property.id}`, { method: 'DELETE' })
    toast.add({ title: 'Property deleted', description: property.name, color: 'success', icon: 'i-lucide-check-circle-2' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Unable to delete property', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  }
}
</script>

<template>
  <main class="imapsu-page imapsu-page--admin">
    <AppPageHeader>
      <template #eyebrow>Management</template>
      <template #title>Rentable Spaces</template>
      <template #description><p class="mt-2 max-w-xl text-muted">Manage campus stalls and other rentable spaces, their locations, rental classifications, and occupancy information.</p></template>
      <template #actions><div class="flex items-center gap-3">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
        <UButton data-prominent="true" label="Add property space" icon="i-lucide-plus" @click="openCreate" />
      </div></template>
    </AppPageHeader>

    <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" :count="6" height="h-56" />

    <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load property spaces" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

    <UEmpty v-else-if="properties.length === 0" icon="i-lucide-store" title="No property spaces found" description="Registered rentable spaces will appear here. Use Add property space to create a record." />

    <div v-else>
      <UCard :ui="{ body: 'p-4' }">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <UFormField label="Search">
            <UInput v-model="filterSearch" placeholder="Name, code, business…" icon="i-lucide-search" />
          </UFormField>
          <UFormField label="Campus">
            <USelect v-model="filterCampus" :items="[{ label: 'All campuses', value: 'all' }, ...campusOptions.map(campus => ({ label: campus, value: campus }))]" />
          </UFormField>
          <UFormField label="Classification">
            <USelect v-model="filterClassification" :items="[{ label: 'All classifications', value: 'all' }, ...CLASSIFICATION_OPTIONS]" />
          </UFormField>
          <UFormField label="Status">
            <USelect v-model="filterStatus" :items="[{ label: 'All statuses', value: 'all' }, { label: 'Vacant', value: 'Vacant' }, { label: 'Occupied', value: 'Occupied' }]" />
          </UFormField>
          <UFormField label="Result per page">
            <USelect v-model="pageSize" :items="[{ label: '25', value: 25 }, { label: '50', value: 50 }, { label: '100', value: 100 }, { label: '9', value: 9 }, { label: '18', value: 18 }, { label: '36', value: 36 }]" />
          </UFormField>
        </div>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm text-muted">Showing {{ pagedProperties.length }} of {{ (data as any)?.meta?.pagination?.total ?? filteredProperties.length }} property spaces</p>
          <UButton v-if="filterCount > 0" label="Clear filters" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="clearFilters" />
        </div>
      </UCard>

      <UEmpty v-if="filteredProperties.length === 0" icon="i-lucide-list-filter" title="No matching property spaces" description="No property spaces match the current filters." />

      <template v-else>
        <div class="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <UCard v-for="property in pagedProperties" :key="property.documentId ?? property.id" :ui="{ header: 'p-5', body: 'p-5 pt-0' }">
            <template #header>
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-mono text-xs text-muted">{{ property.propertyCode }}</p>
                  <h2 class="mt-1 truncate text-lg font-semibold text-highlighted">{{ property.name }}</h2>
                  <p v-if="property.businessName" class="truncate text-sm text-primary">{{ property.businessName }}</p>
                </div>
                <UBadge :color="property.space_status === 'Vacant' ? 'secondary' : 'neutral'" variant="subtle">{{ property.space_status }}</UBadge>
              </div>
            </template>

            <div v-if="property.photos?.length" class="mb-4 flex gap-2 overflow-x-auto">
              <img
                v-for="photo in property.photos"
                :key="photo.id"
                :src="`${baseURL}${photo.url}`"
                :alt="photo.name || property.name"
                class="h-24 w-24 shrink-0 rounded-lg object-cover"
              />
            </div>

            <dl class="space-y-3 text-sm">
              <div class="flex items-center justify-between">
                <dt class="text-xs text-muted">Location</dt>
                <dd class="font-medium text-highlighted">
                  {{ [property.building, property.campus].filter(Boolean).join(' · ') }}<span v-if="property.floor"> · {{ property.floor }}</span>
                </dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-xs text-muted">Classification</dt>
                <dd class="font-medium text-highlighted">{{ property.rentalClassification ?? 'Other' }}</dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-xs text-muted">Area</dt>
                <dd class="font-medium text-highlighted">{{ property.area != null ? `${property.area} sqm` : '—' }}</dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-xs text-muted">Monthly rent</dt>
                <dd class="font-semibold text-primary">{{ formatCurrency(property.monthlyRent) }}</dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-xs text-muted">Tenant</dt>
                <dd class="truncate font-medium text-highlighted">
                  <span v-if="tenantOf(property)" class="flex items-center gap-1.5">
                    <UIcon name="i-lucide-circle-user-round" class="size-3.5 text-primary" />
                    {{ tenantOf(property) }}
                  </span>
                  <span v-else class="text-muted">Vacant</span>
                </dd>
              </div>
            </dl>

            <p v-if="property.productsServices" class="mt-4 rounded-lg bg-primary/5 px-3 py-2 text-xs leading-relaxed text-toned">
              <span class="font-semibold text-highlighted">Products / services: </span>{{ property.productsServices }}
            </p>

            <div class="mt-4 flex gap-2 border-t border-default pt-4">
              <UButton label="Edit" icon="i-lucide-pencil" color="neutral" variant="subtle" size="sm" @click="openEdit(property)" />
              <UButton label="Delete" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(property)" />
            </div>
          </UCard>
        </div>

      </template>
    </div>

    <UModal v-model:open="formOpen" class="max-w-2xl" :title="editing ? 'Edit property space' : 'Add property space'" description="Manage a rentable space on campus.">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Property code" description="Auto-generated from the building, e.g. MO-001.">
              <UInput v-model="form.propertyCode" placeholder="Auto-generated on save" disabled />
            </UFormField>
            <UFormField label="Name" required>
              <UInput required v-model="form.name" placeholder="e.g. Stall 101" />
            </UFormField>
            <UFormField label="Classification">
              <USelect v-model="form.rentalClassification" :items="CLASSIFICATION_OPTIONS" />
            </UFormField>
            <UFormField label="Building" required>
              <USelect v-model="form.building" :items="buildingOptions" placeholder="Select the campus building" />
            </UFormField>
            <UFormField label="Campus">
              <USelect v-model="form.campus" :items="campusOptions" placeholder="Select the campus" />
            </UFormField>
            <UFormField label="Floor">
              <UInput v-model="form.floor" placeholder="e.g. 2" />
            </UFormField>
            <UFormField label="Area (sqm)">
              <UInput v-model="form.area" type="number" min="0" step="0.01" />
            </UFormField>
            <UFormField label="Monthly rent (PHP)">
              <UInput v-model="form.monthlyRent" type="number" min="0" />
            </UFormField>
            <UFormField label="Status">
              <USelect v-model="form.space_status" :items="[{ label: 'Vacant', value: 'Vacant' }, { label: 'Occupied', value: 'Occupied' }]" />
            </UFormField>
          </div>

          <UFormField label="Map location" description="Pin the exact spot of this stall on the campus map.">
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default px-3 py-2.5">
              <p class="flex items-center gap-2 text-sm" :class="form.mapPosition ? 'text-highlighted' : 'text-muted'">
                <UIcon :name="form.mapPosition ? 'i-lucide-map-pin-check' : 'i-lucide-map-pin-off'" class="size-4 shrink-0" :class="form.mapPosition ? 'text-primary' : ''" />
                {{ form.mapPosition ? `Pinned${form.building ? ` near ${form.building}` : ' on the map'}` : 'Not placed on the map' }}
              </p>
              <div class="flex items-center gap-1">
                <UButton v-if="form.mapPosition" label="Remove" color="neutral" variant="ghost" size="sm" @click="form.mapPosition = null" />
                <UButton :label="form.mapPosition ? 'Move pin' : 'Pick on map'" icon="i-lucide-map-pin" color="neutral" variant="outline" size="sm" @click="mapPickerOpen = true" />
              </div>
            </div>
          </UFormField>

          <UFormField label="Photos" description="Listing photos shown on the campus map while the space is vacant. Photos apply only when you save the property.">
            <div class="flex flex-wrap items-center gap-3">
              <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2 text-sm font-medium text-primary hover:border-primary">
                <UIcon name="i-lucide-image-plus" class="size-4" />
                Add photos
                <input type="file" accept="image/*" multiple class="sr-only" @change="onPhotosSelected" />
              </label>
              <div v-if="photoDrafts.length" class="flex flex-wrap gap-2">
                <div v-for="photo in photoDrafts" :key="photo.serverId ?? photo.url" class="group relative">
                  <img :src="photo.url" :alt="photo.name || 'Photo'" class="h-20 w-20 rounded-lg object-cover" />
                  <button type="button" :aria-label="`Remove ${photo.name || 'property photo'}`" class="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-background text-muted shadow hover:text-error" @click="removePhoto(photo)">
                    <UIcon name="i-lucide-x" class="size-3" />
                  </button>
                </div>
              </div>
            </div>
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="form.description" :rows="3" />
          </UFormField>

          <UAlert v-if="formError" color="error" icon="i-lucide-triangle-alert" :description="formError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="saving" @click="formOpen = false" />
            <UButton data-prominent="true" type="submit" :loading="saving">{{ editing ? 'Save changes' : 'Create property' }}</UButton>
          </div>
        </form>
      </template>
    </UModal>
    <ClientOnly>
      <StallMapPicker
        v-model:open="mapPickerOpen"
        v-model="form.mapPosition"
        :building="form.building"
        :stall-name="form.name"
        :other-pins="otherStallPins"
        @building-picked="onBuildingPicked"
      />
    </ClientOnly>
    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />
  </main>
</template>
