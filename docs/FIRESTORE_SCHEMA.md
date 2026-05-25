# Firestore Schema — Rush Pizza and Burger

## Collections

| Collection | Purpose |
|------------|---------|
| `users` | Auth profiles + roles |
| `employees` | Staff records (CNIC, salary, shifts) |
| `menu_categories` | Pizza, burger, etc. |
| `menu_items` | Products with variants/addons |
| `recipes` | Ingredient list per menu item |
| `inventory_items` | Raw materials + stock levels |
| `stock_movements` | Purchases, deductions, waste |
| `orders` | All orders (POS + website) |
| `tables` | Dine-in tables |
| `payments` | Payment records |
| `attendance` | GPS/QR check-ins |
| `coupons` | Discount codes |
| `deals` | Promotions |
| `settings` | Restaurant config (doc: `main`) |
| `audit_logs` | Activity trail |

## Inventory deduction

On `createOrder()`, service reads `recipes` where `menuItemId` matches each line item, then batch-updates `inventory_items.currentStock` and creates `stock_movements` type `sale_deduction`.

## Roles

`super_admin` | `manager` | `cashier` | `kitchen_staff` | `delivery_rider` | `employee` | `customer`

See `firestore.rules` for access control.
