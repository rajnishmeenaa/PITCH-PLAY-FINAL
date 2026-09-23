# PitchPlay — Private Fantasy Contest Platform (PRD)

## Original problem statement
"make a web app for playing private contest hosted by any app i put link add fees and play after withdrawal by admin, login, signup by mobile and number only show to admin and everything manage by admin only"

## Personas
- **Admin** (mobile 9602341799): creates contests (external play link + entry fee + prize), approves UPI payment screenshots, declares winners, processes withdrawals, manages users, edits payment (UPI) settings.
- **User**: signup/login with mobile + password (no OTP), pays entry fee via UPI to admin, uploads screenshot, gets play link after approval, requests withdrawals from wallet.

## Core requirements
- Mobile numbers visible only to admin.
- Manual UPI payment (screenshot upload to Emergent object storage) with admin approval.
- Wallet credited on winner declaration; withdrawals manual (admin marks paid / rejects → refund).
- Admin manages everything: contests, entries, withdrawals, users, payment settings.

## Architecture
- Frontend: React + Tailwind + Shadcn (`/app/frontend/src/pages/{Landing,UserApp,AdminApp}.jsx`), `qrcode.react` for UPI QR.
- Backend: FastAPI + Motor (`/app/backend/server.py`), JWT (PyJWT), bcrypt.
- Collections: users, contests, entries, withdrawals, settings (key=payment), wallet_logs.

## Key API
- Auth: POST /api/auth/signup, /api/auth/login, GET /api/auth/me
- Contests: GET/POST /api/contests, PATCH/DELETE /api/contests/{id}
- Entries: POST /api/entries (multipart), GET /api/entries/mine, GET /api/entries, POST /api/entries/{id}/decision, POST /api/entries/{id}/declare-winner
- Wallet: GET /api/wallet/config, POST /api/withdrawals, GET /api/withdrawals(/mine), POST /api/withdrawals/{id}/decision
- Admin users: GET/POST /api/admin/users, DELETE /api/admin/users/{id}, POST /api/admin/users/{id}/block, POST /api/admin/users/{id}/wallet
- Admin payment settings: GET/PUT /api/admin/payment-settings
- GET /api/admin/stats, GET /api/files?path=

## Implemented (June 2026)
- [x] Base app, auth, contests, entry/screenshot flow, winners, withdrawals, admin console
- [x] Admin set to 9602341799
- [x] Admin user management: add, remove (cascade), block/unblock, wallet credit/debit
- [x] Payment settings: admin-editable UPI ID / payee / instructions; user join dialog shows QR, copy UPI, `upi://pay` deep link with amount, instructions
- [x] Testing agent iteration_1: all backend + frontend tests passed
- [x] Contest editing (admin PATCH via dialog), search boxes in Users & Payments, user wallet history (GET /api/wallet/history), winners board (GET /api/winners) — iteration_2 all passed

- [x] Admin can upload a custom UPI QR image (POST/DELETE /api/admin/payment-settings/qr); users see it in the Join dialog (falls back to auto QR). User's own QR uploaded.
- [x] Bug fix: contest play link now shown directly on user contest cards after approval (and kept after win); pending shows "Waiting for approval" — iteration_4/5 passed
- [x] Match time on contests (admin datetime input, live countdown on cards, entries blocked after match start) + WhatsApp share button on cards — iteration_3 all passed

## Backlog
- P2: Notifications (SMS/WhatsApp) on approval / winner
- P2: Admin dashboard revenue chart
