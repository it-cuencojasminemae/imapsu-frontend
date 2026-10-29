import { defineEventHandler, getCookie, getHeader, getRequestIP, getRequestURL, sealSession } from 'h3'
import { trustedClientIP } from '../utils/trusted-proxy'
import { SESSION_NAME, gatewaySession, gatewaySessionConfig, refreshGatewaySession } from '../utils/gateway-session'

// Server-rendered pages call the API through internal requests whose cookies
// never reach the browser. Rotate an expired session here, on the page request
// itself, so the browser receives the new refresh token and the internal calls
// reuse it instead of each rotating a token the browser will never see.
export default defineEventHandler(async event => {
  if(event.method!=='GET'||!getCookie(event,SESSION_NAME))return
  const path=getRequestURL(event).pathname
  if(path.startsWith('/api/')||path.startsWith('/_')||/\.[a-z0-9]+$/i.test(path)||!String(getHeader(event,'accept')||'').includes('text/html'))return
  const config=useRuntimeConfig(event)
  if(!config.sessionPassword||String(config.sessionPassword).length<32||!config.gatewaySecret)return
  const session=await gatewaySession(event)
  const headers={'x-imapsu-gateway':String(config.gatewaySecret),'x-imapsu-client-ip':trustedClientIP(getRequestIP(event,{xForwardedFor:false})||'', getHeader(event,'x-forwarded-for')||'', String(config.trustedProxies),{vercelForwardedFor:getHeader(event,'x-vercel-forwarded-for'),realIP:getHeader(event,'x-real-ip')})}
  let outcome
  // An unavailable refresh is reported by the page's own API calls.
  try {outcome=await refreshGatewaySession(event,session,headers)}catch{return}
  if(outcome==='fresh')return
  const sealed=outcome==='refreshed'?await sealSession(event,gatewaySessionConfig(event)):''
  const others=String(event.node.req.headers.cookie||'').split(';').map(part=>part.trim()).filter(part=>part&&!part.startsWith(SESSION_NAME+'='))
  event.node.req.headers.cookie=[...others,...(sealed?[SESSION_NAME+'='+sealed]:[])].join('; ')
})
