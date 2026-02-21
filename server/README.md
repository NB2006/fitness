# Payment Backend (7pay + Supabase)

## 1) Database setup
Run `supabase.sql` in Supabase SQL Editor.

## 2) Environment variables
Copy `.env.example` to `.env` and fill:
- `SEVENPAY_PID` / `SEVENPAY_KEY`
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
- `BASE_URL` (public backend URL for 7pay notify)
- `FRONTEND_URL` (frontend URL for return redirect)

## 3) Run (local)
```
npm install
npm start
```

## 4) Deploy to Vercel
Set Vercel project root to `server/`, and add environment variables from `.env.example`.

## 5) Frontend
Replace `BACKEND_BASE_URL` in `index.html` with your backend URL.
