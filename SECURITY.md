# Security

## Implemented

- Passwords are bcrypt-hashed for new accounts and migrated to bcrypt after legacy plaintext login.
- Sessions use HttpOnly/SameSite cookies and secure cookies in production.
- Production refuses to start without `SESSION_SECRET`.
- Security headers and basic in-memory rate limiting are enabled.
- Cross-origin mutations are rejected.
- Registration and checkout inputs are validated.
- Cart quantities are bounded.
- Server-side prices and checkout totals are used.
- Checkout supports Idempotency-Key to prevent duplicate submissions.

## Production requirements

- Use HTTPS and a reverse proxy.
- Rotate `SESSION_SECRET` carefully.
- Restrict PostgreSQL network access.
- Provision R2 credentials only through environment variables.
- Do not store secrets in source control or logs.
- Replace the basic in-memory limiter with Redis or reverse-proxy rate limiting for multiple instances.
