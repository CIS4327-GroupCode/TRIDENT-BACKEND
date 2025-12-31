# ✅ VERCEL DEPLOYMENT CHECKLIST

**Project:** TRIDENT-BACKEND  
**Date:** December 10, 2025  
**Status:** Ready for Deployment

---

## PRE-DEPLOYMENT PHASE (Before Pushing Code)

### Step 1: Generate Secure Secrets
Run in terminal (on your local machine):
```bash
node -e "console.log('JWT_SECRET: ' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('REFRESH_TOKEN_SECRET: ' + require('crypto').randomBytes(32).toString('hex'))"
```

Save the outputs - you'll need them in Vercel.

**Checklist:**
- [ ] JWT_SECRET generated (copy the output)
- [ ] REFRESH_TOKEN_SECRET generated (copy the output)
- [ ] Both are at least 32 characters
- [ ] They are DIFFERENT from each other

---

### Step 2: Verify Database Information
Gather these from your database provider (Neon, AWS, etc):

- [ ] Full database URL
- [ ] Format: `postgresql://user:password@host:port/database`
- [ ] SSL support confirmed
- [ ] Database is online and accessible

**Example for Neon:**
```
postgresql://user:password@host.neon.tech/database?sslmode=require
```

---

### Step 3: Frontend Information
- [ ] Frontend deployment URL noted
- [ ] **NO TRAILING SLASH** (important!)
- [ ] Example: `https://trident-frontend-livid.vercel.app`

---

### Step 4: Test Locally
Run these commands:

```bash
cd backend
npm install
npm run dev
```

**Checklist:**
- [ ] No errors during `npm install`
- [ ] Server starts with `npm run dev`
- [ ] Health endpoint works: `curl http://localhost:5000/health`
- [ ] Database connection successful (check console)
- [ ] No error messages about missing variables

---

## VERCEL DASHBOARD SETUP

### Step 5: Create Vercel Project
Go to https://vercel.com/dashboard

**Checklist:**
- [ ] GitHub account connected
- [ ] Repository imported: CIS4327-GroupCode/TRIDENT-BACKEND
- [ ] Root directory set to: `/backend`
- [ ] Framework: "Other"
- [ ] DO NOT modify build commands

---

### Step 6: Add Environment Variables ⚠️ CRITICAL

**In Vercel Dashboard → Settings → Environment Variables**

Add each variable **for all three environments**:
(Production, Preview, Development)

#### Variable 1: DATABASE_URL
```
Name: DATABASE_URL
Value: postgresql://user:password@host:port/database
Environments: ✓ Production ✓ Preview ✓ Development
```
- [ ] DATABASE_URL added to Production
- [ ] DATABASE_URL added to Preview
- [ ] DATABASE_URL added to Development
- [ ] Format verified (postgresql://...)

#### Variable 2: JWT_SECRET
```
Name: JWT_SECRET
Value: [Paste the generated secret from Step 1]
Environments: ✓ Production ✓ Preview ✓ Development
```
- [ ] JWT_SECRET added to Production
- [ ] JWT_SECRET added to Preview
- [ ] JWT_SECRET added to Development
- [ ] 32+ characters confirmed

#### Variable 3: REFRESH_TOKEN_SECRET
```
Name: REFRESH_TOKEN_SECRET
Value: [Paste the generated secret from Step 1]
Environments: ✓ Production ✓ Preview ✓ Development
```
- [ ] REFRESH_TOKEN_SECRET added to Production
- [ ] REFRESH_TOKEN_SECRET added to Preview
- [ ] REFRESH_TOKEN_SECRET added to Development
- [ ] Different from JWT_SECRET

#### Variable 4: FRONTEND_URL
```
Name: FRONTEND_URL
Value: https://your-frontend.vercel.app
Environments: ✓ Production ✓ Preview ✓ Development
```
- [ ] FRONTEND_URL added to Production
- [ ] FRONTEND_URL added to Preview
- [ ] FRONTEND_URL added to Development
- [ ] NO TRAILING SLASH
- [ ] Format: https://domain.com (not https://domain.com/)

#### Variable 5: NODE_ENV
```
Name: NODE_ENV
Value: production
Environments: ✓ Production ✓ Preview ✓ Development
```
- [ ] NODE_ENV added to Production
- [ ] NODE_ENV added to Preview
- [ ] NODE_ENV added to Development
- [ ] Value is exactly "production"

---

### Step 7: Verify Environment Variables
```bash
# From Vercel CLI
vercel env list
```

**Checklist:**
- [ ] DATABASE_URL listed
- [ ] JWT_SECRET listed
- [ ] REFRESH_TOKEN_SECRET listed
- [ ] FRONTEND_URL listed
- [ ] NODE_ENV listed

---

## DEPLOYMENT PHASE

### Step 8: Deploy to Vercel

**Option A: GitHub Auto-Deploy (Recommended)**
```bash
git add .
git commit -m "Configure for Vercel deployment"
git push origin main
```

**Option B: Vercel CLI**
```bash
npm install -g vercel
vercel --prod
```

**Checklist:**
- [ ] Code pushed/deployment started
- [ ] Vercel shows "Building..."
- [ ] Watch deployment logs
- [ ] Wait for "✓ Production" status

---

## POST-DEPLOYMENT VERIFICATION

### Step 9: Test Health Endpoint
```bash
curl https://your-backend.vercel.app/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-10T...",
  "environment": "production"
}
```

**Checklist:**
- [ ] Returns 200 status code
- [ ] JSON response received
- [ ] "status": "ok" is present

---

### Step 10: Check Deployment Logs
```bash
# Get deployment URL from Vercel dashboard, then:
vercel logs https://your-project-backend.vercel.app --follow
```

Look for messages like:
```
✓ Database connection established successfully
✓ Backend server running
```

**Checklist:**
- [ ] Logs show successful database connection
- [ ] No error messages visible
- [ ] Migrations completed (if running for first time)
- [ ] No "missing environment variable" errors

---

### Step 11: Test API Endpoints

#### Test Login Endpoint
```bash
curl -X POST https://your-backend.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password"}'
```

**Expected Response:**
```
400 or 401 (depending on credentials) - both are OK
200 (if valid credentials)
```

**NOT Expected:**
```
405 (Method Not Allowed) - indicates routing issue
503 (Service Unavailable) - indicates startup issue
```

**Checklist:**
- [ ] Endpoint responds (any 4xx or 5xx means contact reached)
- [ ] NO 405 error
- [ ] NO "CORS error"

#### Test CORS Preflight
```bash
curl -X OPTIONS https://your-backend.vercel.app/api/auth/login \
  -H "Origin: https://your-frontend.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

**Expected Response Headers:**
```
Access-Control-Allow-Origin: https://your-frontend.vercel.app
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
```

**Checklist:**
- [ ] Returns 200 or 204 status
- [ ] CORS headers present
- [ ] Matches frontend URL

---

### Step 12: Final Verification
Test from your frontend:

1. Navigate to frontend application
2. Try to log in (use test credentials)
3. Should see login attempt reach backend

**Checklist:**
- [ ] Frontend can communicate with backend
- [ ] No CORS errors in browser console
- [ ] Login attempt reaches backend (check logs)
- [ ] Appropriate response received

---

## TROUBLESHOOTING

If something fails, use this table:

| Error | Check | Solution |
|-------|-------|----------|
| **405 Method Not Allowed** | vercel.json | Already fixed, re-deploy |
| **Database connection failed** | DATABASE_URL | Verify format in Vercel env |
| **CORS error** | FRONTEND_URL | Check: no trailing slash, https |
| **Missing JWT_SECRET** | NODE_ENV or JWT_SECRET | Add to Vercel environment |
| **Deployment timeout** | Logs | Check database accessibility |
| **504 Bad Gateway** | Logs | Check database connection |

---

## SUCCESS CRITERIA ✅

Your deployment is successful when:

- [ ] Health endpoint returns 200
- [ ] Login endpoint reachable (any response)
- [ ] No 405 Method Not Allowed errors
- [ ] No CORS errors in browser
- [ ] Database connected (check logs)
- [ ] Migrations completed (check logs)
- [ ] All environment variables present
- [ ] Frontend & backend can communicate

---

## WHAT'S NEXT

After successful deployment:

1. ✅ Test all API endpoints with frontend
2. ✅ Check Vercel logs regularly: `vercel logs <url> --follow`
3. ✅ Set up monitoring/alerts if available
4. ✅ Document any custom setup
5. ✅ Plan for database backups
6. ✅ Rotate secrets periodically (in production)

---

## QUICK REFERENCE COMMANDS

```bash
# View environment variables (without values)
vercel env list

# Pull environment to local .env
vercel env pull

# View deployment logs
vercel logs <deployment-url> --follow

# List recent deployments
vercel list

# Redeploy latest
vercel --prod

# Test health endpoint
curl https://your-backend.vercel.app/health

# Test migration locally
npm run db:migrate
```

---

## EMERGENCY ROLLBACK

If deployment fails critically:

```bash
# Revert to previous deployment
vercel rollback

# Or deploy specific commit
vercel --prod --prebuilt=<commit-hash>
```

---

## DOCUMENTATION REFERENCE

- **Quick Setup:** QUICKSTART.md
- **Detailed Guide:** VERCEL_DEPLOYMENT.md
- **Technical Details:** DEPLOYMENT_ASSESSMENT.md
- **This Checklist:** README_DEPLOYMENT.md

---

**Deployment Date:** _______________  
**Deployed By:** _______________  
**Status:** ✅ SUCCESSFUL / ❌ FAILED  
**Notes:** ___________________________________

---

**Ready to deploy? Start with Step 1 above! 🚀**
