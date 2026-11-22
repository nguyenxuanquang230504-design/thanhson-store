# Database schema

The PostgreSQL schema is defined in `migrations/001_initial.sql`.

It includes customers, addresses, categories, products, variants, images, orders, order items, inventory transactions, promotions, admin users, and audit logs. Foreign keys, uniqueness constraints, stock checks, indexes, timestamps, and status fields are included.

Run migrations with `npm run migrate`.

Local development can use `data/*.json`, but it does not implement transactions or safe concurrent updates.
