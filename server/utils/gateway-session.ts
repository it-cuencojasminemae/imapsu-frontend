import { useSession, createError, type H3Event } from 'h3'

export const SESSION_NAME = 'imapsu_session'

export const gatewaySessionConfig = (event: H3Event) => {
  const config = useRuntimeConfig(event)
  return {name:SESSION_NAME,password:String(config.sessionPassword),maxAge:604800,sessionHeader:false as const,cookie:{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'}}
}

export const gatewaySession = (event: H3Event) => useSession<any>(event, gatewaySessionConfig(event))

// Rotates the refresh token once the short-lived access token has lapsed.
// Returns 'fresh' when nothing changed, 'refreshed' after a rotation and
// 'ended' when the server no longer accepts the session.
export async function refreshGatewaySession(event: H3Event, session: Awaited<ReturnType<typeof gatewaySession>>, headers: Record<string,string>): Promise<'fresh'|'refreshed'|'ended'> {
  const tokenExpired=session.data.accessExpiresAt && session.data.accessExpiresAt<Date.now()
  if(!session.data.refreshToken||(session.data.jwt&&!tokenExpired)) return 'fresh'
  const base=String(useRuntimeConfig(event).strapiInternalUrl).replace(/\/$/,'')
  let response:Response
  try {response=await fetch(base+'/api/auth/session/refresh',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({refreshToken:session.data.refreshToken})})}catch{throw createError({statusCode:503,statusMessage:'Service unavailable. Please retry.'})}
  if(response.status===401){await session.clear();return 'ended'}
  if(!response.ok)throw createError({statusCode:503,statusMessage:'Session refresh unavailable. Please retry.'})
  const tokens=await response.json();await session.update({jwt:tokens.jwt,refreshToken:tokens.refreshToken,accessExpiresAt:Date.now()+540000})
  return 'refreshed'
}
