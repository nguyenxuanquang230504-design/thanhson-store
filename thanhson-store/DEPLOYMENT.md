# Deployment

## VPS

1. Install Node.js 20+, PostgreSQL 14+, and Nginx/Caddy.
2. Copy the repository and configure environment variables.
3. Create the database and run `npm run migrate`.
4. Start with a process manager: `NODE_ENV=production npm start`.
5. Configure HTTPS and proxy `/` to port 3000.
6. Configure firewall access and PostgreSQL network restrictions.
7. Schedule database backups and restoration tests.

Environment variables are documented in `.env.example`.
