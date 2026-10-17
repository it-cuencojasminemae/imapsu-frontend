export const useRecordPage = (searchFields: string[] = [], filters: Record<string, { ref: Ref<any>; field: string; operation?: string }> = {}, searchRef: Ref<string> = ref('')) => {
  const route = useRoute(), router = useRouter()
  const number = (value: any, fallback: number) => Number.isInteger(Number(value)) && Number(value)>0 ? Number(value) : fallback
  const page = ref(number(route.query.page, 1)), pageSize = ref(Math.min(100,number(route.query.size,25)))
  const sort = ref(String(route.query.sort || ''))
  const search = searchRef
  search.value = String(route.query.q || '')
  const defaults = Object.fromEntries(Object.entries(filters).map(([key,entry])=>[key,entry.ref.value]))
  for (const [key,entry] of Object.entries(filters)) if(route.query[key]!=null) entry.ref.value = typeof entry.ref.value === 'boolean' ? route.query[key]==='true' : typeof entry.ref.value==='number' ? Number(route.query[key]) : String(route.query[key])
  const query = computed(() => {
    const result: Record<string, any> = { 'pagination[page]': page.value, 'pagination[pageSize]': pageSize.value }
    if(sort.value)result.sort=sort.value
    for(const [key,entry]of Object.entries(filters)){
      const value=entry.ref.value
      if(value==null||value===''||value===false||['all','All'].includes(String(value)))continue
      if(entry.operation==='unaddressed') { result['filters[$or][0]['+entry.field+'][$null]']=true; result['filters[$or][1]['+entry.field+'][$eq]']='' }
      else result['filters['+entry.field.split('.').join('][')+']['+(entry.operation||'$eq')+']']=value
    }
    const words=search.value.trim().split(/\s+/).filter(Boolean)
    words.forEach((word,index)=>searchFields.forEach((field,column)=>{result['filters[$and]['+index+'][$or]['+column+']['+field.split('.').join('][')+'][$containsi]']=word}))
    if(route.query.overdue==='true') {
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
      const prefix='filters[$and]['+words.length+'][$or]'
      result[prefix+'[0][dueDate][$lt]']=today
      result[prefix+'[1][overdueFlag][$eq]']=true
      result[prefix+'[2][status][$eq]']='Overdue'
      result['filters[status][$ne]']='Verified'
    }
    return result
  })
  let syncing=false
  const filterSources=Object.values(filters).map(entry=>entry.ref)
  watch([search,sort,...filterSources],()=>{if(!syncing)page.value=1})
  watch(pageSize,()=>{if(!syncing)page.value=1})
  watch([page,pageSize,sort,search,...filterSources],async()=>{
    if(syncing)return
    const next:Record<string,any>={...route.query,page:String(page.value),size:String(pageSize.value)}
    if(sort.value)next.sort=sort.value;else delete next.sort
    if(search.value)next.q=search.value;else delete next.q
    for(const [key,entry]of Object.entries(filters)){const value=entry.ref.value;if(value!==''&&value!==false&&value!=null&&!['all','All'].includes(String(value)))next[key]=String(value);else delete next[key]}
    await router.replace({query:next})
  })
  watch(()=>route.query,value=>{
    syncing=true;page.value=number(value.page,1);pageSize.value=Math.min(100,number(value.size,25));search.value=String(value.q||'');sort.value=String(value.sort||'');
    for(const [key,entry]of Object.entries(filters))entry.ref.value=value[key]!=null?(typeof defaults[key]==='boolean'?value[key]==='true':typeof defaults[key]==='number'?Number(value[key]):String(value[key])):defaults[key]
    nextTick(()=>{syncing=false})
  })
  return {page,pageSize,sort,search,query}
}
