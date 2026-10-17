// Synthetic, in-memory presentation fixtures. Never connects to Strapi or a database.
// Run explicitly with `node tests/fixtures/uiPreviewServer.mjs`.
import http from 'node:http'
const port = Number(process.env.UI_FIXTURE_PORT ?? 1339)
const receiptBills = new Map()
let delay = 0, fail = false, empty = false, scenario = 'normal'
const roles = ['student','aspiring-tenant','current-tenant','oas','admin']
const userFor = role => ({ id: role==='admin'?905:role==='oas'?904:role==='current-tenant'?903:role==='aspiring-tenant'?902:901, username: 'fixture-'+role, email: role+'@example.test', fullName: 'Preview '+role, confirmed:true, role:{id:1,name:role,type:role} })
const space = {id:1,documentId:'preview-space',name:'Campus Cafe',propertyCode:'PREVIEW-01',building:'CAFE HONORIO',floor:'Ground floor',space_status:'Occupied',businessName:'Preview Cafe',monthlyRent:5000,photos:[],tenantPhotos:[]}
const vacant = {...space,id:2,documentId:'preview-vacant',name:'Available campus stall',propertyCode:'PREVIEW-02',space_status:'Vacant'}
const tenancy = {id:1,documentId:'preview-tenancy',status:'Active',startDate:'2026-01-01',endDate:'2026-12-31',monthlyRent:5000,user:userFor('current-tenant'),propertySpace:space}
const bill = {id:1,documentId:'preview-bill',period:'2026-10',amount:5500,status:'For Verification',dueDate:'2026-10-20',tenancy,additionalCharges:0,electricCharge:300,waterCharge:200,createdAt:'2026-10-01T08:00:00Z'}
const application = {id:1,documentId:'preview-application',status:'For Review',propertySpace:vacant,user:userFor('aspiring-tenant'),message:'Sample application for UI verification.',createdAt:'2026-10-01T08:00:00Z'}
const ticket = {id:1,documentId:'preview-ticket',category:'Plumbing',description:'Sample maintenance issue for UI verification.',status:'Pending',priority:'Normal',tenancy,propertySpace:space,reporter:userFor('current-tenant'),createdAt:'2026-10-02T08:00:00Z',images:[]}
const log = {id:1,action:'user-login',entityLabel:'Preview OAS',description:'Sample sign-in',createdAt:'2026-10-10T08:00:00Z',actorUsername:'fixture-oas',actorRole:'oas'}
const expandedRecords = (record, count, prefix) => Array.from({length:count},(_,index)=>({...record,id:index+1,documentId:`${prefix}-${index+1}`}))
const richLogs = () => expandedRecords(log,8,'audit').map((entry,index)=>({...entry,action:index%2?'account-updated':'login-success',actorUsername:'campus-administrator-with-a-long-account-name',description:'Reviewed account access for the campus operations team and recorded the updated account details for the next reporting cycle.',createdAt:`2026-10-10T${String(8+index).padStart(2,'0')}:00:00Z`}))
const page = records => {
  const data = empty ? [] : records
  return {data,meta:{pagination:{page:1,pageSize:100,pageCount:data.length?1:0,total:data.length}}}
}
http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin',req.headers.origin??'http://localhost:3200');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
  const url=new URL(req.url,'http://localhost:1339'), path=url.pathname;
  const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data))}
  if(path==='/fixture/receipt.svg') {res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320"><rect width="240" height="320" fill="white"/><text x="16" y="32" fill="black">Synthetic QA receipt</text><text x="16" y="64" fill="black">PREVIEW-123</text></svg>');return}
  if(path==='/fixture/control'){delay=Math.min(5000,Math.max(0,Number(url.searchParams.get('delay')??0)));fail=url.searchParams.get('fail')==='true';empty=url.searchParams.get('empty')==='true';scenario=['normal','clear','rich','warning','partial'].includes(url.searchParams.get('scenario'))?url.searchParams.get('scenario'):'normal';send({delay,fail,empty,scenario});return}
  if(delay)await new Promise(r=>setTimeout(r,delay));
  if(fail && !path.startsWith('/api/auth')){send({error:{message:'Fixture request failure'}},503);return}
  const role=req.headers.authorization?.replace('Bearer fixture-','')??'guest';
  if(path==='/api/auth/login'){
    let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);
    const selected=roles.find(r=>input.identifier===r||input.identifier===r+'@example.test')??'student';
    if(input.password==='invalid'){send({error:{message:'Invalid identifier or password'}},400);return}
    send({jwt:'fixture-'+selected,user:userFor(selected)});return
  }
  if(path==='/api/auth/me'){send(userFor(role));return}
  if(path==='/api/upload'&&req.method==='POST') {for await(const chunk of req){};send([{id:100,url:'/fixture/receipt.svg',name:'Synthetic QA receipt'}]);return}
  if(path.startsWith('/api/bills/')&&req.method==='PUT') {
    let raw='';for await(const chunk of req)raw+=chunk
    const input=JSON.parse(raw).data, key=path.split('/').pop()
    const record={...(receiptBills.get(key)??{...bill,documentId:key}),...input}
    if(input.receipt) {record.receipt={id:100,url:'/fixture/receipt.svg',name:'Synthetic QA receipt'};record.orNumber='PREVIEW-123'}
    if(input.orNumber)record.status='For Verification'
    receiptBills.set(key,record);send({data:record});return
  }
  if(req.method!=='GET'){send({data:{...application,...bill,...ticket}});return}
  if(path==='/api/user-directory'){send(empty?[]:scenario==='rich'?Array.from({length:45},(_,index)=>({...userFor(roles[index%roles.length]),id:index+1,username:`preview-user-${index+1}`,blocked:index<3})):roles.map(userFor));return}
  if(path==='/api/roles'){send(empty?[]:roles.map(type=>({type,name:type,description:'Preview role',permissions:[]})));return}
  if(path==='/api/system/health'){send({uptime:scenario==='rich'?1234567:7200,startedAt:'2026-10-10T00:00:00Z',memory:{total:8000000000,free:4000000000,used:4000000000},disk:{ok:scenario!=='warning',total:100000000000,free:50000000000,used:50000000000},database:{ok:scenario!=='warning',latency:scenario==='warning'?null:4,client:'sqlite'},logins:{failed24h:empty||scenario==='clear'?0:scenario==='rich'?12:2,failed7d:4,failedTotal:4,recentFailed:empty||scenario==='clear'?[]:[log],recentLogins:empty?[]:scenario==='rich'?richLogs():[log]},errors:{total:scenario==='rich'||scenario==='clear'?24:0,recent:scenario==='rich'?richLogs():[]},now:'2026-10-10T08:00:00Z'});return}
  if(path==='/api/system/backups'){send({backups:[]});return}
  if(path==='/api/system/backups/settings'){send({enabled:false,scheduleCron:'0 2 * * *',retentionDays:7,backupDir:'Synthetic preview'});return}
  if(path==='/api/system-settings'){send({data:{systemName:'iMapSU',systemStatus:'operational',passwordMinLength:8,passwordRequireUppercase:true,passwordRequireNumber:true,passwordRequireSymbol:true,accountLockoutThreshold:5,accountLockoutWindowMinutes:15,accountLockoutDurationMinutes:30,uploadMaxFileMb:10,notificationEmailEnabled:false,backupsEnabled:false,backupScheduleCron:'0 2 * * *',backupRetentionDays:7}});return}
  if(path==='/api/properties/active-tenants'){send(page([{propertyDocumentId:space.documentId,tenantName:'Preview Tenant'}]));return}
  if(path==='/api/properties'||path==='/api/property-spaces'){send(page(role==='student'?[space]:[space,vacant]));return}
  if(path==='/api/tenancies'){const endDate=new Date(Date.now()+14*86400000).toISOString().slice(0,10);send(page(scenario==='rich'?expandedRecords({...tenancy,endDate,user:{...tenancy.user,username:'Campus-tenant-with-a-long-business-account-name'},propertySpace:{...space,name:'Campus food and student service concession with a long property name'}},7,'tenancy'):[tenancy]));return}
  if(path==='/api/bills'){send(page((scenario==='clear'?[{...bill,status:'Verified'}]:scenario==='partial'?[]:scenario==='rich'?expandedRecords({...bill,amount:123456789,status:'Overdue',dueDate:'2026-09-20',tenancy:{...tenancy,propertySpace:{...space,name:'Campus food and student service concession with a long property name'}}},6,'bill').map((entry,index)=>({...entry,status:index<2?'For Verification':index===5?'Verified':'Overdue',tenancy:{...entry.tenancy,user:{username:`fixture-tenant-${index+1}`}}})):[bill,{...bill,id:2,documentId:'preview-overdue',status:'Overdue',period:'2026-09',dueDate:'2026-09-20'}]).map(record=>receiptBills.get(record.documentId)??record)));return}
  if(path==='/api/rental-applications'){send(page(scenario==='clear'?[{...application,status:'Approved'}]:scenario==='rich'?expandedRecords(application,18,'application'):[application]));return}
  if(path==='/api/maintenance-tickets'){send(page(scenario==='clear'||scenario==='partial'?[{...ticket,status:'Completed'}]:scenario==='rich'?expandedRecords(ticket,7,'ticket'):[ticket]));return}
  if(path==='/api/audit-logs'){send(page(scenario==='rich'?richLogs():[log]));return}
  if(path==='/api/announcements'){send(page([{id:1,documentId:'preview-announcement',title:'Campus office hours',body:'Sample announcement for UI verification.',content:'Sample announcement for UI verification.',audience:'Everyone',pinned:true,publishedAt:'2026-10-10T08:00:00Z',createdAt:'2026-10-10T08:00:00Z'}]));return}
  if(path==='/api/feedbacks'){const feedback={id:1,documentId:'preview-feedback',rating:4,comment:'Preview feedback',propertySpace:space,user:userFor('student'),createdAt:'2026-10-01T08:00:00Z',staffAction:scenario==='clear'||scenario==='partial'?'Reviewed':null};send(page(scenario==='rich'?expandedRecords(feedback,9,'feedback'):[feedback]));return}
  send(page([]))
}).listen(port,'127.0.0.1',()=>console.log(`UI fixture API at 127.0.0.1:${port}; in-memory only.`))
