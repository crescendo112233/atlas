# TOOP & PP'S ATLAS — Alibaba Cloud edition

This branch runs the existing atlas UI on standard Next.js/Node.js and replaces the original Cloudflare bindings with:

- Alibaba Cloud RDS for PostgreSQL for places and photo metadata.
- Alibaba Cloud OSS for private photo objects.
- Docker Compose on an ECS instance.
- Nginx as the public reverse proxy.

The production site currently published on `chatgpt.site` is not changed by this migration branch.

## Local validation

```bash
corepack enable
pnpm install
pnpm build
node --test tests/rendered-html.test.mjs
```

Copy `.env.example` to `.env` only on the target machine and replace every placeholder there. Never commit `.env`, database passwords, or AccessKeys.

## Database

The container runs the idempotent PostgreSQL migration before starting Next.js. It can also be run manually:

```bash
pnpm db:migrate
pnpm db:check
```

## Production

See [ALIYUN_DEPLOY.md](./ALIYUN_DEPLOY.md) for the exact ECS, RDS, OSS, Docker, Nginx, DNS, and HTTPS procedure.
