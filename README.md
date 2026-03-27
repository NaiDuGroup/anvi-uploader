# 🖨️ Print Upload System — Technical Specification (MVP)

## 📌 Overview

This project is a lightweight web-based system for managing print file uploads and internal processing in a print studio.

The goal is to:

* Replace fragmented channels (Viber, Email, Telegram)
* Provide a **single upload entry point for clients**
* Provide a **fast internal dashboard for operators**
* Keep UX extremely simple (no login required for clients)
* Ensure **basic security and privacy**

---

# 🎯 Core Principles

* ⚡ **Speed over complexity**
* 🚫 **No login for clients**
* 🔐 **Secure access via magic links**
* 📱 **Mobile-first UX**
* 🧑‍💻 **Operator-first dashboard (internal users are main users)**

---

# 👥 User Roles

## 1. Client (External)

* Uploads files
* Sets basic print parameters
* Receives tracking link
* Can only see **status (NOT files)**

## 2. Studio Operator (Admin)

* Sees all incoming orders
* Assigns orders to self
* Decides:

  * Print locally
  * Send to workshop

## 3. Workshop Operator

* Sees only assigned workshop orders
* Processes them
* Updates status

---

# 🧱 System Architecture

## Frontend

* Next.js 15 (App Router)
* React 19
* TypeScript
* Tailwind CSS v4
* Radix UI (components)
* Zustand (state management)
* React Hook Form + Zod (forms & validation)
* Optional: Konva (future visual preview / editing)

## Backend

* Next.js API routes OR separate backend (Node.js)
* PostgreSQL (recommended via Supabase or direct)
* AWS S3 (file storage)

## File Storage

* AWS S3 (or S3-compatible)
* Files are NOT stored in DB
* Only metadata is stored

---

# ☁️ File Upload Strategy (AWS S3)

## Approach: Direct Upload via Signed URL

### Flow:

1. Client requests upload URL
2. Backend generates **pre-signed S3 URL**
3. Client uploads directly to S3
4. Backend stores metadata

### Benefits:

* No backend load
* Scalable
* Secure
* Cheap

---

# 🗂️ Data Model

## Table: orders

| Field        | Type      | Description      |
| ------------ | --------- | ---------------- |
| id           | UUID      | Primary key      |
| phone        | string    | Client phone     |
| status       | enum      | Order status     |
| assigned_to  | UUID      | Operator         |
| is_workshop  | boolean   | Sent to workshop |
| public_token | string    | Magic link token |
| expires_at   | timestamp | Expiration       |
| created_at   | timestamp | Created          |

---

## Table: files

| Field      | Type   | Description      |
| ---------- | ------ | ---------------- |
| id         | UUID   | Primary key      |
| order_id   | UUID   | FK               |
| file_url   | string | S3 URL           |
| file_name  | string | Original name    |
| copies     | int    | Number of copies |
| color      | enum   | bw / color       |
| paper_type | string | optional         |

---

## Table: users

| Field | Type   | Description      |
| ----- | ------ | ---------------- |
| id    | UUID   | Primary key      |
| name  | string | Operator name    |
| role  | enum   | admin / workshop |

---

# 🔄 Order Lifecycle

## Statuses (internal)

* NEW
* IN_PROGRESS
* ASSIGNED
* SENT_TO_WORKSHOP
* WORKSHOP_PRINTING
* READY
* ISSUE

## Client-visible statuses

* "In progress"
* "Ready"

---

# 🔐 Security Model

## Magic Link Access

Each order has:

* `public_token` (UUID or nanoid)
* Used for client tracking

### Endpoint:

```
/track/:token
```

### Rules:

* No authentication required
* Only returns:

  * order status
  * order ID
* NEVER returns file URLs

---

## Expiration

* Orders expire after 24 hours
* After expiration:

  * tracking link becomes invalid OR
  * returns "expired"

---

## Phone Number

Used for:

* Internal search
* Order grouping

NOT used for:

* authentication
* client access

---

# 📱 Client Flow

## Upload Page

### Fields:

* File upload (multiple)
* Copies (required)
* Color (bw / color)
* Phone number (required)

### UX:

* Single page
* Large upload button
* Mobile optimized

---

## After Submit

User sees:

* Order ID
* Tracking link

Actions:

* Copy link
* Keep page open

---

# 🧑‍💻 Admin Dashboard

## Layout Options

### Option 1: Kanban

* New
* In Progress
* Workshop
* Ready

### Option 2: Table (MVP preferred)

---

## Features

### 1. Order List

* Real-time updates
* Sorted by newest

---

### 2. “Take in Work” Button

* Assigns order to operator
* Locks it visually

---

### 3. Search

* By phone number
* Shows all orders for that client

---

### 4. Order Actions

* Assign to self
* Mark as ready
* Send to workshop

---

### 5. File Actions

* Open file
* Print manually

---

# 🏭 Workshop Flow

* Separate filtered view
* Only sees:

  * orders marked `is_workshop = true`

Actions:

* Start work
* Mark ready

---

# 🔔 Notifications (Optional MVP+)

* Telegram bot for new orders
* Sound notification in dashboard

---

# 📦 API Endpoints

## Upload

```
POST /api/upload-url
```

Returns signed S3 URL

---

```
POST /api/orders
```

Creates order + files

---

## Tracking

```
GET /api/track/:token
```

---

## Admin

```
GET /api/orders
PATCH /api/orders/:id
```

---

# ⚙️ State Management (Zustand)

## Stores:

### useOrdersStore

* orders list
* fetchOrders()
* updateOrder()

---

### useAuthStore (internal only)

* current user
* role

---

# 🧪 Validation (Zod)

## Example schema:

```ts
const uploadSchema = z.object({
  phone: z.string().min(8),
  files: z.array(z.object({
    copies: z.number().min(1),
    color: z.enum(['bw', 'color'])
  }))
})
```

---

# 🎨 UI Components (Radix + Tailwind)

## Client

* UploadDropzone
* Input (phone)
* Select (color)
* NumberInput (copies)
* SubmitButton

---

## Admin

* OrdersTable
* OrderCard
* StatusBadge
* AssignButton
* SearchInput

---

# 🚀 MVP Scope

## MUST HAVE

* Upload page
* S3 upload
* Order creation
* Admin dashboard
* Status update
* Magic link tracking

---

## NICE TO HAVE

* Notifications
* Workshop view
* Preview thumbnails

---

## NOT IN MVP

* Authentication for clients
* Payments
* File editing
* AI validation

---

# 💰 Cost Optimization

* Use S3 lifecycle rules:

  * auto-delete files after X days
* Compress images on upload (optional)
* Avoid storing large metadata

---

# 🔮 Future Enhancements

* AI file validation
* Auto printer routing
* CRM features
* Multi-location support
* SaaS version

---

# ✅ Success Criteria

* Clients stop using Viber/email
* Operators process faster
* No lost files
* Reduced confusion between staff

---

# 📌 Final Notes

This system should feel:

* instant
* simple
* invisible

If it feels like “software” → it's too complex
If it feels like “just works” → it's correct
