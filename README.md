# iMapSU — Frontend (Nuxt 3)

Interactive 3D campus map, dashboards, billing, applications, and announcements for
iMapSU. It talks to the Strapi backend in
[imapsu-server](https://github.com/it-cuencojasminemae/imapsu-server), which holds the
**full setup guide**: clone both repositories side by side, then follow it.

```bash
mkdir imapsu
cd imapsu
git clone https://github.com/it-cuencojasminemae/imapsu-server.git backend
git clone https://github.com/it-cuencojasminemae/imapsu-frontend.git frontend
```

## Quick reference

`frontend/.env` is created by the backend's `node scripts/setup-security-env.cjs`
(see [ENVIRONMENT.md](ENVIRONMENT.md) for every setting). Its `NUXT_GATEWAY_SECRET`
must match the backend's `GATEWAY_SECRET`, or every API request is rejected.

```bash
npm install
npm run dev        # http://localhost:3000 (start the backend first)
npm test
npm run build      # production build in .output/
```
