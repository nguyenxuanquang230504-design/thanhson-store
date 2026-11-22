# Final Engineering Report

## Original architecture assessment

- **VERIFIED:** Express 4, EJS, session cart/wishlist, JSON product/user/order storage, catalog, search, checkout, account login/register, VietQR transfer URL.
- **BROKEN:** Node/npm were unavailable on the current PATH, so runtime verification could not be executed here.
- **BROKEN/INCOMPLETE:** Plaintext legacy password storage, no production secret requirement, weak checkout validation, no server-side stock reconciliation, no CSRF/origin protection, no PostgreSQL runtime, no admin dashboard, no R2 adapter, and no automated test suite.

## Implemented in this pass

- Secure bcrypt password hashing for registration and automatic legacy-password migration.
- HttpOnly/SameSite sessions, secure production cookies, security headers, origin checks, and rate limiting.
- Server-side cart and checkout quantity validation.
- Vietnamese phone and registration validation.
- Stock fields and insufficient-stock responses.
- Checkout idempotency key support.
- PostgreSQL schema migration and environment configuration.
- Local JSON fallback for development.
- Environment example and production, database, backup, architecture, security, and API documentation.
- Repository tests.

## Verified

- Source-level review of routes and storage.
- Product JSON contains category and stock data.
- Migration file structure and core table definitions.

## Partially verified

- PostgreSQL readiness: schema and migration runner are present, but no PostgreSQL credential or server was available.
- Password migration: implementation is present, but bcrypt runtime dependency could not be installed because Node/npm is unavailable.
- Security middleware: implementation is present, but browser and HTTP tests could not run.

## Not verified

- Live server startup and HTTP/E2E workflows.
- Database connectivity and migrations against PostgreSQL.
- R2 uploads and signed delivery.
- Admin product/order/customer management.
- Backup restoration.
- Redis-backed multi-instance rate limiting.
- Production deployment.

## Remaining limitations

1. PostgreSQL service code is migration-first; application services still use JSON unless production code is completed around `DATABASE_URL`.
2. No admin interface or role middleware exists.
3. Inventory is represented in product JSON and is not transactionally reconciled in PostgreSQL.
4. R2 object storage is not implemented.
5. Existing legacy plaintext credentials should be invalidated or migrated before production.

## Deployment instructions

See [README.md](README.md), [DEPLOYMENT.md](DEPLOYMENT.md), [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md), and [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md).
