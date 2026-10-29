# Deployment Guide: Prelight Control Plane

This guide walks you through deploying Prelight live:
- **Backend (FastAPI):** Deployed on **Render** (via Docker)
- **Frontend (Next.js):** Deployed on **Vercel**

---

## Architecture Overview

- **Backend (Render):** Serves `/api/state`, `/api/decision`, `/api/validate`, `/api/boundary`. Deployed with read-only demo mode enabled by default (`PRELIGHT_READ_ONLY=1`) to protect your Nebius and Tavily credits from public visitors.
- **Frontend (Vercel):** Connects to your Render backend URL via `NEXT_PUBLIC_PRELIGHT_API_URL`.

---

## Step 1: Push Code to GitHub

Ensure your latest changes are pushed to GitHub:

```bash
git add .
git commit -m "Prepare stable release and deployment configuration"
git push origin stable
```

If your default branch on GitHub is `main`, merge `stable` into `main` via a Pull Request or fast-forward merge so Render and Vercel pick it up.

---

## Step 2: Deploy Backend on Render

1. Go to [render.com](https://render.com) and sign in with GitHub.
2. Click **New +** → **Web Service**.
3. Select your repository: `prelight`.
4. Render will automatically detect the `Dockerfile`.
   - **Name:** `prelight-api` (or your choice)
   - **Runtime:** `Docker`
   - **Instance Type:** `Free`
5. Under **Environment Variables**, add:
   - `NEBIUS_API_KEY`: *(Your Nebius Token Factory API key)*
   - `TAVILY_API_KEY`: *(Your Tavily API key)*
   - `PRELIGHT_READ_ONLY`: `1` *(Demo protection: visitors view saved evidence without draining your tokens)*
   - `PRELIGHT_CORS_ORIGINS`: *(Leave blank for now, you will fill this in Step 4)*
6. Click **Create Web Service**.
7. Once deployed, test your backend:
   ```text
   https://YOUR-RENDER-SERVICE.onrender.com/api/state
   ```
   You should see JSON with your latest decision and change metadata. Copy this base URL.

---

## Step 3: Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New...** → **Project**, and import `prelight`.
3. In the project configuration:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** Click edit and set to `frontend`.
4. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_PRELIGHT_API_URL`: `https://YOUR-RENDER-SERVICE.onrender.com` *(Do not include a trailing slash)*
5. Click **Deploy**.
6. When the build completes, copy your live frontend URL (e.g., `https://prelight-xyz.vercel.app`).

---

## Step 4: Link Frontend and Backend (CORS)

1. Return to your **Render** dashboard → your web service → **Environment**.
2. Update `PRELIGHT_CORS_ORIGINS`:
   ```text
   https://prelight-xyz.vercel.app
   ```
   *(Use your exact Vercel URL, without trailing slashes)*
3. Render will automatically redeploy with the new CORS configuration.
4. Visit `https://prelight-xyz.vercel.app/dashboard`:
   - You should see the complete dashboard with real numbers, evidence chains, and rollout plans loaded directly from your backend.
   - Clicking **Validate** in demo mode will safely inform visitors that live credit consumption is disabled for the public demo.

---

## Troubleshooting

| Symptom | Cause & Fix |
|---|---|
| Dashboard says "Failed to fetch" | `PRELIGHT_CORS_ORIGINS` on Render does not match your Vercel URL, or `NEXT_PUBLIC_PRELIGHT_API_URL` has a trailing slash. Verify and redeploy. |
| Vercel 404 or Build Error | Ensure Vercel's **Root Directory** is set to `frontend`. |
| Render Cold Start | On Render's free tier, the service spins down after inactivity. The first request may take 30–50 seconds to warm up. |
| Want to trigger real runs in public | Set `PRELIGHT_READ_ONLY=0` in Render environment variables. Note that anyone who visits can consume your API credits. |
