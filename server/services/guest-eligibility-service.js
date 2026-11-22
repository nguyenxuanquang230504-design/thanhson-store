const Customer = require('../models/customer');
const Order = require('../models/order');
const ExportJob = require('../models/export-job');

function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\s+/g, '').replace(/^\+84/, '0');
}

/**
 * Determine guest customer eligibility for archival export.
 * Reusable service implementing all criteria from Master Mission Section 3.
 */
async function get_eligible_guest_customers() {
  // 1. Fetch all registered customers to strictly exclude them
  const registeredCustomers = await Customer.find().select('_id username phone email').lean();
  const registeredPhones = new Set(registeredCustomers.map(c => normalizePhone(c.phone)).filter(Boolean));
  const registeredIds = new Set(registeredCustomers.map(c => String(c._id)));

  // 2. Fetch all orders from MongoDB Atlas
  const allOrders = await Order.find().sort({ createdAt: -1 }).lean();

  // 3. Group orders by guest customer phone number
  const guestGroups = new Map(); // phone -> { customer, orders: [] }
  let registeredOrdersCount = 0;

  for (const order of allOrders) {
    const rawPhone = order.customer?.phone || '';
    const cleanPhone = normalizePhone(rawPhone);
    const orderCustomerId = String(order.customerId || '');

    // Check if this order is from a registered customer
    const isRegistered = (orderCustomerId && registeredIds.has(orderCustomerId)) ||
                         (cleanPhone && registeredPhones.has(cleanPhone));

    if (isRegistered) {
      registeredOrdersCount += 1;
      continue; // Exclude registered customer orders completely
    }

    if (!cleanPhone) {
      // Order without phone cannot be uniquely grouped as a guest customer
      continue;
    }

    if (!guestGroups.has(cleanPhone)) {
      guestGroups.set(cleanPhone, {
        customerId: `GUEST_${cleanPhone}`,
        customerType: 'GUEST',
        customerName: order.customer?.customerName || 'Khách vãng lai',
        phone: cleanPhone,
        email: order.customer?.email || order.user?.email || '',
        address: order.customer?.address || '',
        createdDate: order.createdAt,
        orders: []
      });
    }

    const group = guestGroups.get(cleanPhone);
    group.orders.push(order);
    // Keep earliest creation date
    if (new Date(order.createdAt) < new Date(group.createdDate)) {
      group.createdDate = order.createdAt;
    }
    // Update name/address from most recent order if empty
    if (!group.address && order.customer?.address) group.address = order.customer.address;
    if ((!group.customerName || group.customerName === 'Khách vãng lai') && order.customer?.customerName) {
      group.customerName = order.customer.customerName;
    }
    if (!group.email && (order.customer?.email || order.user?.email)) {
      group.email = order.customer?.email || order.user?.email;
    }
  }

  // 4. Evaluate eligibility for each guest customer
  const eligible = [];
  const ineligible = [];
  let associatedEligibleOrdersCount = 0;

  for (const [phone, guest] of guestGroups.entries()) {
    const orders = guest.orders;
    let isCustomerEligible = true;
    const exclusionReasons = [];
    const relatedOrderIds = orders.map(o => o.id);

    // Rule: Must evaluate ALL associated orders. If even ONE is unresolved, customer is ineligible.
    for (const order of orders) {
      // Rule 1: Delivery Status
      const isDelivered = order.status === 'delivered' || order.status === 'completed';
      if (!isDelivered) {
        isCustomerEligible = false;
        const statusMap = {
          pending: 'Chờ tiếp nhận',
          confirmed: 'Đã xác nhận',
          processing: 'Đang chuẩn bị',
          shipped: 'Đang giao hàng',
          cancelled: 'Đã hủy',
          failed: 'Thất bại'
        };
        exclusionReasons.push(`Đơn ${order.id} chưa hoàn tất giao hàng (Trạng thái: ${statusMap[order.status] || order.status})`);
      }

      // Rule 2: Payment Status
      const isPaid = order.paymentStatus === 'paid';
      if (!isPaid) {
        isCustomerEligible = false;
        exclusionReasons.push(`Đơn ${order.id} chưa hoàn tất thanh toán (Thanh toán: ${order.paymentStatus || 'chưa rõ'})`);
      }

      // Rule 3: No unresolved dispute, return, or refund
      if (order.status === 'cancelled' || order.status === 'failed' || order.paymentStatus === 'refunded') {
        isCustomerEligible = false;
        exclusionReasons.push(`Đơn ${order.id} bị hủy, thất bại hoặc có giao dịch hoàn tiền`);
      }

      // Extract verified delivery date from statusHistory
      let deliveryDate = null;
      if (Array.isArray(order.statusHistory)) {
        const deliveredEvent = order.statusHistory.find(e => e.status === 'delivered' || e.status === 'completed');
        if (deliveredEvent && deliveredEvent.changedAt) {
          deliveryDate = new Date(deliveredEvent.changedAt);
        }
      }
      if (!deliveryDate && isDelivered) {
        deliveryDate = new Date(order.updatedAt || order.createdAt);
      }
      order.verifiedDeliveryDate = deliveryDate;
    }

    if (isCustomerEligible && orders.length > 0) {
      eligible.push({
        ...guest,
        eligibilityStatus: 'ELIGIBLE',
        relatedOrderIds,
        orders
      });
      associatedEligibleOrdersCount += orders.length;
    } else {
      ineligible.push({
        ...guest,
        eligibilityStatus: 'INELIGIBLE',
        relatedOrderIds,
        reason: exclusionReasons.join('; ') || 'Không thỏa điều kiện lưu trữ',
        orders
      });
    }
  }

  // 5. Fetch export job statistics
  const [successfulExports, failedExports] = await Promise.all([
    ExportJob.countDocuments({ status: { $in: ['COMPLETED', 'DOWNLOAD_READY', 'DOWNLOAD_INITIATED'] } }),
    ExportJob.countDocuments({ status: 'FAILED' })
  ]);

  const summary = {
    totalRegisteredCustomers: registeredCustomers.length,
    totalGuestCustomers: guestGroups.size,
    eligibleGuestCustomers: eligible.length,
    ineligibleGuestCustomers: ineligible.length,
    associatedEligibleOrders: associatedEligibleOrdersCount,
    totalSuccessfulExports: successfulExports,
    totalFailedExports: failedExports
  };

  return {
    summary,
    eligible,
    ineligible
  };
}

module.exports = {
  get_eligible_guest_customers,
  getEligibleGuestCustomers: get_eligible_guest_customers,
  normalizePhone
};
