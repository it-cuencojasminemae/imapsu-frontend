import { randomBytes, timingSafeEqual } from 'node:crypto'
import { Readable } from 'node:stream'
import { trustedClientIP } from '../utils/trusted-proxy'
import { gatewaySession, refreshGatewaySession } from '../utils/gateway-session'
import { defineEventHandler, getRequestURL, getHeader, getRequestIP, readBody, setHeader, setResponseStatus, sendStream, createError, deleteCookie } from 'h3'

const allowed = new Set(['auth','property-spaces','properties','tenancies','bills','rental-applications','renewal-intents','maintenance-tickets','feedbacks','meter-readings','announcements','announcement-acknowledgments','notifications','map-labels','map-zones','status-histories','audit-logs','system-settings','system','roles','user-directory','users','upload','media','dashboard'])
const equal = (a: string,b: string) => { const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y) }
export default defineEventHandler(async event => {
  const config=useRuntimeConfig(event)
  deleteCookie(event,'strapi_token',{path:'/'})
  if (!config.sessionPassword || String(config.sessionPassword).length<32 || !config.gatewaySecret) throw createError({statusCode:503,statusMessage:'Secure gateway is not configured'})
  const url=getRequestURL(event), route=url.pathname.replace(/\/+$/, '')
  const publicAuthentication=new Set(['/api/auth/login','/api/auth/local','/api/auth/register-with-role','/api/auth/confirm-email','/api/auth/resend-confirmation','/api/auth/mfa/challenge','/api/auth/password-recovery/request','/api/auth/password-recovery/verify','/api/auth/password-recovery/reset']).has(route)
  const parts=route.slice(5).split('/')
  if(!allowed.has(parts[0]!) || parts.some(p=>p==='.'||p==='..'||/%2f|%5c/i.test(p))) throw createError({statusCode:404})
  const session=await gatewaySession(event)
  setHeader(event,'Cache-Control','private, no-store')
  if(route==='/api/auth/csrf'){
    if(event.method!=='GET')throw createError({statusCode:405,statusMessage:'Use GET to request a verification token'})
    if(!session.data.csrf) await session.update({csrf:randomBytes(32).toString('hex')})
    return {token:session.data.csrf}
  }
  if(route==='/api/auth/me' && !session.data.refreshToken) throw createError({statusCode:401,statusMessage:'Sign in to access your account'})
  const method=event.method
  if(!['GET','HEAD','OPTIONS'].includes(method)){
    const expected=String(config.appOrigin).split(',')
    const origin=getHeader(event,'origin')||''
    if(!expected.includes(origin)||!equal(getHeader(event,'x-csrf-token')||'',session.data.csrf||'')||!session.data.csrf) throw createError({statusCode:403,statusMessage:'Request origin or verification token is invalid'})
  }
  if(getHeader(event,'authorization')) throw createError({statusCode:400,statusMessage:'Browser authorization headers are not supported'})
  const base=String(config.strapiInternalUrl).replace(/\/$/,'')
  const headers:Record<string,string>={'x-imapsu-gateway':String(config.gatewaySecret),'x-imapsu-client-ip':trustedClientIP(getRequestIP(event,{xForwardedFor:false})||'', getHeader(event,'x-forwarded-for')||'', String(config.trustedProxies),{vercelForwardedFor:getHeader(event,'x-vercel-forwarded-for'),realIP:getHeader(event,'x-real-ip')})}
  const contentType=getHeader(event,'content-type')
  if(contentType) headers['content-type']=contentType
  if(route==='/api/system/backups/restore') for(const name of ['x-backup-name','x-restore-confirm','x-backup-source']){const value=getHeader(event,name);if(value)headers[name]=value}
  const upstream=async(path:string,body:any,authorization?:string)=>{
    const h={...headers,...(authorization?{authorization:'Bearer '+authorization}:{})}
    return fetch(base+path,{method,headers:h,body,redirect:'manual',...(body&&typeof body.pipe==='function'?{duplex:'half' as any}:{})})
  }
  if(route==='/api/auth/logout'){
    if(method!=='POST')throw createError({statusCode:405,statusMessage:'Use POST to sign out'})
    try {const response=await fetch(base+route,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({refreshToken:session.data.refreshToken})});if(!response.ok)throw new Error()}catch{throw createError({statusCode:503,statusMessage:'Sign-out unavailable. Please retry.'})}
    await session.clear()
    return {ok:true}
  }
  let body:any
  const json=!['GET','HEAD'].includes(method)&&(!contentType||contentType.includes('application/json'))
  if(json){body=await readBody(event);if(route==='/api/auth/mfa/challenge')body={...body,challengeToken:session.data.challengeToken};body=JSON.stringify(body||{})}
  else if(!['GET','HEAD'].includes(method))body=event.node.req
  if(!publicAuthentication&&await refreshGatewaySession(event,session,headers)==='ended')throw createError({statusCode:401,statusMessage:'Sign in again'})
  let response:Response
  try {response=await upstream(route+url.search,body,publicAuthentication?undefined:session.data.jwt)}catch{throw createError({statusCode:503,statusMessage:'Service unavailable. Please retry.'})}
  setResponseStatus(event,response.status)
  const retry=response.headers.get('retry-after');if(retry)setHeader(event,'Retry-After',retry)
  const type=response.headers.get('content-type')||''
  if(type.includes('application/json')){
    const result=await response.json()
    if(Boolean(result.jwt)!==Boolean(result.refreshToken))throw createError({statusCode:503,statusMessage:'Authentication service returned an incomplete session. Please retry.'})
    if(response.status===401 || (response.ok && route==='/api/auth/account' && json && JSON.parse(body||'{}').newPassword)) await session.clear()
    if(result.jwt&&result.refreshToken){await session.update({jwt:result.jwt,refreshToken:result.refreshToken,accessExpiresAt:Date.now()+540000,challengeToken:null});delete result.jwt;delete result.refreshToken}
    if(result.challengeToken){await session.update({challengeToken:result.challengeToken,jwt:null,refreshToken:null});delete result.challengeToken}
    return result
  }
  for(const name of ['content-type','content-disposition','x-content-type-options','content-security-policy']){const value=response.headers.get(name);if(value)setHeader(event,name,value)}
  if(response.body)return sendStream(event,Readable.fromWeb(response.body as any))
  return null
})
