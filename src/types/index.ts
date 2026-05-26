export type UserRole =
  | "super_admin"
  | "admin"
  | "manager"
  | "cashier"
  | "kitchen_staff"
  | "delivery_rider"
  | "employee"
  | "customer";

export type OrderStatus =
  | "pending"
  | "received"
  | "preparing"
  | "in_kitchen"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "served"
  | "cancelled"
  | "held";

export type KitchenStatus = "new" | "preparing" | "ready" | "served";

export type OrderType = "dine_in" | "takeaway" | "delivery" | "online";

export type PaymentMethod = "cash" | "online" | "card";

export type PaymentStatus = "pending" | "paid" | "refunded";

export type InventoryUnit =
  | "kg"
  | "gram"
  | "liter"
  | "piece"
  | "slice"
  | "bottle"
  | "pack";

export type StockMovementType =
  | "purchase"
  | "sale_deduction"
  | "adjustment"
  | "waste"
  | "return";

export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  role: UserRole;
  /** Custom access list; when set, overrides default role permissions */
  permissions?: string[];
  photoURL?: string;
  addresses?: Address[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface Address {
  id: string;
  label: string;
  street: string;
  area: string;
  city: string;
  phone: string;
  isDefault?: boolean;
}

export interface Employee {
  id: string;
  userId?: string;
  name: string;
  email: string;
  phone: string;
  cnic: string;
  role: UserRole;
  salary: number;
  shiftStart: string;
  shiftEnd: string;
  permissions: string[];
  performanceNotes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  sortOrder: number;
  isActive: boolean;
  type: "pizza" | "burger" | "sides" | "drinks" | "deals" | "other";
}

export interface MenuVariant {
  id: string;
  name: string;
  priceModifier: number;
}

export interface MenuAddon {
  id: string;
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
  isPopular: boolean;
  isFeatured: boolean;
  spiceLevels?: string[];
  hasExtraCheese?: boolean;
  extraCheesePrice?: number;
  variants?: MenuVariant[];
  addons?: MenuAddon[];
  prepTimeMinutes?: number;
  taxRate?: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  unit: InventoryUnit;
}

export interface Recipe {
  id: string;
  menuItemId: string;
  menuItemName: string;
  ingredients: RecipeIngredient[];
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  unit: InventoryUnit;
  currentStock: number;
  minStock: number;
  costPerUnit: number;
  supplierId?: string;
  expiryDate?: string;
  isActive: boolean;
  preventSellWhenLow: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  createdAt: string;
}

export interface Purchase {
  id: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseItem[];
  totalAmount: number;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export interface PurchaseItem {
  inventoryItemId: string;
  name: string;
  quantity: number;
  unit: InventoryUnit;
  unitCost: number;
}

export interface StockMovement {
  id: string;
  inventoryItemId: string;
  inventoryItemName: string;
  type: StockMovementType;
  quantity: number;
  unit: InventoryUnit;
  referenceId?: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export interface CartItemCustomization {
  variantId?: string;
  variantName?: string;
  addonIds?: string[];
  addonNames?: string[];
  extraCheese?: boolean;
  spiceLevel?: string;
  notes?: string;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  customization?: CartItemCustomization;
  subtotal: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  dailyOrderNumber?: number;
  userId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  type: OrderType;
  status: OrderStatus;
  kitchenStatus?: KitchenStatus;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  deliveryCharge: number;
  discount: number;
  couponCode?: string;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryAddress?: Address;
  deliveryNotes?: string;
  tableId?: string;
  tableNumber?: number;
  branchId: string;
  source: "pos" | "website" | "phone";
  createdBy?: string;
  assignedRiderId?: string;
  kotPrinted?: boolean;
  receiptPrinted?: boolean;
  priority?: "normal" | "high";
  createdAt: string;
  updatedAt: string;
}

export interface Table {
  id: string;
  number: number;
  capacity: number;
  status: "available" | "occupied" | "reserved" | "merged";
  currentOrderId?: string;
  mergedWith?: string[];
  branchId: string;
}

export interface Payment {
  id: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  createdAt: string;
  createdBy: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  minOrder: number;
  maxUses?: number;
  usedCount: number;
  expiresAt?: string;
  isActive: boolean;
}

export interface Deal {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  discountPercent?: number;
  fixedPrice?: number;
  menuItemIds?: string[];
  isActive: boolean;
  validFrom: string;
  validTo: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  checkInMethod: "gps" | "qr" | "device" | "selfie";
  checkInLat?: number;
  checkInLng?: number;
  selfieUrl?: string;
  isLate: boolean;
  workingMinutes?: number;
  overtimeMinutes?: number;
  notes?: string;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  notes?: string;
  createdBy: string;
}

export interface Notification {
  id: string;
  userId?: string;
  role?: UserRole;
  title: string;
  message: string;
  type: "order" | "inventory" | "attendance" | "system";
  isRead: boolean;
  link?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  details?: string;
  createdAt: string;
}

export interface RestaurantSettings {
  id: string;
  name: string;
  tagline?: string;
  logoUrl?: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  currency: string;
  taxRate: number;
  deliveryCharge: number;
  freeDeliveryAbove?: number;
  openingHours: OpeningHours[];
  printerSettings?: PrinterSettings;
  notificationSettings?: NotificationSettings;
  whatsappNumber?: string;
  branches: Branch[];
  updatedAt: string;
}

export interface OpeningHours {
  day: number;
  open: string;
  close: string;
  isClosed: boolean;
}

export interface PrinterSettings {
  kotEnabled: boolean;
  receiptEnabled: boolean;
  restaurantName: string;
}

export interface NotificationSettings {
  orderSound: boolean;
  whatsappOrders: boolean;
  lowStockAlerts: boolean;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

export interface DashboardStats {
  todayRevenue: number;
  todayOrders: number;
  monthlyRevenue: number;
  pendingOrders: number;
  lowStockCount: number;
  onlinePayments: number;
  cashPayments: number;
}
