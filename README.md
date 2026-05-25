# Rush Pizza and Burger — Restaurant Management System

Enterprise-grade restaurant platform for **Rush Pizza and Burger**, Sheikhupura, Pakistan.

## Stack

- **Next.js 15** App Router + TypeScript
- **Firebase** Auth + Firestore
- **ImgBB** image uploads
- **Zustand**, Tailwind CSS, shadcn-style UI, Recharts, Framer Motion, PWA

## Modules

| Module | Route |
|--------|-------|
| Customer website | `/home`, `/menu`, `/cart`, `/checkout` |
| Admin dashboard | `/admin` |
| POS | `/pos` |
| Kitchen (KOT) | `/kitchen` |
| Attendance (GPS/QR) | `/admin/attendance` |

## Setup

1. Copy `.env.example` → `.env.local` and fill Firebase + ImgBB keys.
2. Deploy `firestore.rules` and `firestore.indexes.json` to Firebase.
3. `npm install` && `npm run dev`
4. **Create Super Admin** (no built-in email/password — you choose in Firebase):

   See **[docs/SETUP_SUPER_ADMIN.md](docs/SETUP_SUPER_ADMIN.md)** for step-by-step.

   Quick version:
   - Firebase **Authentication** → Add user (your email + password)
   - Firestore **`users/{that-user-uid}`** → `role: "super_admin"`, `isActive: true`, etc.
   - Login at `/login` with that email and password

## POS

- Requires **customer name & phone** before payment
- Prints receipt with name, phone, order #, and timestamp
- Shortcuts: **F2** pay cash, **F3** hold, **Esc** clear

## Inventory

Link recipes to menu items in `recipes` collection. Stock auto-deducts on every order.

## Attendance

- GPS check-in within `NEXT_PUBLIC_ATTENDANCE_RADIUS_METERS` of restaurant
- QR token: `NEXT_PUBLIC_ATTENDANCE_QR_TOKEN`

## Production

```bash
npm run build
npm start
```
