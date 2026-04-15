# Database Structure - Creatives POS System

This document outlines the data architecture for the Creatives POS System, covering Cloud (Firebase), Local (IndexedDB), and Session (LocalStorage) storage.

---

## 1. Cloud Database (Firebase Firestore)

The system uses a multi-tenant structure where each business has its own set of documents.

### Root Collections

#### `business` (Collection)
Primary collection containing all registered shops/businesses.
- **Document ID**: Unique identifier (often matches `businessID`).
- **Fields**:
  - `businessID` (String/Number): Publicly used business ID for login.
  - `businessName` (String): Display name of the business.
  - `category` (String): Business type (Retail, Restaurant, etc.).
  - `ownerUID` (String): Firebase Auth UID of the owner.
  - `status` (String): `active` or `disabled`.
  - `createdAt` (Timestamp): Registration date.
- **Subcollections**:
  - **`Trademark`**: Branding settings.
    - `mode` (String): `light` or `dark`.
    - `colour1` (Hex Code): Primary brand color.
    - `colour2` (Hex Code): Secondary brand color.
    - `logoLink` (URL): Path to the business logo.
  - **`products`**: Inventory items.
    - `barcode` (String): Unique product identifier.
    - `name` (String): Product name.
    - `icon` (String): Icon/Image reference.
    - `mrp` (Number): Maximum Retail Price.
    - `rp` (Number): Selling Price.
    - `stock` (Number): Current inventory count.
    - `buyingPrice` (Number, optional): Cost price.
    - `minStock` (Number, optional): Low stock alert threshold.
  - **`customers`**: Customer profiles and balances.
    - `name` (String): Customer name.
    - `contact` (String): Phone number.
    - `balance` (Number): Outstanding loan amount for the customer.
    - `assets` (Number): Container or asset debt tracking.
  - **`bills`**: Sales transactions.
    - `billId` (String): Unique transaction ID.
    - `billNo` (String): Displayable bill number.
    - `cashierId` (String): UID of the user who made the sale.
    - `customerId` (String, nullable): Linked customer ID or "Walk-in Customer".
    - `date` (String): Readable date.
    - `timestamp` (Number): Unix timestamp.
    - `items` (Array):
      - `barcode`, `name`, `unitPrice`, `quantity`, `discount`, `subtotal`.
    - `totalDiscount` (Number).
    - `total` (Number).
    - `paymentMethod` (String): `Cash`, `Card`, `Loan`, etc.
    - `paidAmount` (Number).
    - `balance` (Number): Change given.
    - `loanUpdate` (Number): Amount added to customer balance.
    - `createdAt` (Server Timestamp).

#### `users` (Collection)
Global collection for all users across various businesses.
- **Fields**:
  - `username` (String): Login username.
  - `password` (String): Encrypted/Plain text password (Check implementation).
  - `role` (String): `admin`, `cashier`, `manager`.
  - `extraPermissions` (Array<String>): Explicitly granted permissions.
  - `deniedPermission` (Array<String>): Explicitly revoked permissions.

#### `roles` (Collection)
Defines default permissions for each role.
- **Fields**:
  - `role` (String): Role name (e.g., "cashier").
  - `permissions` (Array<String>): List of allowed actions.

---

## 2. Local Database (IndexedDB)

Used for offline capabilities and caching data for the POS terminal.
- **Database Name**: `POS_DB` (Version 3)

### Object Stores
| Store Name | KeyPath | Description |
| :--- | :--- | :--- |
| `products` | `barcode` | Cached product list for fast scanning. |
| `customers` | `id` | Cached customer list for offline balance checks. |
| `suppliers` | `id` | Cached supplier information. |
| `bills` | `billId` | Local copies of bills before/after sync. |

---

## 3. Storage & Session (LocalStorage)

Used for configuration and background synchronization tracking.

- `BUSINESS_INFO`: Stores the currently logged-in business details.
- `USER_INFO`: Stores the current session's user data and permissions.
- `UNSYNC_BILL`: Queue of bill objects that failed to save online due to connection issues.
- `PRODUCT_DATA`: JSON string of the full product list (Used as a fallback for IndexedDB).
- `THEME`: User's preferred theme (`light` / `dark`).
