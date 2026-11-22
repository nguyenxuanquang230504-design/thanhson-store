const ExcelJS = require('exceljs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/**
 * Formula injection sanitizer.
 * Neutralize dangerous spreadsheet formulas (=, +, -, @)
 */
function sanitizeFormula(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/^[=\+\-@]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1C1C1A' } // Dark luxury theme
};

const HEADER_FONT = {
  name: 'Segoe UI',
  size: 11,
  bold: true,
  color: { argb: 'FFFFFFFF' }
};

const BORDER_THIN = {
  top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
};

/**
 * Generate a complete 4-sheet XLSX workbook for eligible guest customers.
 * @param {Array} eligibleGuests - Array of eligible guest customer objects with their orders
 * @param {Object} metadata - Job metadata (adminEmail, adminRole, jobId)
 * @returns {Promise<{ buffer: Buffer, filename: string, sha256: string, customerCount: number, orderCount: number, itemCount: number, totalRevenue: number }>}
 */
async function generateGuestArchiveWorkbook(eligibleGuests = [], metadata = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Thanh Son Fashion Atelier - Admin Data Center';
  workbook.lastModifiedBy = metadata.adminEmail || 'Admin';
  workbook.created = new Date();
  workbook.modified = new Date();

  let totalItemCount = 0;
  let totalOrderCount = 0;
  let totalArchivedRevenue = 0;

  // ==========================================
  // SHEET 1: Customers
  // ==========================================
  const wsCustomers = workbook.addWorksheet('Customers', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  wsCustomers.columns = [
    { header: 'Mã khách vãng lai (Customer ID)', key: 'customerId', width: 28 },
    { header: 'Tên khách hàng', key: 'customerName', width: 24 },
    { header: 'Số điện thoại', key: 'phone', width: 16 },
    { header: 'Email liên hệ', key: 'email', width: 26 },
    { header: 'Địa chỉ giao hàng', key: 'address', width: 38 },
    { header: 'Loại khách hàng', key: 'customerType', width: 18 },
    { header: 'Tổng số đơn hàng', key: 'orderCount', width: 18 },
    { header: 'Tổng chi tiêu (VNĐ)', key: 'totalSpend', width: 22 },
    { header: 'Đơn hàng đầu tiên', key: 'firstOrderDate', width: 22 },
    { header: 'Đơn hàng gần nhất', key: 'lastOrderDate', width: 22 },
    { header: 'Trạng thái điều kiện', key: 'eligibilityStatus', width: 22 }
  ];

  eligibleGuests.forEach(guest => {
    const orders = guest.orders || [];
    totalOrderCount += orders.length;

    let guestSpend = 0;
    let earliest = null;
    let latest = null;

    orders.forEach(o => {
      const amt = Number(o.totalAmount || 0);
      guestSpend += amt;
      totalArchivedRevenue += amt;
      const d = new Date(o.createdAt);
      if (!earliest || d < earliest) earliest = d;
      if (!latest || d > latest) latest = d;
    });

    const row = wsCustomers.addRow({
      customerId: sanitizeFormula(guest.customerId),
      customerName: sanitizeFormula(guest.customerName),
      phone: sanitizeFormula(guest.phone),
      email: sanitizeFormula(guest.email || '—'),
      address: sanitizeFormula(guest.address || '—'),
      customerType: 'Khách vãng lai',
      orderCount: orders.length,
      totalSpend: guestSpend,
      firstOrderDate: formatDate(earliest),
      lastOrderDate: formatDate(latest),
      eligibilityStatus: 'Đủ điều kiện lưu trữ'
    });

    row.getCell('totalSpend').numFmt = '#,##0" ₫"';
  });

  // ==========================================
  // SHEET 2: Orders
  // ==========================================
  const wsOrders = workbook.addWorksheet('Orders', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  wsOrders.columns = [
    { header: 'Mã đơn hàng (Order ID)', key: 'orderId', width: 26 },
    { header: 'Mã khách hàng (Customer ID)', key: 'customerId', width: 26 },
    { header: 'Tên khách hàng', key: 'customerName', width: 22 },
    { header: 'Số điện thoại', key: 'phone', width: 16 },
    { header: 'Địa chỉ nhận hàng', key: 'address', width: 36 },
    { header: 'Ngày đặt hàng', key: 'orderDate', width: 22 },
    { header: 'Ngày giao thành công', key: 'deliveredDate', width: 22 },
    { header: 'Trạng thái giao hàng', key: 'status', width: 22 },
    { header: 'Trạng thái thanh toán', key: 'paymentStatus', width: 22 },
    { header: 'Phương thức thanh toán', key: 'paymentMethod', width: 24 },
    { header: 'Số lượng sản phẩm', key: 'itemQty', width: 20 },
    { header: 'Tổng tiền (VNĐ)', key: 'totalAmount', width: 22 },
    { header: 'Phí vận chuyển (VNĐ)', key: 'shippingFee', width: 22 },
    { header: 'Ghi chú đơn hàng', key: 'notes', width: 30 }
  ];

  eligibleGuests.forEach(guest => {
    (guest.orders || []).forEach(order => {
      const items = order.items || [];
      const totalUnits = items.reduce((sum, item) => sum + Number(item.qty || 1), 0);
      const paymentMethodMap = {
        bank_transfer: 'Chuyển khoản VietQR',
        cod: 'COD (Thu hộ tiền mặt)'
      };

      const row = wsOrders.addRow({
        orderId: sanitizeFormula(order.id),
        customerId: sanitizeFormula(guest.customerId),
        customerName: sanitizeFormula(order.customer?.customerName || guest.customerName),
        phone: sanitizeFormula(order.customer?.phone || guest.phone),
        address: sanitizeFormula(order.customer?.address || guest.address),
        orderDate: formatDate(order.createdAt),
        deliveredDate: formatDate(order.verifiedDeliveryDate || order.updatedAt),
        status: 'Đã giao thành công',
        paymentStatus: 'Đã thanh toán',
        paymentMethod: paymentMethodMap[order.paymentMethod] || order.paymentMethod,
        itemQty: totalUnits,
        totalAmount: Number(order.totalAmount || 0),
        shippingFee: Number(order.pricing?.shippingFee || 0),
        notes: sanitizeFormula(order.customer?.notes || order.payment?.transferNote || '—')
      });

      row.getCell('totalAmount').numFmt = '#,##0" ₫"';
      row.getCell('shippingFee').numFmt = '#,##0" ₫"';
    });
  });

  // ==========================================
  // SHEET 3: Order_Items
  // ==========================================
  const wsItems = workbook.addWorksheet('Order_Items', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  wsItems.columns = [
    { header: 'Mã đơn hàng (Order ID)', key: 'orderId', width: 26 },
    { header: 'Mã sản phẩm (Product ID)', key: 'productId', width: 26 },
    { header: 'Tên sản phẩm Áo dài', key: 'name', width: 34 },
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Kích cỡ (Size)', key: 'size', width: 14 },
    { header: 'Màu sắc / Phân loại', key: 'color', width: 20 },
    { header: 'Số lượng đặt', key: 'qty', width: 14 },
    { header: 'Đơn giá (VNĐ)', key: 'price', width: 18 },
    { header: 'Thành tiền (VNĐ)', key: 'subtotal', width: 20 }
  ];

  eligibleGuests.forEach(guest => {
    (guest.orders || []).forEach(order => {
      (order.items || []).forEach(item => {
        totalItemCount += 1;
        const row = wsItems.addRow({
          orderId: sanitizeFormula(order.id),
          productId: sanitizeFormula(String(item.productId || '')),
          name: sanitizeFormula(item.name || 'Áo dài cách tân'),
          sku: sanitizeFormula(item.sku || '—'),
          size: sanitizeFormula(item.size || 'Freesize'),
          color: sanitizeFormula(item.color || 'Mặc định'),
          qty: Number(item.qty || 1),
          price: Number(item.price || 0),
          subtotal: Number(item.subtotal || (Number(item.price || 0) * Number(item.qty || 1)))
        });

        row.getCell('price').numFmt = '#,##0" ₫"';
        row.getCell('subtotal').numFmt = '#,##0" ₫"';
      });
    });
  });

  // ==========================================
  // SHEET 4: Archive_Log
  // ==========================================
  const wsLog = workbook.addWorksheet('Archive_Log', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  wsLog.columns = [
    { header: 'Thuộc tính kiểm toán (Audit Property)', key: 'property', width: 34 },
    { header: 'Giá trị xác nhận (Verified Value)', key: 'value', width: 60 }
  ];

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const timestampStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `ThanhSonStore_GuestArchive_${timestampStr}.xlsx`;

  // Apply styling and auto-filters across all sheets
  [wsCustomers, wsOrders, wsItems, wsLog].forEach(ws => {
    const headerRow = ws.getRow(1);
    headerRow.fill = HEADER_FILL;
    headerRow.font = HEADER_FONT;
    headerRow.height = 28;
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Set auto-filter for data sheets
    if (ws !== wsLog) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: ws.columns.length }
      };
    }

    // Set borders and cell alignment for all data rows
    ws.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell(cell => {
          cell.border = BORDER_THIN;
          if (!cell.alignment) {
            cell.alignment = { vertical: 'middle' };
          }
        });
      }
    });
  });

  // Write log entries (preliminary before checksum)
  const auditEntries = [
    { property: 'Mã phiên xuất (Job ID)', value: metadata.jobId || `JOB_${Date.now()}` },
    { property: 'Thời điểm tạo tệp lưu trữ (UTC+7)', value: formatDate(now) },
    { property: 'Tên tệp Excel chuẩn', value: filename },
    { property: 'Quản trị viên thực hiện', value: `${metadata.adminEmail || 'admin@thanhson.local'} (${metadata.adminRole || 'SUPER_ADMIN'})` },
    { property: 'Phạm vi xuất dữ liệu', value: 'Chỉ khách vãng lai đủ điều kiện (Eligible Guests Only)' },
    { property: 'Tổng số khách vãng lai đủ điều kiện', value: String(eligibleGuests.length) },
    { property: 'Tổng số đơn hàng liên quan được lưu trữ', value: String(totalOrderCount) },
    { property: 'Tổng số dòng sản phẩm (Line Items)', value: String(totalItemCount) },
    { property: 'Tổng giá trị đơn hàng lưu trữ', value: `${totalArchivedRevenue.toLocaleString('vi-VN')} VNĐ` },
    { property: 'Tình trạng cơ sở dữ liệu MongoDB', value: 'Dữ liệu gốc được bảo toàn 100% (Không xóa, không ẩn danh)' },
    { property: 'Tiêu chuẩn bảo mật', value: 'Ngăn chặn Formula Injection; Định dạng số VNĐ; Khóa tiêu đề (Freeze Pane)' },
    { property: 'Mã băm SHA-256 (Checksum)', value: 'COMPUTING...' }
  ];

  auditEntries.forEach(item => {
    const r = wsLog.addRow(item);
    r.getCell('property').font = { bold: true, name: 'Segoe UI' };
  });

  // Generate buffer
  const initialBuffer = await workbook.xlsx.writeBuffer();

  // Compute SHA-256
  const sha256 = crypto.createHash('sha256').update(initialBuffer).digest('hex');

  // Update checksum in wsLog
  const lastRow = wsLog.lastRow;
  if (lastRow) {
    lastRow.getCell('value').value = sha256;
  }

  // Re-render buffer with final checksum included
  const finalBuffer = await workbook.xlsx.writeBuffer();
  const finalSha256 = crypto.createHash('sha256').update(finalBuffer).digest('hex');

  return {
    buffer: finalBuffer,
    filename,
    sha256: finalSha256,
    customerCount: eligibleGuests.length,
    orderCount: totalOrderCount,
    itemCount: totalItemCount,
    totalRevenue: totalArchivedRevenue
  };
}

/**
 * Validate that an Excel buffer is readable and meets integrity standards.
 */
async function validateWorkbookBuffer(buffer) {
  const testWb = new ExcelJS.Workbook();
  await testWb.xlsx.load(buffer);
  const sheetNames = testWb.worksheets.map(ws => ws.name);
  const required = ['Customers', 'Orders', 'Order_Items', 'Archive_Log'];
  const missing = required.filter(r => !sheetNames.includes(r));
  if (missing.length > 0) {
    throw new Error(`Tệp Excel thiếu các trang tính bắt buộc: ${missing.join(', ')}`);
  }
  return {
    valid: true,
    sheetNames,
    customersRows: testWb.getWorksheet('Customers').rowCount,
    ordersRows: testWb.getWorksheet('Orders').rowCount,
    itemsRows: testWb.getWorksheet('Order_Items').rowCount
  };
}

module.exports = {
  generateGuestArchiveWorkbook,
  validateWorkbookBuffer,
  sanitizeFormula
};
