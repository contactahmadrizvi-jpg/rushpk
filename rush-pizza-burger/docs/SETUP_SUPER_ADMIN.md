# Create Super Admin Login

There is **no default email or password** in this app. You choose them in Firebase.

## Option A — Firebase Console (recommended)

### Step 1: Create login (Authentication)

1. Open [Firebase Console](https://console.firebase.google.com) → your project  
2. **Build → Authentication → Users → Add user**  
3. Enter:
   - **Email:** e.g. `admin@rushpizza.pk` (you choose)
   - **Password:** e.g. `RushAdmin@2024` (you choose, min 6 chars)  
4. Click **Add user**  
5. Copy the new user’s **User UID** (long string like `xK9abc...`)

### Step 2: Assign role (Firestore)

1. **Build → Firestore Database**  
2. Collection: `users` (create if missing)  
3. **Add document**  
   - **Document ID:** paste the **UID** from Step 1 (must match exactly)  
4. Fields:

| Field | Type | Value |
|-------|------|--------|
| email | string | `admin@rushpizza.pk` |
| displayName | string | `Super Admin` |
| role | string | `super_admin` or `admin` (both work) |
| isActive | boolean | `true` |
| createdAt | string | `2026-05-25T00:00:00.000Z` |
| updatedAt | string | `2026-05-25T00:00:00.000Z` |

5. **Save**

### Step 3: Sign in

1. Run app: `npm run dev`  
2. Open: http://localhost:3000/login  
3. Use the **same email and password** from Step 1  
4. You should land on http://localhost:3000/admin  

---

## Option B — You already registered on the website

`/register` creates role **`customer`** only. Admin will block you.

Fix:

1. Firebase → Firestore → `users` → open your document (ID = your Auth UID)  
2. Change field **`role`** from `customer` to **`super_admin`**  
3. Log in again at `/login`

---

## Roles reference

Set in Firestore `users` → field **`role`**:

| Role | Access |
|------|--------|
| `super_admin` or `admin` | Full admin + settings |
| `manager` | Admin (most modules) |
| `cashier` | POS, orders |
| `kitchen_staff` | Kitchen screen |
| `delivery_rider` | Orders / delivery |
| `employee` | Attendance |
| `customer` | Website only (no admin) |

**Admin → Employees** adds staff records (CNIC, salary); it does **not** create login. Logins are always Firebase Auth + `users` document.

---

## Troubleshooting

- **Redirect to login again:** `users/{uid}` missing or `role` is `customer`  
- **Permission denied in Firestore:** deploy `firestore.rules` from project root  
- Find your UID: Authentication → Users → click user → copy UID
