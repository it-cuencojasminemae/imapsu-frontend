<script setup lang="ts">
const props=defineProps<{modelValue?:any;endpoint:string;query?:Record<string,any>;fields:string[];label:(item:any)=>string;value:(item:any)=>any;fallback?:any[];placeholder?:string;badge?:(item:any)=>{label:string;color:'success'|'error'|'neutral'};isDisabled?:(item:any)=>boolean}>()
const emit=defineEmits(['update:modelValue'])
const request=useSecureApi(),term=ref(''),page=ref(1),rows=ref<any[]>([]),total=ref(0),busy=ref(false),error=ref(false),chosen=ref<any>(null)
let sequence=0,timer:ReturnType<typeof setTimeout>|undefined
const options=computed(()=>rows.value.map(row=>({label:props.label(row),value:props.value(row),badge:props.badge?.(row),disabled:props.isDisabled?.(row)})))
const selectedLabel=(value:any)=>(options.value.find(item=>item.value===value)??props.fallback?.find(item=>item.value===value)??(chosen.value?.value===value?chosen.value:null))?.label??''
// The box shows the chosen record's label between searches; that text is not a search.
const search=computed(()=>term.value===selectedLabel(props.modelValue)?'':term.value.trim())
const load=async(append=false)=>{
  const id=++sequence;busy.value=true;error.value=false
  const query:Record<string,any>={...props.query,'pagination[page]':page.value,'pagination[pageSize]':25}
  const words=search.value.split(/\s+/).filter(word=>/[\p{L}\p{N}]/u.test(word))
  words.forEach((word,index)=>props.fields.forEach((field,column)=>{query['filters[$and]['+index+'][$or]['+column+']['+field.split('.').join('][')+'][$containsi]']=word}))
  try{const result=await request<any>(props.endpoint,{query});if(id!==sequence)return;rows.value=append?[...rows.value,...result.data]:result.data;total.value=result.meta.pagination.total}
  catch{if(id===sequence)error.value=true}finally{if(id===sequence)busy.value=false}
}
watch(search,()=>{++sequence;busy.value=true;clearTimeout(timer);timer=setTimeout(()=>{page.value=1;load()},250)})
onMounted(()=>load())
onBeforeUnmount(()=>clearTimeout(timer))
const loadMore=()=>{if(busy.value||rows.value.length>=total.value)return;page.value++;load(true)}
const choose=(value:any)=>{chosen.value=options.value.find(item=>item.value===value)??null;emit('update:modelValue',value)}
// Arrowing onto the last result fetches the next page so the keyboard can keep going.
const onHighlight=(item:any)=>{if(item&&item.value===options.value.at(-1)?.value)loadMore()}
const selectLabel=(event:Event)=>{if(!search.value)(event.target as HTMLInputElement|null)?.select?.()}
</script>
<template>
  <div class="space-y-2">
    <UInputMenu :model-value="modelValue" v-model:search-term="term" :items="options" value-key="value" ignore-filter open-on-click :displayValue="selectedLabel" :reset-model-value-on-clear="false" :placeholder="placeholder ?? 'Search records…'" icon="i-lucide-search" :aria-label="placeholder ?? 'Search available records'" :loading="busy" :ui="{ trailing: 'hidden', item: 'data-highlighted:not-data-disabled:before:bg-primary/25' }" class="w-full" @update:model-value="choose" @highlight="onHighlight($event)" @focus="selectLabel" @click="selectLabel" @keydown.enter.prevent>
      <template v-if="badge" #item-trailing="{ item }"><UBadge v-if="item.badge" :label="item.badge.label" :color="item.badge.color" variant="subtle" size="sm" /></template>
      <template #empty>{{ busy ? 'Searching…' : search ? `No records match “${search}”` : 'No records available' }}</template>
      <template v-if="rows.length<total" #content-bottom>
        <div class="border-t border-default p-1"><UButton size="xs" color="neutral" variant="ghost" block label="Load more choices" :loading="busy" @mousedown.prevent @click="loadMore" /></div>
      </template>
    </UInputMenu>
    <UButton v-if="error" size="xs" color="error" variant="ghost" label="Retry choices" @click="load()" />
  </div>
</template>
