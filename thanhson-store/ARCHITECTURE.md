# Architecture

## Runtime

- Express HTTP server
- EJS server-rendered views
- Session-based authentication
- JSON development storage
- PostgreSQL migration and runtime configuration for production

## Key directories

- `server/routes`: HTTP routes
- `server/services`: application services
- `server/middleware`: security and view helpers
- `server/lib`: JSON and PostgreSQL infrastructure
- `data`: local development records
- `migrations`: PostgreSQL schema migrations
- `views` and `public`: UI

## Request flow

Browser requests pass through security headers, origin validation, rate limiting, and sessions before routes. Checkout and cart APIs recalculate data from product records and validate quantities; browser-submitted prices are not trusted.
