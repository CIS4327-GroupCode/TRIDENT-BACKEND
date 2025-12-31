# Vercel Deployment Guide

## Prerequisites
- Vercel account (https://vercel.com)
- Project connected to GitHub repository
- Database URL (Neon PostgreSQL or similar)

---

## Step-by-Step Deployment

### 1. **Project Setup in Vercel Dashboard**

#### Option A: Deploy via GitHub (Recommended)
1. Go to https://vercel.com/dashboard
2. Click "Add New..." → "Project"
3. Select your GitHub repository (CIS4327-GroupCode/TRIDENT-BACKEND)
4. Select the project root (framework will be auto-detected as "Other")
5. Leave build settings as default initially

#### Option B: Deploy via Vercel CLI
```bash
npm install -g vercel
vercel --prod
```

---

### 2. **Environment Variables Configuration** ⚠️ CRITICAL

Set these in Vercel Dashboard → Project Settings → Environment Variables:

| Variable | Value | Required | Notes |
|----------|-------|----------|-------|
| `DATABASE_URL` | `postgresql://...` | ✅ Yes | From Neon or your database provider |
| `NODE_ENV` | `production` | ✅ Yes | Must be set to production |
| `JWT_SECRET` | `<min-32-char-random-string>` | ✅ Yes | Use strong random value: `openssl rand -base64 32` |
| `REFRESH_TOKEN_SECRET` | `<min-32-char-random-string>` | ✅ Yes | Different from JWT_SECRET |
| `FRONTEND_URL` | `https://your-frontend.vercel.app` | ✅ Yes | No trailing slash |
| `PORT` | `5000` | ❌ No | Vercel auto-assigns; override if needed |
| `ACCESS_TOKEN_EXPIRES` | `15m` | ❌ No | Default: 15 minutes |
| `REFRESH_TOKEN_EXPIRES` | `7d` | ❌ No | Default: 7 days |

**⚠️ IMPORTANT: Set these for ALL environments (Production, Preview, Development)**

---

### 3. **Vercel Configuration Files**

#### vercel.json (Root: `/backend/vercel.json`)
- ✅ Already configured for serverless functions
- Includes routes for `/health`, `/api/*`, and catch-all
- Build command: `npm install && npm run migrate`
- Maxes lambda size: 50MB

#### package.json Build Script
```json
"build": "npm install && npm run migrate && echo 'Backend Built Successfully'"
```
- Runs migrations automatically during build
- Ensures database schema is up-to-date

---

### 4. **Database Migrations**

**During Deployment:**
1. Vercel runs: `npm run migrate` (from vercel.json buildCommand)
2. This executes: `sequelize-cli db:migrate`
3. Migrations in `src/database/migrations/` are applied

**To run migrations manually:**
```bash
# Locally
npm run db:migrate

# On Vercel (via CLI)
vercel env pull  # Pull environment variables locally
npm run db:migrate
```

**Verify migrations ran:**
```bash
vercel logs  # Check deployment logs
```

---

### 5. **Database Configuration (src/config/database.js)**

✅ Already optimized for Vercel:
- **Production pool settings:**
  - `max: 1` (single connection for serverless)
  - `idle: 10000` (10s timeout for idle connections)
  - `evict: 10000` (close idle connections faster)
- **SSL enabled** for cloud PostgreSQL (Neon, AWS RDS, etc.)
- **Connection timeout:** 10s
- **Keep-alive disabled** for serverless environment

---

### 6. **Critical Checks Before Deploying**

### ✅ Pre-Deployment Checklist

```
[ ] DATABASE_URL is set in Vercel environment variables
[ ] JWT_SECRET and REFRESH_TOKEN_SECRET are strong random strings (32+ chars)
[ ] FRONTEND_URL is set to your deployed frontend (no trailing slash)
[ ] NODE_ENV is set to "production"
[ ] vercel.json exists in /backend directory
[ ] package.json has "build" and "migrate" scripts
[ ] All migrations exist in src/database/migrations/
[ ] src/database/models/ includes all model definitions
[ ] .env file is in .gitignore (NOT committed to git)
[ ] No hardcoded secrets in code
[ ] All routes use /api/ prefix (for proper routing)
[ ] CORS configuration includes your frontend domain
```

---

### 7. **Deployment Troubleshooting**

#### Issue: `405 Method Not Allowed`
- **Cause:** Routes not properly configured
- **Fix:** Ensure vercel.json has all HTTP methods (GET, POST, PUT, DELETE, PATCH, OPTIONS)
- **Test:** `curl -X OPTIONS https://your-backend.vercel.app/api/auth/login`

#### Issue: `Database connection failed`
- **Cause:** DATABASE_URL missing or invalid
- **Check:** 
  ```bash
  vercel env list
  echo $DATABASE_URL  # Verify format
  ```
- **Format:** `postgresql://user:password@host:port/database?sslmode=require`

#### Issue: `401 Unauthorized / Missing JWT_SECRET`
- **Cause:** JWT_SECRET not set in environment
- **Fix:** Add to Vercel environment variables
- **Verify:** 
  ```bash
  vercel env pull
  grep JWT_SECRET .env
  ```

#### Issue: `CORS error: origin not allowed`
- **Cause:** FRONTEND_URL not set or incorrect
- **Check:** Matches your frontend deployment URL exactly (no trailing slash)
- **Test CORS:** 
  ```bash
  curl -H "Origin: https://your-frontend.vercel.app" \
       -H "Access-Control-Request-Method: POST" \
       -X OPTIONS https://your-backend.vercel.app/api/auth/login -v
  ```

#### Issue: `Migration error during build`
- **Cause:** Database unreachable during build or migrations failed
- **Check:** 
  - DATABASE_URL is valid and accessible from Vercel IP
  - All migrations are syntactically correct
  - Previous migrations completed successfully
- **Logs:** Check Vercel deployment logs for detailed errors

#### Issue: `Serverless function timeout (30s)`
- **Cause:** Request takes longer than 30 seconds
- **Fix:** Check database performance or break into async tasks
- **Note:** Can increase `maxDuration` in vercel.json to 60s (Pro plan required)

---

### 8. **Post-Deployment Verification**

#### Test health endpoint:
```bash
curl https://your-backend.vercel.app/health
# Response: { "status": "ok", "timestamp": "...", "environment": "production" }
```

#### Test login endpoint:
```bash
curl -X POST https://your-backend.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password"}'
```

#### Check logs:
```bash
vercel logs <function-url> --follow
```

---

### 9. **Common Configuration Issues**

| Issue | Solution |
|-------|----------|
| `.env` committed to git | Remove: `git rm --cached .env`, update .gitignore |
| Environment vars not loading | Ensure added to Vercel dashboard (not just .env file) |
| Trailing slash in FRONTEND_URL | Remove trailing `/` from URL |
| Database pool exhausted | Reduce pool.max in production config |
| Migrations not running | Ensure `npm run migrate` in buildCommand |
| Routes returning 404 | Check route paths use `/api/` prefix |
| CORS failures | Add `app.options('*', cors())` in index.js ✅ Already done |
| Serverless cold start slow | Normal; optimize with connection pooling |

---

### 10. **Node.js & Dependencies**

**Vercel defaults:**
- Node.js: Latest LTS (auto-detected)
- npm: Latest (auto-detected)

**Override (if needed) via .nvmrc:**
```
18.17.0
```

---

### 11. **Viewing Logs & Monitoring**

```bash
# Real-time logs
vercel logs <deployment-url> --follow

# List recent deployments
vercel list

# Show deployment details
vercel inspect <deployment-url>
```

---

## Quick Reference: Environment Setup

### Generate Secure Secrets (Run Locally):
```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate REFRESH_TOKEN_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Verify Environment Variables:
```bash
vercel env pull        # Downloads from Vercel
cat .env              # View all vars (don't commit!)
vercel env list       # Lists without values
```

---

## Success! 🎉

Your backend should now be deployed on Vercel. Next steps:
1. Test all API endpoints with your frontend
2. Monitor logs for errors: `vercel logs`
3. Set up monitoring/alerts in Vercel dashboard
4. Document any custom environment variables

For issues, check:
1. Vercel deployment logs
2. Database connectivity
3. Environment variables are set
4. CORS configuration
