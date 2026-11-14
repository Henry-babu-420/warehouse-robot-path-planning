# Cloudflare Pages Deployment Guide

**Autonomous Warehouse Robot Path Planning & Collision Avoidance Simulator**  
*Hosting & Production Deployment Specification (100% Free Tier)*

---

## 1. Overview & Free Tier Compatibility

This project is fully optimized for **Cloudflare Pages Free Tier**, providing zero-cost, highly reliable global edge hosting:
- **Bandwidth:** Unlimited.
- **Static Asset Requests:** Unlimited.
- **Build Minutes:** 500 builds per month (ample for continuous development).
- **SSL / TLS:** Automated free certificates with instant HTTPS enforcement.
- **Custom Domains:** Free custom domain binding with Cloudflare DNS proxying.
- **Global CDN:** Fast edge caching across 300+ Cloudflare data centers worldwide.

---

## 2. Project Architecture & Build Verification

The application is a pure client-side Single Page Application (SPA) requiring no backend database, paid APIs, or server functions.

### 2.1 Build Specifications
- **Build Tool:** Vite 6 + TypeScript 5
- **Build Script:** `npm run build` (runs `tsc && vite build`)
- **Output Directory:** `dist`
- **Output Artifacts:**
  - `dist/index.html` (Entry point)
  - `dist/assets/index-*.js` (Minified production bundle)
  - `dist/assets/index-*.css` (Compiled stylesheet)
  - `dist/_redirects` (SPA route fallback rule)
  - `dist/_headers` (Browser caching & security headers)
  - `dist/favicon.svg`, `dist/vite.svg`, `dist/icons.svg` (Static assets)

---

## 3. Deployment Configuration Files

To guarantee smooth operation on Cloudflare Pages, the following configuration files have been added to the `public/` directory (automatically bundled into `dist/` on build):

### 3.1 SPA Direct URL Refresh (`public/_redirects`)
In Single Page Applications, direct browser navigation to deep paths or refreshing sub-views can trigger a 404 error if the host server tries to locate a physical file. Cloudflare Pages uses `_redirects` with HTTP status `200` to internally rewrite all non-file paths to `index.html`:

```
/*    /index.html   200
```
This ensures direct bookmarks, page reloads, and browser history navigation work seamlessly.

### 3.2 Asset Caching & Security Headers (`public/_headers`)
Static production chunks in Vite have content-hashed filenames (`index-L667K-Cb.js`). The `_headers` file instructs Cloudflare to cache these assets immutably for 1 year while enforcing security headers on all pages:

```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

---

## 4. Step-by-Step Cloudflare Dashboard Instructions

Follow these exact steps in the Cloudflare web dashboard to deploy the repository:

### Step 1: Sign in to Cloudflare
1. Go to [https://dash.cloudflare.com/](https://dash.cloudflare.com/) and sign in (or create a free account).

### Step 2: Create a New Pages Application
1. In the left navigation menu, navigate to **Compute (Workers & Pages)**.
2. Click **Create application**.
3. Select the **Pages** tab.
4. Click **Connect to Git**.

### Step 3: Connect GitHub Repository
1. Select your GitHub account (`Henry-babu-420`).
2. Choose repository: **`warehouse-robot-path-planning`**.
3. Click **Begin setup**.

### Step 4: Configure Exact Build Settings
Enter the following parameters in the setup form:

| Configuration Field | Value | Notes |
| :--- | :--- | :--- |
| **Project Name** | `warehouse-robot-simulator` *(or desired name)* | Determines default URL: `<name>.pages.dev` |
| **Production Branch** | `main` | Production deployment branch |
| **Framework Preset** | `Vite` | Pre-populates recommended settings |
| **Build Command** | `npm run build` | Compiles TypeScript and runs `vite build` |
| **Build Output Directory** | `dist` | Directory containing built production files |
| **Root Directory** | *(leave blank / `/`)* | Project root |

### Step 5: Environment Variables (Optional but Recommended)
Click **Environment variables (advanced)** and add:
- Variable Name: `NODE_VERSION`
- Value: `20` *(or `18`)*

*(This ensures the Cloudflare build runner uses modern Node 20 runtime matching Vite 6 requirements).*

### Step 6: Deploy
1. Click **Save and Deploy**.
2. Cloudflare Pages will clone the repository, run `npm install`, execute `npm run build`, and deploy the contents of `dist` across its edge network.
3. Once completed (typically ~30–45 seconds), your application will be live at:
   ```
   https://<your-project-name>.pages.dev
   ```

---

## 5. Blocker Assessment & Verification

- **API Keys / Secrets:** None required. The simulation runs 100% locally in the browser with deterministic algorithms.
- **Paid Services:** Zero paid APIs or cloud dependencies are required.
- **Build Reliability:** Verified clean build with 0 TypeScript errors and 0 lint failures (`✓ built in ~640ms`).
- **Output Path:** Strictly verified as `dist/`.
- **Status:** **READY FOR DEPLOYMENT (ZERO BLOCKERS)**.
