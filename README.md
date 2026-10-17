# iMapSU Frontend

Nuxt 4 application and server-side API gateway.

This repository contains a snapshot of the current frontend source, including local source changes, without the original repository history, environment files, or private runtime data.

## Setup

Clone both repositories into sibling directories named `frontend` and `backend` so the optional cross-project security scripts retain their existing paths:

```sh
git clone https://github.com/it-cuencojasminemae/imapsu-frontend.git frontend
git clone https://github.com/it-cuencojasminemae/imapsu-server.git backend
cd frontend
npm ci
```

Create and configure a local `.env` using [ENVIRONMENT.md](ENVIRONMENT.md), then run `npm run dev`. The frontend defaults to http://localhost:3000 and the backend to http://localhost:1337. Run `npm test` for unit tests and `npm run build` for a production build. Preview a production build with `npm run preview`.

The applications communicate through configured URLs and the shared gateway secret; GitHub repository names do not determine the connection. For deployment, set frontend `NUXT_STRAPI_INTERNAL_URL` to the backend address and align frontend `NUXT_APP_ORIGIN` with backend `FRONTEND_URL`. Configure new secrets and persistent database/private storage in the hosting environment.

The frontend runtime can be hosted separately from the backend. The optional backend environment helper and gateway integration test expect the sibling directory layout above. Browser test evidence is written to a sibling `docs` directory.

Pushing this snapshot does not deploy the application, copy existing data, or update the original repository.
