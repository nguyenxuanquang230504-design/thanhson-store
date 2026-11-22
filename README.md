# Thanh Sơn Store

Node.js/Express/EJS clothing store.

## Requirements

- Node.js 20+
- PostgreSQL 14+ for production
- npm

## Local development

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000`.

The application uses JSON persistence only when `DATABASE_URL` is unset. JSON storage is for development and is not suitable for concurrent production workloads.

## Production database

Set `DATABASE_URL`, `SESSION_SECRET`, and `NODE_ENV=production`, then run:

```bash
npm run migrate
npm start
```

For VPS deployment, place Node.js behind Nginx/Caddy with HTTPS and PostgreSQL daily backups.
