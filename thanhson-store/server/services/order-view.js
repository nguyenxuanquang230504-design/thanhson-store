const orderStatusLabels = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  processing: 'Đang chuẩn bị hàng',
  shipped: 'Đang giao hàng',
  delivered: 'Đã giao hàng',
  cancelled: 'Đã hủy',
  failed: 'Đặt hàng thất bại',
  completed: 'Đã giao hàng'
};

const paymentStatusLabels = {
  pending: 'Chờ thanh toán',
  paid: 'Đã thanh toán',
  unpaid: 'Thanh toán khi nhận hàng',
  failed: 'Thanh toán thất bại',
  expired: 'Đã hết hạn thanh toán',
  cancelled: 'Đã hủy'
};

const timelineLabels = {
  pending: 'Đã tiếp nhận đơn',
  confirmed: 'Đã xác nhận',
  processing: 'Đang chuẩn bị hàng',
  shipped: 'Đang giao hàng',
  delivered: 'Đã giao thành công',
  cancelled: 'Đơn hàng đã hủy',
  failed: 'Đơn hàng không thành công'
};

function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function timeline(order, paymentStatus, paymentMethod) {
  const orderHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const paymentHistory = Array.isArray(order.paymentHistory) ? order.paymentHistory : [];
  const events = orderHistory.map(event => ({
    kind: 'order',
    status: event.status,
    at: dateValue(event.changedAt || (event.status === 'pending' ? order.createdAt : null))
  }));
  if (paymentMethod === 'bank_transfer') {
    events.push(...paymentHistory
      .filter(event => event.status !== 'unpaid')
      .map(event => ({ kind: 'payment', status: event.status, at: dateValue(event.changedAt) })));
  }
  if (!events.some(event => event.kind === 'order' && event.status === 'pending')) {
    events.push({ kind: 'order', status: 'pending', at: dateValue(order.createdAt) });
  }
  events.sort((left, right) => (left.at ? Date.parse(left.at) : 0) - (right.at ? Date.parse(right.at) : 0));

  const currentEvent = paymentMethod === 'bank_transfer' && paymentStatus === 'pending'
    ? events.find(event => event.kind === 'payment' && event.status === 'pending')
    : events.slice().reverse().find(event => event.kind === 'order' && event.status === order.status);
  const result = events.map(event => ({
    label: event.kind === 'payment'
      ? paymentStatusLabels[event.status] || paymentStatusLabels.pending
      : event.status === 'pending' && paymentMethod === 'bank_transfer' && paymentStatus === 'pending'
        ? 'Đã tiếp nhận đơn'
        : event.status === 'pending' ? 'Chờ shop xác nhận' : timelineLabels[event.status],
    at: event.at,
    complete: event !== currentEvent,
    current: event === currentEvent
  }));
  if (paymentMethod === 'bank_transfer' && paymentStatus === 'pending' && !currentEvent) {
    result.push({ label: paymentStatusLabels.pending, at: null, complete: false, current: true });
  }
  return result.filter(step => step.label);
}

function toCustomerOrder(order, { paymentQrUrl = '' } = {}) {
  const method = order.paymentMethod === 'cod' ? 'cod' : 'bank_transfer';
  const paymentStatus = paymentStatusLabels[order.paymentStatus] ? order.paymentStatus : method === 'cod' ? 'unpaid' : 'pending';
  const normalizedOrderStatus = order.status === 'completed' ? 'delivered' : order.status;
  const status = orderStatusLabels[normalizedOrderStatus] ? normalizedOrderStatus : 'pending';
  const items = (order.items || []).map(item => ({
    name: String(item.name || ''),
    image: String(item.image || ''),
    sku: String(item.sku || ''),
    size: String(item.size || ''),
    color: String(item.color || ''),
    quantity: Number(item.qty || 0),
    unitPrice: Number(item.price || 0),
    subtotal: Number(item.subtotal || 0)
  }));
  const subtotal = Number(order.pricing?.subtotal ?? order.totalAmount ?? 0);
  const discountAmount = Number(order.pricing?.discountAmount || 0);
  const shippingFee = Number(order.pricing?.shippingFee || 0);

  return {
    reference: String(order.id || ''),
    createdAt: dateValue(order.createdAt),
    statusLabel: orderStatusLabels[status],
    statusTone: ['cancelled', 'failed'].includes(status) ? 'error' : ['delivered', 'completed'].includes(status) ? 'success' : 'pending',
    confirmationMessage: status === 'cancelled'
      ? 'Đơn hàng đã được hủy. Vui lòng liên hệ shop nếu bạn cần hỗ trợ.'
      : status === 'failed'
        ? 'Đơn hàng không thể hoàn tất. Vui lòng liên hệ shop để được hỗ trợ.'
        : paymentStatus === 'paid'
      ? 'Đơn hàng đã được tiếp nhận và thanh toán đã được xác nhận.'
      : method === 'cod'
        ? 'Đơn hàng đã được tiếp nhận. Bạn sẽ thanh toán khi nhận hàng.'
        : 'Đơn hàng đã được tiếp nhận. Vui lòng thanh toán để shop tiến hành xác nhận.',
    customer: {
      name: String(order.customer?.customerName || ''),
      phone: String(order.customer?.phone || ''),
      address: String(order.customer?.address || ''),
      notes: String(order.customer?.notes || '')
    },
    items,
    totals: {
      subtotal,
      discountAmount,
      shippingFee,
      total: Number(order.totalAmount ?? order.pricing?.totalAmount ?? 0)
    },
    payment: {
      method,
      methodLabel: method === 'cod' ? 'Thanh toán khi nhận hàng' : 'Chuyển khoản ngân hàng',
      statusLabel: paymentStatusLabels[paymentStatus],
      amount: Number(order.totalAmount ?? order.pricing?.totalAmount ?? 0),
      bankId: method === 'bank_transfer' ? String(order.payment?.bankId || '') : '',
      accountNo: method === 'bank_transfer' ? String(order.payment?.accountNo || '') : '',
      accountName: method === 'bank_transfer' ? String(order.payment?.accountName || '') : '',
      transferDescription: method === 'bank_transfer' ? String(order.payment?.transferNote || '') : '',
      qrUrl: method === 'bank_transfer' && paymentStatus === 'pending' && !['cancelled', 'failed'].includes(status) ? paymentQrUrl : '',
      expiresAt: method === 'bank_transfer' && paymentStatus === 'pending' && !['cancelled', 'failed'].includes(status) ? dateValue(order.paymentExpiresAt) : null,
      instruction: method === 'bank_transfer' ? 'Vui lòng chuyển đúng số tiền và nội dung thanh toán của đơn hàng.' : ''
    },
    timeline: timeline({ ...order, status }, paymentStatus, method)
  };
}

module.exports = { toCustomerOrder, orderStatusLabels, paymentStatusLabels };
