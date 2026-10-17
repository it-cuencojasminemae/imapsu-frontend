import { defineEventHandler, setHeader, getRequestURL } from 'h3'
export default defineEventHandler(event => {
  setHeader(event,'X-Content-Type-Options','nosniff')
  setHeader(event,'Referrer-Policy','same-origin')
  setHeader(event,'X-Frame-Options','DENY')
  setHeader(event,'Permissions-Policy','camera=(), microphone=(), geolocation=()')
  setHeader(event,'Content-Security-Policy',"frame-ancestors 'none'; object-src 'none'; base-uri 'self'")
  if(process.env.NODE_ENV==='production' && getRequestURL(event).protocol==='https:')setHeader(event,'Strict-Transport-Security','max-age=31536000')
})
