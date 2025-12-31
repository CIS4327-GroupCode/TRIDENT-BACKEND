# 🚀 Vercel Deployment - Quick Start Guide

**Last Updated:** December 10, 2025

---

## ⚡ 5-Minute Setup

### 1. Verify Local Setup Works
```bash
cd backend
npm install
npm run dev
```
Should start without errors and connect to database.

### 2. Add to Vercel
```bash
npm install -g vercel
vercel --prod
```
Or use Vercel dashboard to import GitHub repository.

### 3. Add Environment Variables
In Vercel Dashboard → Settings → Environment Variables, add:

```
DATABASE_URL=postgresql://... (from Neon or your provider)
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
REFRESH_TOKEN_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
FRONTEND_URL=https://your-frontend.vercel.app (no trailing slash)
NODE_ENV=production
```

### 4. Deploy
```bash
git push origin main  # Or click Deploy in Vercel
```

### 5. Test
```bash
curl https://your-backend.vercel.app/health
```

---

## 🔧 Configuration Checklist

| Item | Status | Details |
|------|--------|---------|
| `src/index.js` | ✅ Fixed | Environment validation, OPTIONS handler added |
| `src/database/index.js` | ✅ Fixed | Auto-connection test removed |
| `vercel.json` | ✅ Fixed | Build command, function config added |
| `.env.example` | ✅ Enhanced | Documentation improved |
| `.gitignore` | ✅ Created | Secrets protection |
| CORS | ✅ Configured | Handles preflight requests |
| Database pooling | ✅ Optimized | Serverless-appropriate settings |

---

## 📚 Documentation

Three documents have been created:

1. **DEPLOYMENT_ASSESSMENT.md** - Complete technical assessment
2. **VERCEL_DEPLOYMENT.md** - Detailed step-by-step guide
3. **This file** - Quick reference

---

## ⚠️ Common Issues

### "Database connection failed"
- Check `DATABASE_URL` is set in Vercel environment
- Verify database is online and accessible
- Check connection string format

### "405 Method Not Allowed"
- Already fixed in this update
- Test with: `curl -X OPTIONS https://your-backend.vercel.app/api/auth/login`

### "CORS error"
- Ensure `FRONTEND_URL` is set (no trailing slash)
- Example: `https://trident-frontend-livid.vercel.app`

### "Missing JWT_SECRET"
- Add to Vercel environment variables
- Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## 📞 Debug Commands

```bash
# View environment (values hidden)
vercel env list

# View logs
vercel logs <deployment-url> --follow

# Pull env and test locally
vercel env pull
npm run migrate

# Test endpoints
curl https://your-backend.vercel.app/health
curl -X POST https://your-backend.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"pass"}'
```

---

## ✅ You're Ready!

All critical issues have been fixed. Just add your environment variables and deploy.

**Questions?** Check DEPLOYMENT_ASSESSMENT.md or VERCEL_DEPLOYMENT.md for detailed troubleshooting.
