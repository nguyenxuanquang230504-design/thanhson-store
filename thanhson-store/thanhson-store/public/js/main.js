async function api(path, method = 'GET', data) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (data) opt.body = JSON.stringify(data);
  const res = await fetch(path, opt);
  if (!res.ok) throw new Error(await res.text());
  return res.json().catch(() => ({}));
}

async function refreshBadges() {
  try {
    const cart = await api('/api/cart');
    const wl = await api('/api/wishlist');
    const cartBadge = document.querySelector('[data-badge="cart"]');
    const wlBadge = document.querySelector('[data-badge="wishlist"]');
    if (cartBadge) cartBadge.textContent = cart.totalQty ?? 0;
    if (wlBadge) wlBadge.textContent = wl.total ?? 0;
    // Cập nhật tổng trên trang giỏ hàng (nếu có)
    const totalEl = document.getElementById('cart-total');
    if (totalEl && cart.totalAmount != null) {
      totalEl.textContent = cart.totalAmount.toLocaleString() + ' ₫';
    }
  } catch (e) { /* ignore */ }
}

document.addEventListener('click', async (e) => {
  const add = e.target.closest('.js-add');
  const like = e.target.closest('.js-like');

  // Add to cart
  if (add) {
    const id = add.dataset.id;
    await api('/api/cart/add', 'POST', { id, qty: 1 });
    await refreshBadges();

    // Nếu đang ở trang giỏ hàng: cập nhật hàng tương ứng
    const row = document.querySelector(`tr[data-id="${id}"]`);
    if (row) {
      const qtyInput = row.querySelector('.qty-input');
      if (qtyInput) qtyInput.value = Number(qtyInput.value || 1) + 1;
      // Trigger update subtotal
      qtyInput && qtyInput.dispatchEvent(new Event('change'));
    }
  }

  // Toggle wishlist
  if (like) {
    const id = like.dataset.id;
    await api('/api/wishlist/toggle', 'POST', { id });
    await refreshBadges();
  }

  // Cart page controls
  const dec = e.target.closest('.js-dec');
  const inc = e.target.closest('.js-inc');
  const rmv = e.target.closest('.js-remove');

  if (dec || inc) {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    const input = tr.querySelector('.qty-input');
    let val = Number(input.value || 1);
    val = dec ? Math.max(1, val - 1) : val + 1;
    input.value = val;
    await api('/api/cart/update', 'POST', { id, qty: val });
    await updateRowSubtotal(tr, id);
  }

  if (rmv) {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    await api('/api/cart/remove', 'POST', { id });
    tr.remove();
    await refreshBadges();
  }
});

document.addEventListener('change', async (e) => {
  const input = e.target.closest('.qty-input');
  if (input) {
    const tr = input.closest('tr[data-id]');
    const id = tr.dataset.id;
    let val = Math.max(1, Number(input.value || 1));
    input.value = val;
    await api('/api/cart/update', 'POST', { id, qty: val });
    await updateRowSubtotal(tr, id);
  }
});

async function updateRowSubtotal(tr, id) {
  const cart = await api('/api/cart');
  const found = cart.items.find(x => x.id === id);
  const td = tr.querySelector('.subtotal');
  if (found && td) td.textContent = found.subtotal.toLocaleString() + ' ₫';
  await refreshBadges();
}

document.addEventListener('DOMContentLoaded', refreshBadges);
