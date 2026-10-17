<script setup lang="ts">
const props=defineProps<{modelValue?:any;endpoint:string;query?:Record<string,any>;fields:string[];label:(item:any)=>string;value:(item:any)=>any;fallback?:any[]}>()
const emit=defineEmits(['update:modelValue'])
const request=useSecureApi(),term=ref(''),page=ref(1),rows=ref<any[]>([]),total=ref(0),busy=ref(false),error=ref(false)
let sequence=0
const load=async(append=false)=>{
  const id=++sequence;busy.value=true;error.value=false
  const query:Record<string,any>={...props.query,'pagination[page]':page.value,'pagination[pageSize]':25}
  props.fields.forEach((field,index)=>{if(term.value.trim())query['filters[$or]['+index+']['+field.split('.').join('][')+'][$containsi]']=term.value.trim()})
  try{const result=await request<any>(props.endpoint,{query});if(id!==sequence)return;rows.value=append?[...rows.value,...result.data]:result.data;total.value=result.meta.pagination.total}
  catch{if(id===sequence)error.value=true}finally{if(id===sequence)busy.value=false}
}
watch(term,()=>{page.value=1;load()})
onMounted(()=>load())
const options=computed(()=>{
  const result=rows.value.map(row=>({label:props.label(row),value:props.value(row)}))
  const selected=props.fallback?.find(item=>item.value===props.modelValue)
  if(selected&&!result.some(item=>item.value===selected.value))result.unshift(selected)
  return result
})
</script>
<template>
  <div class="space-y-2">
    <UInput v-model="term" placeholder="Search records…" icon="i-lucide-search" aria-label="Search available records" class="w-full" />
    <USelect :model-value="modelValue" :items="options" :loading="busy" class="w-full" @update:model-value="emit('update:modelValue',$event)" />
    <UButton v-if="rows.length<total" size="xs" color="neutral" variant="ghost" label="Load more choices" :loading="busy" @click="page++;load(true)" />
    <UButton v-if="error" size="xs" color="error" variant="ghost" label="Retry choices" @click="load()" />
  </div>
</template>
