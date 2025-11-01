# Deploying the NexaFlow / SmartTalkAI Backend (quick guide)

This guide shows two simple ways to host the backend so your Netlify frontend can talk to it live anytime:

- Quick, recommended: Deploy the backend as a Node service on Render.com (free tier available)
- Alternative: Deploy on Railway, Fly, or any Node host (or use Docker to run on a VM)

What this change included
- `backend/server.js` now reads `FRONTEND_ORIGINS` (comma-separated) to allow your Netlify site to call the API.

Required environment variables (minimum)
- `MONGODB_URI` — MongoDB connection string (Atlas recommended)
- `JWT_SECRET` — secure random string for signing tokens
- `EMAIL_USER` & `EMAIL_PASSWORD` — Gmail address and App Password (optional)
- `GEMINI_API_KEY`, `OPENAI_API_KEY`, `COHERE_API_KEY` — AI provider API keys (optional, at least one required for AI features)
- `FRONTEND_ORIGINS` — comma-separated list of allowed frontend origins. e.g. `https://smarttalkkai-nutan.netlify.app` or `*` for testing (not recommended for prod)

Deploy on Render (recommended quick steps)
1. Create a Render account and link your GitHub repo.
2. Click "New" → "Web Service" and select the repo path to `backend/`.
3. Configure:
   - Environment: Node
   - Build Command: `npm ci`
   - Start Command: `npm start`
   - Instance: Free or starter plan
   - Environment Variables: Add the variables listed above (MONGODB_URI, JWT_SECRET, FRONTEND_ORIGINS etc.)

4. (Important) Set `FRONTEND_ORIGINS` to your Netlify URL, for example:
   `https://smarttalkkai-nutan.netlify.app`

5. Deploy. Once the service is live Render will provide a URL like `https://nexaflow-backend.onrender.com`.

6. Update your frontend (Netlify) environment variable `REACT_APP_API_URL` to point to the deployed backend URL (e.g., `https://nexaflow-backend.onrender.com`).

7. Trigger a new deploy of the frontend on Netlify (or wait for automatic redeploy if linked).

Verify the backend is reachable
- Open: `https://<your-backend>/api/test` to confirm JSON status.
- From the frontend in browser open Developer Tools → Console / Network and verify calls to your backend are returning 200.

Notes about long-running SSE (/api/chat/stream)
- Server-Sent Events are supported by Render and most Node hosts for normal use; serverless platforms (Netlify Functions, Vercel Serverless) often have time limits and are not a good fit for long-running streams.
- If you need pure serverless hosting, consider using WebSocket-capable providers (Pusher, Ably) or keep a small always-on Node service for chat streams.

Security & tips
- Use MongoDB Atlas and restrict IP access and use strong credentials.
- Do NOT store secrets in Git. Use the host's environment variables.
- Use a secure `JWT_SECRET` (32+ bytes) and rotate keys if needed.
- For email sending with Gmail, use App Passwords (not your account password).

Example `FRONTEND_ORIGINS` values
- Single Netlify site: `https://smarttalkkai-nutan.netlify.app`
- Multiple origins: `https://smarttalkkai-nutan.netlify.app,https://staging.example.com`
- Local dev + prod: `http://localhost:3000,https://smarttalkkai-nutan.netlify.app`

Local testing
1. Create `.env` in `backend/` with the required variables (copy from `.env.example` if present).
2. Run locally: `npm ci` then `npm start` (or `npm run dev` for nodemon).
3. Visit `http://localhost:5000/api/test` to confirm.

If you'd like, I can:
- Add a small health check endpoint if you'd prefer (already `/api/test`).
- Create a GitHub Actions workflow to deploy backend to Render automatically on push.
- Help set the Netlify environment variable `REACT_APP_API_URL` and test the deployed site.

---
If you tell me the hosting provider you prefer (Render, Railway, Fly, or a VM), I will provide exact step-by-step instructions and can create GitHub Actions to automate deployments.

Railway / Railpack startup error ("Script start.sh not found")
----------------------------------------------------------------
If you see an error from Railpack like:

```
You reached the start of the range
Nov 1, 2025, 2:27 PM

[Region: us-west1]

╭────────────────╮
│ Railpack 0.9.2 │
╰────────────────╯

⚠ Script start.sh not found
✖ Railpack could not determine how to build the app.
```

Railpack couldn't find a startup script in the repo root. The simplest fixes are:

1. Add a `start.sh` at the repository root that installs and starts the backend (we created one for you).
2. Add a `Procfile` pointing to the script: `web: bash start.sh` (also created).
3. Alternatively set the service to point at the `backend/` folder and configure the build/start commands in Railway's UI (`npm ci` and `npm start`).

What we added to this repo to fix the Railpack error:
- `start.sh` at the repo root — runs `npm ci` and `npm start` inside `backend/`.
- `Procfile` at the repo root — `web: bash start.sh` so Railpack/Railway knows how to start the service.

If you prefer not to use `start.sh`, you can instead:
- In Railway, when creating the service, set the "Root Directory" to `backend/` and set Build Command = `npm ci`, Start Command = `npm start`.

Notes:
- Ensure environment variables (MONGODB_URI, JWT_SECRET, FRONTEND_ORIGINS, etc.) are set in Railway before starting.
- If you see permission errors for `start.sh`, Railway runs builds in a Linux environment and will execute `bash start.sh` from the Procfile; the file does not strictly need the executable bit set in the repo.

After updating, redeploy the Railway service and visit `/api/test` on the provided URL to confirm the backend is running.
