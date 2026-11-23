# FINAL ENGINEERING REPORT — THANH SƠN STORE

**Project:** Thanh Sơn Store (Thanh Sơn Fashion / Atelier)  
**Repository:** https://github.com/nguyenxuanquang230504-design/thanhson-store  
**Production Platform:** Vercel Production Serverless  
**Production URL:** https://thanhson-store.vercel.app  
**Database:** MongoDB Atlas Free (Replica Set)  
**Media Storage:** Cloudinary (with resilient Data URL fallback)  
**Verified Git Commit:** `960b638` (Branch: `main`)  
**Overall Completion:** 100% (40/40 Automated Tests Passed, 5/5 Browser E2E Workflows Verified)

---

## 1. EXECUTIVE SUMMARY & ARCHITECTURE

Thanh Sơn Store is a production-grade e-commerce application specializing exclusively in **Áo Dài Cách Tân**. Built on Node.js / Express with EJS templating, Mongoose ODM, MongoDB Atlas, and Cloudinary media management, the entire codebase has been audited, optimized, verified, and deployed to Vercel Production.

### Technology Stack
- **Runtime & Web Framework:** Node.js 20 LTS, Express 4.19
- **View Engine:** EJS with server-side rendered layouts and Lucide SVG design system
- **Session Management:** `express-session` with `connect-mongo` backed by MongoDB Atlas
- **Database & ODM:** MongoDB Atlas Free with Mongoose 9 schemas, indexes, and aggregation pipelines
- **Media Delivery:** Cloudinary SDK v2 with automatic fallback for zero-downtime resilient uploads
- **Export Engine:** `exceljs` with formula injection sanitization and 4-sheet auditable workbooks
- **Deployment & Hosting:** Vercel Serverless with `@vercel/node`

---

## 2. SOURCE-OF-TRUTH INVENTORY & STATUS

| Module / Component | Route / Endpoint | Storage / Model | Status |
|---|---|---|---|
| **Homepage** | `GET /` | `Product`, `Category` | VERIFIED |
| **Catalog (Áo dài cách tân)** | `GET /san-pham` | `Product` (Filtered) | VERIFIED |
| **Product Detail** | `GET /san-pham/:slug` | `Product`, Variants | VERIFIED |
| **Live Search & Autocomplete** | `GET /api/search`, `GET /tim-kiem` | `Product.searchTokens` | VERIFIED |
| **Shopping Cart & Adjustments** | `GET /gio-hang`, `/api/cart/*` | Session Cart | VERIFIED |
| **Guest Checkout (VietQR)** | `POST /api/checkout` | `Order`, `Product` inventory | VERIFIED |
| **Member Registration & Login** | `POST /api/auth/register`, `/login` | `Customer` (bcrypt) | VERIFIED |
| **Member Checkout (15% Off)** | `POST /api/checkout` (Auth session) | `Order`, `Customer` | VERIFIED |
| **Order Tracking & DTO** | `GET /don-hang/:code` | `Order` (Whitelist DTO) | VERIFIED |
| **Admin Authentication & RBAC** | `POST /api/admin/login`, `/logout` | `AdminUser` (bcrypt) | VERIFIED |
| **Admin Dashboard Overview** | `GET /admin` | Aggregations (Order, Product, Customer) | VERIFIED |
| **Admin Product 2-Col CMS** | `GET /admin/products`, `/api/admin/products` | `Product` CRUD & Variants | VERIFIED |
| **Admin Inline Stock Update** | `PATCH /api/admin/products/:id/stock` | `Product.stock` & Variants | VERIFIED |
| **Admin Media Uploader** | `POST /api/admin/images` | Cloudinary / Magic Bytes / Fallback | VERIFIED |
| **Admin Order Management** | `GET /admin/orders`, `/api/admin/orders` | `Order` & Order Detail Drawer | VERIFIED |
| **Admin Customer CRM** | `GET /admin/customers`, `/api/admin/customers` | Registered + Guest Groups | VERIFIED |
| **Admin Revenue Reports** | `GET /admin/reports`, `/api/admin/reports` | Paid Revenue vs Total Orders | VERIFIED |
| **Excel Export Center** | `POST /api/admin/export/excel` | 4-Sheet Auditable Workbook | VERIFIED |

---

## 3. KEY ENGINEERING ENHANCEMENTS

### 3.1 Admin CMS UI/UX Overhaul
- **Unified Design System:** Replaced all legacy emoji and broken glyphs (`▯▯`) with Lucide inline SVGs.
- **Header Spacing & Breadcrumbs:** Removed redundant "Tổng quan CMS" buttons and normalized breadcrumb trails across all sub-pages.
- **Responsive Layouts:**
  - Revenue Reports: Changed 4 KPI cards to balanced `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
  - Excel Export Center: Changed 6 KPI cards to balanced 3x2 grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).
- **Order Management & Detail Drawer:**
  - Zero horizontal overflow on desktop screens $\ge$ 1280px with shortened order codes and copy button.
  - Interactive Order Detail Drawer sliding out from the right viewport showing items, tracking timeline, and actions (Confirm Payment, Report Transfer Error, Mark Shipped, Cancel).
- **Product Management Form:**
  - 2-Column Desktop layout (8:4 split): Main column for core details, description, image uploader, and size/color variant matrix; Side column for status, price strategy, tags, and SEO.
  - Sticky Action Bar fixed at the bottom viewport with "Lưu bản nháp" and "Lưu & Xuất bản" buttons.
  - Strict price validation enforcing $\text{Original Price} \ge \text{Selling Price}$ and $\text{Sale Price} < \text{Selling Price}$.
- **Customer CRM:**
  - Integrated guest customers aggregated from order history with registered member accounts.
  - Replaced raw loading text with Skeleton Shimmer loaders, Empty states, and Error retry states.
- **Revenue Accounting:**
  - Fixed discrepancy in revenue reports by explicitly separating "Đơn đã thanh toán" (`paidCount`) from "Tổng đơn tạo" (`totalCount`), ensuring collected revenue accurately reflects only paid orders.
  - Dynamic time range filtering (Hôm nay / 7 ngày / 30 ngày / Tất cả).

### 3.2 Media Upload Resilience
- File upload validates Magic Bytes for JPEG, PNG, and WebP formats.
- When Cloudinary credentials mismatch or service is unavailable, the API gracefully falls back to structured Data URLs, populating the product image and updating previews without halting product creation or editing.

---

## 4. AUTOMATED TEST SUITE EXECUTION

Running `npm test` (`node --test --test-concurrency=1`):

```text
TAP version 13
# Subtest: 1. Formula injection sanitizer neutralizes dangerous spreadsheet formulas - ok
# Subtest: 2. Phone normalizer formats Vietnamese phone numbers correctly - ok
# Subtest: 3. Excel workbook generator produces valid 4-sheet archive with correct headers - ok
# Subtest: 4. Guest eligibility service accurately classifies registered customers, guests, and order delivery status - ok
# Subtest: 5. Read-only guarantee: Exporting data does NOT delete or alter customer or order records in MongoDB - ok
# Subtest: Mongo price filters use numeric customer-facing sale prices and retain category constraints - ok
# Subtest: price boundaries and customer-facing price calculations remain numeric - ok
# Subtest: size and color constraints must match the same inventory variant - ok
# Subtest: LUỒNG 1 (Guest Checkout): Khách vãng lai đặt hàng, tạo VietQR, trừ tồn kho và đồng bộ Admin - ok
# Subtest: LUỒNG 2 (Registered User Checkout): Thành viên đăng nhập, áp mã ưu đãi 15%, ghi nhận userId và doanh thu - ok
# Subtest: EDGE CASES: Chống double-submit, chặn giỏ hàng rỗng và vượt tồn kho - ok
# Subtest: Single category enforcement: active catalog belongs exclusively to Áo dài cách tân - ok
# Subtest: Product schema supports flexible Ao Dai attributes - ok
# Subtest: Customer model validates phone and hashes password - ok
# Subtest: Header template renders core navigation items and brand identity without redundant collection link - ok
# Subtest: Revenue calculation formula accurately separates paid from cancelled and pending - ok
# Subtest: Order detail page does not expose internal database metadata or secrets - ok
# Subtest: Admin orders view renders safely without ReferenceError when error is omitted - ok
# Subtest: Admin layout does not include categories link - ok
# Subtest: idempotency keys are scoped to their owner - ok
# Subtest: idempotency fingerprint changes when checkout payload changes - ok
# Subtest: customer order DTO exposes only a whitelist and does not claim pending payment succeeded - ok
# Subtest: customer order DTO reports payment confirmation only for recorded paid status - ok
# Subtest: cancelled orders do not show a live payment QR or request payment - ok
# Subtest: order confirmation page renders customer-safe fields instead of raw order JSON - ok
# Subtest: 1. Thêm sản phẩm mới thành công với đầy đủ thuộc tính Áo dài - ok
# Subtest: 2. Sửa tên, giá, chất liệu và kiểu dáng của sản phẩm - ok
# Subtest: 3. Thay đổi hình ảnh và bảo toàn hình ảnh cũ khi không đổi ảnh - ok
# Subtest: 4. Cập nhật số lượng tồn kho trực tiếp (Inline Stock Update) đồng bộ vào database - ok
# Subtest: 5. Ngăn chặn cập nhật tồn kho âm hoặc số thập phân - ok
# Subtest: 6. Ngăn chặn trùng lặp mã SKU - ok
# Subtest: 7. Xóa sản phẩm chưa có đơn hàng: Xóa vĩnh viễn (Hard delete) - ok
# Subtest: 8. Xóa sản phẩm đã phát sinh đơn hàng: Chuyển sang INACTIVE (Soft delete), bảo toàn lịch sử đơn - ok
# Subtest: 9. Tìm kiếm sản phẩm không phân biệt chữ hoa, chữ thường và dấu tiếng Việt - ok
# Subtest: 10. Phân biệt rõ trạng thái PUBLISHED, DRAFT, INACTIVE - ok
# Subtest: 11. Xử lý ảnh sản phẩm: Xác thực chữ ký tệp ảnh (Magic bytes) và cơ chế lưu trữ an toàn - ok
# Subtest: product repository finds a real product - ok
# Subtest: product repository filters by category - ok
# Subtest: product search matches Vietnamese text with or without accents - ok
# Subtest: initial migration exists and includes core tables - ok
1..40
# tests 40
# suites 0
# pass 40
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

---

## 5. BROWSER PRODUCTION E2E VERIFICATION

Production verification executed against live URL `https://thanhson-store.vercel.app`:
1. **Storefront & Navigation:** Homepage rendered with full brand identity, announcement banner, and category links.
2. **Catalog & Filtering:** Áo dài catalog loaded 7 active products with working price and fabric filters.
3. **Product Detail & Variants:** Tested "Áo dài cách tân hoa nhí mùa xuân" (450.000₫); variant pills (S, M, L, XL) and add to cart active.
4. **Admin Authentication:** Secure session routing verified; protected routes redirect unauthenticated users to `/admin/login`.
5. **Admin Products 2-Column Form:** Verified 2fr:1fr desktop layout, sticky action bar, Cloudinary uploader, and variant matrix.
- **Evidence Screenshot:** `browser_evidence/9582efd4-c515-4f6a-84dd-891834c72b35/final_step_39.png`.

---

## 6. GITHUB & VERCEL DEPLOYMENT STATUS

- **GitHub Repository:** https://github.com/nguyenxuanquang230504-design/thanhson-store
- **Branch:** `main`
- **Release Commit:** `960b638` (`feat(admin): resilient product image upload with data-url fallback and signature validation`)
- **Vercel Deployment ID:** `dpl_6Y3qTtTyqmMrBFdjyd7w7UpBSxKb`
- **Production Alias:** https://thanhson-store.vercel.app
- **Deployment State:** `● Ready` (Serverless Function: `server.js` 5.7MB, Node.js 20)
