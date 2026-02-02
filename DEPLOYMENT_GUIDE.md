# Sales Spark Replica - Deployment & Transfer Guide

## Quick Deploy to Vercel (15 minutes)

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

### Step 2: Deploy to Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Import your `sales-spark-replica` repository
4. Vercel auto-detects Vite - just click **"Deploy"**

### Step 3: Configure Environment Variables
In Vercel Dashboard → Your Project → Settings → Environment Variables:

| Variable | Value | Where to Get |
|----------|-------|--------------|
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | Supabase Dashboard → Settings → API |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `eyJhbG...` | Supabase Dashboard → Settings → API |
| `VITE_SUPABASE_PROJECT_ID` | `your-project-id` | Supabase Dashboard URL |
| `VITE_APP_URL` | `https://your-domain.com` | Your custom domain |

### Step 4: Add Custom Domain (Optional)
1. Vercel Dashboard → Your Project → Settings → Domains
2. Add your domain (e.g., `app.yourdomain.com`)
3. Update DNS records as instructed

### Step 5: Redeploy
After setting environment variables, trigger a redeploy:
- Vercel Dashboard → Deployments → Redeploy

---

## Supabase Edge Functions Setup

Your Edge Functions remain on Supabase. Set these secrets in:
**Supabase Dashboard → Edge Functions → Secrets**

| Secret | Description |
|--------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | From Settings → API → service_role |
| `ENCRYPTION_MASTER_KEY` | 32-byte hex key for AES-256 encryption |
| `RESEND_API_KEY` | For sending emails (get from resend.com) |

---

## Transfer to Client

### Option A: Transfer Vercel Project (Easiest)
1. Client creates Vercel account
2. You add client as team member
3. Transfer project ownership in Settings

### Option B: Client Deploys Fresh
1. Transfer GitHub repository to client
2. Client connects their Vercel account
3. Client sets their own environment variables

### Option C: Transfer Everything
Transfer both services:
1. **GitHub:** Transfer repository ownership
2. **Vercel:** Transfer project to client's account
3. **Supabase:** Transfer organization ownership (Supabase Dashboard → Organization Settings)

---

## Post-Transfer Checklist

After transfer, client should:

- [ ] Change Supabase passwords
- [ ] Rotate API keys in Supabase Dashboard
- [ ] Update `ENCRYPTION_MASTER_KEY` (will need to re-encrypt stored keys)
- [ ] Update custom domain DNS if needed
- [ ] Review and update integration API keys (GHL, HubSpot, etc.)

---

## Security Configuration

### Vercel Security Headers (Already Configured)
The `vercel.json` includes:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

### Production Build Optimizations
The `vite.config.ts` includes:
- Console logs stripped in production
- Source maps disabled
- Code splitting for faster loads
- Terser minification

---

## Troubleshooting

### Build Fails
```bash
# Test build locally first
npm run build
```

### Environment Variables Not Working
- Ensure variables start with `VITE_` for client-side access
- Redeploy after adding/changing variables

### Supabase Connection Issues
- Check CORS settings in Supabase Dashboard
- Verify API URL and keys are correct
- Check Edge Function logs in Supabase

---

## Cost Estimates

### Vercel (Frontend Hosting)
- **Free tier:** 100GB bandwidth, unlimited deploys
- **Pro:** $20/month (more bandwidth, team features)

### Supabase (Backend/Database)
- **Free tier:** 500MB database, 2GB bandwidth
- **Pro:** $25/month (8GB database, 250GB bandwidth)

### Total Monthly Cost
- **Small scale:** $0 (free tiers)
- **Production:** ~$45-100/month depending on usage

---

## Support

For issues:
1. Check Vercel deployment logs
2. Check Supabase Edge Function logs
3. Review browser console for client-side errors

---

*Last updated: January 16, 2026*
