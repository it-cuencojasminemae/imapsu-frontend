<script setup lang="ts">
const props=defineProps<{state:any;response:any;pending?:boolean}>()
const pagination=computed(()=>props.response?.meta?.pagination)
const total=computed(()=>pagination.value?.total??0)
const count=computed(()=>pagination.value?.pageCount??Math.ceil(total.value/props.state.pageSize.value))
</script>
<template>
  <div class="my-5 flex flex-wrap items-center justify-between gap-3" aria-label="Record pagination">
    <p class="text-sm text-muted">{{ total }} records · Page {{ state.page.value }} of {{ Math.max(1,count) }}</p>
    <div class="flex flex-wrap items-center gap-2">
      <USelect v-model="state.sort.value" :items="[{label:'Current order',value:''},{label:'Newest first',value:'createdAt:desc'},{label:'Oldest first',value:'createdAt:asc'}]" aria-label="Record sort order" :disabled="pending" />
      <USelect v-model="state.pageSize.value" :items="[25,50,100]" aria-label="Records per page" :disabled="pending" />
      <UButton label="Previous" icon="i-lucide-chevron-left" color="neutral" variant="outline" :disabled="pending || state.page.value<=1" @click="state.page.value--" />
      <UButton label="Next" trailing-icon="i-lucide-chevron-right" color="neutral" variant="outline" :disabled="pending || state.page.value>=count" @click="state.page.value++" />
    </div>
  </div>
</template>
