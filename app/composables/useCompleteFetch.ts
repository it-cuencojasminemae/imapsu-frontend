// Complete dependent datasets (selectors and acknowledgment joins) without exceeding API limits.
export const useCompleteFetch = <T>(path: any, options: any = {}) => {
  const request=useRequestFetch()
  return useAsyncData<T>('complete:'+String(toValue(path))+':'+JSON.stringify(options.query||{}),async()=>{
    const url=toValue(path)
    if(!url)return null as T
    let page=1, pageCount=1, all:any[]=[], last:any
    do{
      const query={...toValue(options.query),'pagination[page]':page,'pagination[pageSize]':100}
      delete query.pagination
      last=await request<any>(url,{...options,baseURL:'',query})
      if(!Array.isArray(last.data)||!last.meta?.pagination)throw new Error('Complete record pagination is unavailable')
      all.push(...last.data);pageCount=last.meta.pagination.pageCount;page++
    }while(page<=pageCount)
    return {...last,data:all,meta:{...last.meta,pagination:{...last.meta.pagination,total:all.length}}} as T
  },{watch:options.watch||[],...options})
}
