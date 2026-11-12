<script setup lang="ts">
const props=defineProps<{state:any;response:any;pending?:boolean}>()
const pagination=computed(()=>props.response?.meta?.pagination)
const total=computed(()=>pagination.value?.total??0)
const count=computed(()=>pagination.value?.pageCount??Math.ceil(total.value/props.state.pageSize.value))
// Every table lists the newest records first by default. Reka UI's SelectItem rejects '' as a value, so the default order uses a sentinel mapped back to ''.
const sortModel=computed({get:()=>props.state.sort.value||'default',set:(value:string)=>{props.state.sort.value=value==='default'?'':value}})
</script>
<template>
  <div class="my-5 flex flex-wrap items-center justify-between gap-3" aria-label="Record pagination">
    <p class="text-sm text-muted">{{ total }} {{ total === 1 ? 'record' : 'records' }} · Page {{ state.page.value }} of {{ Math.max(1,count) }}</p>
    <!-- Phones get two full-width rows (sort and page size, then Previous and Next) so the sort label is not cut off; wider screens keep one row. -->
    <div class="grid w-full grid-cols-6 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
      <USelect v-model="sortModel" :items="[{label:'Newest first',value:'default'},{label:'Oldest first',value:'createdAt:asc'}]" aria-label="Record sort order" :disabled="pending" class="col-span-4 w-full sm:w-36" />
      <USelect v-model="state.pageSize.value" :items="[25,50,100]" aria-label="Records per page" :disabled="pending" class="col-span-2 w-full sm:w-20" />
      <UButton label="Previous" icon="i-lucide-chevron-left" color="neutral" variant="outline" class="col-span-3 max-sm:justify-center" :disabled="pending || state.page.value<=1" @click="state.page.value--" />
      <UButton label="Next" trailing-icon="i-lucide-chevron-right" color="neutral" variant="outline" class="col-span-3 max-sm:justify-center" :disabled="pending || state.page.value>=count" @click="state.page.value++" />
    </div>
  </div>
</template>
