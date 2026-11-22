# PostgreSQL backup and restore

## Backup

Configure `pg_dump` with an environment-provided connection string and run it daily:

```bash
pg_dump "$DATABASE_URL" --format=custom --file="/backup/thanhson-store-$(date +%F).dump"
```

Retain daily backups for at least 30 days and longer according to legal/accounting policy. Encrypt backups at rest and test them outside production.

## Restore

Create a clean database, restore, verify counts and a representative order, then start the application:

```bash
createdb thanhson_store_restore
pg_restore --clean --if-exists --dbname=thanhson_store_restore /backup/backup.dump
```
