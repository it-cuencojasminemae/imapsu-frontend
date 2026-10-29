# Local environment configuration

Create a `.env` file in this repository root using the settings below. Environment files are deliberately excluded from this repository. Set every required secret before starting. Generate independent cryptographic secrets with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Use the same value for backend `GATEWAY_SECRET` and frontend `NUXT_GATEWAY_SECRET`; use separate values for the other secrets. Set `APP_KEYS` to multiple comma-separated generated values.

```dotenv
NUXT_STRAPI_INTERNAL_URL=http://localhost:1337
NUXT_APP_ORIGIN=http://localhost:3000
# Must match backend GATEWAY_SECRET; never expose through NUXT_PUBLIC_*.
NUXT_GATEWAY_SECRET=
# At least 32 random bytes; changing this signs out existing sessions.
NUXT_SESSION_PASSWORD=
# Comma separated addresses/CIDRs of the actual reverse proxies; empty trusts none. Use `vercel` only on Vercel.
NUXT_TRUSTED_PROXIES=

```

Configure SMTP with your own credentials and configure your database separately. Databases, uploads, backups, existing users, and private files are not included.

## Production (Vercel)

1. In Vercel, **Add New → Project** and import the `imapsu-frontend` repository. The Nuxt framework preset is detected automatically; keep the default build command, output settings and root directory. Node 22 comes from `engines` in `package.json`.
2. Before the first deploy, open **Settings → Functions** and set the Function region to **Singapore (`sin1`)**, next to the Render backend and Neon database. Every API call passes through the server function, so a distant region adds latency to every request.
3. Run the backend's `scripts/deploy-env.cjs`. It writes `frontend/.env.vercel`. In **Settings → Environment Variables**, import that file (or paste its whole contents into the first Key field) and scope the variables to **Production** only. Check these values:

   ```dotenv
   NUXT_STRAPI_INTERNAL_URL=https://<backend>.onrender.com
   NUXT_APP_ORIGIN=https://<project>.vercel.app
   NUXT_GATEWAY_SECRET=        # same value as the backend GATEWAY_SECRET
   NUXT_SESSION_PASSWORD=      # at least 32 random bytes
   NUXT_TRUSTED_PROXIES=vercel
   ```

   `NUXT_STRAPI_INTERNAL_URL` is the backend's public Render URL; the gateway secret is what stops anyone else from using it. `NUXT_TRUSTED_PROXIES=vercel` makes the gateway take the visitor address from `x-vercel-forwarded-for`, falling back to `x-real-ip`. Vercel's edge overwrites both headers, so visitors cannot spoof them, and login rate limits apply per visitor. Do not use `vercel` on any other host.
4. Redeploy after changing variables. If you add a custom domain, set `NUXT_APP_ORIGIN` to it (comma separate several origins) and redeploy.

**Upload limit.** Vercel rejects function request bodies over 4.5 MB. The app downsizes large photos in the browser (longest edge 2560 px) and sends multi-file uploads in batches under 4 MB. Any single file still over 4 MB, such as a large PDF, is refused with a message asking for a smaller file. Database dumps uploaded on the Backups page must also be under 4 MB. Restore larger dumps with the **Restore** action on a stored backup, which the backend reads from storage directly.

**Preview deployments** get their own `*.vercel.app` URLs, which do not match `NUXT_APP_ORIGIN`. The gateway therefore rejects every sign-in and other mutation there with "Request origin or verification token is invalid". Keep the variables scoped to Production and use previews only to check pages that do not change data.
