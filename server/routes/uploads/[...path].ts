import { Readable } from 'node:stream'
import { defineEventHandler, getRequestURL, createError, setHeader, setResponseStatus, sendStream } from 'h3'
export default defineEventHandler(async event => {
  if(!['GET','HEAD'].includes(event.method))throw createError({statusCode:405})
  const pathname=getRequestURL(event).pathname
  if(!/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(pathname))throw createError({statusCode:404})
  const config=useRuntimeConfig(event)
  const response=await fetch(String(config.strapiInternalUrl).replace(/\/$/,'')+pathname,{method:event.method,redirect:'manual'})
  setResponseStatus(event,response.status)
  const type=response.headers.get('content-type');if(type)setHeader(event,'Content-Type',type)
  setHeader(event,'X-Content-Type-Options','nosniff')
  setHeader(event,'Content-Security-Policy',"sandbox; default-src 'none'")
  setHeader(event,'Cache-Control','no-store')
  if(response.body)return sendStream(event,Readable.fromWeb(response.body as any))
})
