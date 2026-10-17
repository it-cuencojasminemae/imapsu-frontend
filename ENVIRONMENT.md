# Local environment configuration

Create a `.env` file in this repository root using the settings below. Environment files are deliberately excluded from this repository. Set every required secret before starting. Generate independent cryptographic secrets with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Use the same value for backend `GATEWAY_SECRET` and frontend `NUXT_GATEWAY_SECRET`; use separate values for the other secrets. Set `APP_KEYS` to multiple comma-separated generated values.

```dotenv
NUXT_STRAPI_INTERNAL_URL=http://localhost:1337
NUXT_APP_ORIGIN=http://localhost:3000
# Must match backend GATEWAY_SECRET; never expose through NUXT_PUBLIC_*.
NUXT_GATEWAY_SECRET=
# At least 32 random bytes; changing this signs out existing sessions.
NUXT_SESSION_PASSWORD=
# Comma separated addresses/CIDRs of the actual reverse proxies; empty trusts none.
NUXT_TRUSTED_PROXIES=

```

Configure SMTP with your own credentials and configure your database separately. Databases, uploads, backups, existing users, and private files are not included.
