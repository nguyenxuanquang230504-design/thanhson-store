async function api(path, method = 'GET', data) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (data) opt.body = JSON.stringify(data);
  const res = await fetch(path, opt);
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.message || 'Yêu cầu không thành công.');
  return result;
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
  } catch (error) {
    console.error('Could not refresh cart and wishlist counts.', error);
  }
}

document.addEventListener('click', async (e) => {
  const add = e.target.closest('.js-add');
  const like = e.target.closest('.js-like');

  // Add to cart
  if (add) {
    return;
  }

  // Toggle wishlist
  if (like) {
    if (like.disabled) return;
    const id = like.dataset.id;
    like.disabled = true;
    try {
      const result = await api('/api/wishlist/toggle', 'POST', { id });
      await refreshBadges();
      like.setAttribute('aria-pressed', String(result.added));
      like.classList.toggle('is-active', result.added);
      const label = like.querySelector('span');
      if (label) label.textContent = result.added ? 'Đã yêu thích' : 'Thêm yêu thích';
      showToast(result.added ? 'Đã thêm vào danh sách yêu thích.' : 'Đã xóa khỏi danh sách yêu thích.');
    } catch (error) {
      showToast(error.message || 'Không thể cập nhật yêu thích. Vui lòng thử lại.');
    } finally {
      like.disabled = false;
    }
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
    const maxQty = Number(input.max || 0);
    if (maxQty < 1) {
      showToast('Sản phẩm đã hết hàng. Bạn có thể xóa sản phẩm khỏi giỏ.');
      return;
    }
    let val = Number(input.value || 1);
    val = dec ? Math.min(maxQty, Math.max(1, val - 1)) : Math.min(maxQty, val + 1);
    input.value = val;
    try {
      await api('/api/cart/update', 'POST', { id, variantId: tr.dataset.variantId || '', qty: val });
      await updateRowSubtotal(tr, id);
    } catch (error) {
      showToast(error.message || 'Không thể cập nhật số lượng. Vui lòng thử lại.');
    }
  }

  if (rmv) {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    try {
      await api('/api/cart/remove', 'POST', { id, variantId: tr.dataset.variantId || '' });
      tr.remove();
      await refreshBadges();
    } catch (error) {
      showToast(error.message || 'Không thể xóa sản phẩm. Vui lòng thử lại.');
    }
  }
});

document.addEventListener('change', async (e) => {
  const input = e.target.closest('.qty-input');
  if (input) {
    const tr = input.closest('tr[data-id]');
    const id = tr.dataset.id;
    const maxQty = Number(input.max || 0);
    if (maxQty < 1) return showToast('Sản phẩm đã hết hàng. Bạn có thể xóa sản phẩm khỏi giỏ.');
    let val = Math.min(maxQty, Math.max(1, Number(input.value || 1)));
    input.value = val;
    try {
      await api('/api/cart/update', 'POST', { id, variantId: tr.dataset.variantId || '', qty: val });
      await updateRowSubtotal(tr, id);
    } catch (error) {
      showToast(error.message || 'Không thể cập nhật số lượng. Vui lòng thử lại.');
    }
  }
});

async function updateRowSubtotal(tr, id) {
  const cart = await api('/api/cart');
  const found = cart.items.find(x => x.id === id && String(x.variantId || '') === String(tr.dataset.variantId || ''));
  const td = tr.querySelector('.subtotal');
  if (found && td) td.textContent = found.subtotal.toLocaleString() + ' ₫';
  if (found) {
    const input = tr.querySelector('.qty-input');
    const buttons = tr.querySelectorAll('.qty-btn');
    if (input) input.max = found.availableStock;
    if (buttons[0]) buttons[0].disabled = found.qty <= 1;
    if (buttons[1]) buttons[1].disabled = found.qty >= found.availableStock;
  }
  await refreshBadges();
}

document.addEventListener('DOMContentLoaded', refreshBadges);

function showToast(message) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

document.addEventListener('DOMContentLoaded', () => {
  const dropdown = document.querySelector('.tsf-dropdown');
  const trigger = document.querySelector('.mega-trigger');
  const menuToggle = document.querySelector('.menu-toggle');
  const mobileNavOverlay = document.getElementById('mobileMenuOverlay') || document.querySelector('.mobile-nav-overlay') || document.querySelector('.mobile-menu');
  const mobileNavClose = document.querySelector('.mobile-nav-close');
  const mobileNavDialog = document.querySelector('.mobile-nav-dialog');

  function openMobileMenu() {
    if (!mobileNavOverlay) return;
    mobileNavOverlay.classList.add('open');
    mobileNavOverlay.setAttribute('aria-hidden', 'false');
    mobileNavOverlay.inert = false;
    document.body.classList.add('menu-open');
    menuToggle?.setAttribute('aria-expanded', 'true');
    menuToggle?.setAttribute('aria-label', 'Đóng menu');
    const firstFocusable = mobileNavClose || mobileNavOverlay.querySelector('a');
    firstFocusable?.focus();
  }

  function closeMobileMenu() {
    if (!mobileNavOverlay) return;
    mobileNavOverlay.classList.remove('open');
    mobileNavOverlay.setAttribute('aria-hidden', 'true');
    mobileNavOverlay.inert = true;
    document.body.classList.remove('menu-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
    menuToggle?.setAttribute('aria-label', 'Mở menu');
    menuToggle?.focus();
  }

  trigger?.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = dropdown.classList.toggle('open');
    trigger.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', (event) => {
    if (dropdown && !dropdown.contains(event.target)) {
      dropdown.classList.remove('open');
      trigger?.setAttribute('aria-expanded', 'false');
    }
  });

  menuToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (mobileNavOverlay?.classList.contains('open')) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });

  mobileNavClose?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMobileMenu();
  });

  mobileNavOverlay?.addEventListener('click', (event) => {
    // If clicked on backdrop (outside dialog) or on a link inside
    if (event.target.closest('a')) {
      closeMobileMenu();
    } else if (mobileNavDialog && !mobileNavDialog.contains(event.target)) {
      closeMobileMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      dropdown?.classList.remove('open');
      trigger?.setAttribute('aria-expanded', 'false');
      if (mobileNavOverlay?.classList.contains('open')) {
        closeMobileMenu();
      }
    }
  });

  const filterToggle = document.querySelector('.filter-toggle');
  const filterSidebar = document.querySelector('.filter-sidebar');
  filterToggle?.addEventListener('click', () => {
    const open = filterSidebar.classList.toggle('open');
    filterToggle.setAttribute('aria-expanded', String(open));
  });

  const priceWidget = document.querySelector('.price-range-widget');
  if (priceWidget) {
    const minField = document.getElementById('minPrice');
    const maxField = document.getElementById('maxPrice');
    const minRange = document.getElementById('minPriceRange');
    const maxRange = document.getElementById('maxPriceRange');
    const fill = priceWidget.querySelector('.price-range-fill');
    const error = document.getElementById('priceRangeError');
    const summary = document.getElementById('activePriceRange');
    const actualMax = Number(priceWidget.dataset.max || 0);
    const sliderMax = Number(maxRange.max || 0);
    const formatter = new Intl.NumberFormat('vi-VN');

    function setError(message) {
      error.textContent = message;
      minField.setAttribute('aria-invalid', message ? 'true' : 'false');
      maxField.setAttribute('aria-invalid', message ? 'true' : 'false');
    }

    function amountFrom(field, fallback) {
      const digits = field.value.replace(/\D/g, '');
      return digits ? Math.min(Number(digits), actualMax) : fallback;
    }

    function updateRange(preserveField = null) {
      let minimum = Math.min(Number(minRange.value) || 0, actualMax);
      let maximum = Math.min(Number(maxRange.value) || 0, actualMax);
      if (minimum > maximum) {
        if (document.activeElement === minRange) maximum = minimum;
        else minimum = maximum;
      }
      minRange.value = String(minimum);
      maxRange.value = String(maximum);
      if (preserveField !== minField) minField.value = minimum > 0 ? formatter.format(minimum) : '';
      if (preserveField !== maxField) maxField.value = maximum < actualMax ? formatter.format(maximum) : '';
      const left = actualMax ? minimum / actualMax * 100 : 0;
      const right = actualMax ? maximum / actualMax * 100 : 100;
      fill.style.left = `${left}%`;
      fill.style.width = `${Math.max(0, right - left)}%`;
      summary.textContent = `Đang lọc: ${formatter.format(minimum)} ₫ – ${formatter.format(maximum)} ₫`;
      summary.hidden = minimum === 0 && maximum === actualMax;
      setError('');
    }

    function updateFromField(field) {
      const before = field.value;
      const allowed = before.replace(/[0-9.,\s₫]/g, '');
      const digitsBeforeCaret = before.slice(0, field.selectionStart || 0).replace(/\D/g, '').length;
      const digits = before.replace(/\D/g, '');
      const enteredAmount = digits ? Number(digits) : null;
      const typed = enteredAmount == null ? null : Math.min(enteredAmount, actualMax);
      field.value = typed == null ? '' : String(typed);
      const caret = Math.min(field.value.length, digitsBeforeCaret);

      if (allowed || before.includes('-')) {
        setError(before.includes('-') ? 'Giá không được âm.' : 'Chỉ nhập chữ số và dấu phân cách hàng nghìn.');
      } else {
        setError('');
      }
      if (before.includes('-')) {
        field.value = '0';
        if (field === minField) minRange.value = '0';
        else maxRange.value = '0';
      } else if (typed == null) {
        if (field === minField) minRange.value = '0';
        else maxRange.value = String(sliderMax);
      } else if (field === minField) {
        minRange.value = String(typed);
        if (typed > Number(maxRange.value)) maxRange.value = String(typed);
      } else {
        maxRange.value = String(typed);
        if (typed < Number(minRange.value)) minRange.value = String(typed);
      }
      updateRange(field);
      field.setSelectionRange(caret, caret);
      if (before.includes('-')) setError('Giá không được âm.');
      else if (allowed) setError('Chỉ nhập chữ số và dấu phân cách hàng nghìn.');
      else if (enteredAmount != null && enteredAmount > actualMax) setError(`Giá đã được giới hạn ở ${formatter.format(actualMax)} ₫.`);
    }

    for (const range of [minRange, maxRange]) {
      range.disabled = actualMax === 0;
      range.addEventListener('input', updateRange);
      range.addEventListener('pointerdown', () => {
        minRange.classList.toggle('active', range === minRange);
        maxRange.classList.toggle('active', range === maxRange);
      });
    }
    minField.addEventListener('input', () => updateFromField(minField));
    maxField.addEventListener('input', () => updateFromField(maxField));
    for (const field of [minField, maxField]) {
      field.addEventListener('blur', () => {
        const amount = amountFrom(field, null);
        field.value = amount == null ? '' : formatter.format(amount);
      });
    }
    document.getElementById('catalogFilters').addEventListener('submit', event => {
      const minimum = Number(minRange.value || 0);
      const maximum = Number(maxRange.value || sliderMax);
      if (minimum > maximum) {
        event.preventDefault();
        setError('Giá từ không được lớn hơn giá đến.');
        return;
      }
      event.preventDefault();
      minField.value = minimum > 0 ? String(minimum) : '';
      maxField.value = maximum < actualMax ? String(maximum) : '';
      const params = new URLSearchParams();
      for (const [name, value] of new FormData(event.currentTarget).entries()) {
        if (name && value) params.append(name, value);
      }
      const query = params.toString();
      window.location.assign(`${event.currentTarget.action}${query ? `?${query}` : ''}`);
    });
    updateRange();
  }

  const newsletter = document.getElementById('newsletterForm');
  newsletter?.addEventListener('submit', (event) => {
    event.preventDefault();
    showToast('Đăng ký nhận tin thành công.');
    newsletter.reset();
  });

  document.querySelectorAll('.live-search').forEach(form => {
    const input = form.querySelector('input[type="search"]');
    const clear = form.querySelector('.search-clear');
    const panel = form.querySelector('.search-suggestions');
    let timer;
    let controller;
    let selectedIndex = -1;
    let lastQuery = '';

    function closeSuggestions() {
      panel.hidden = true;
      panel.replaceChildren();
      selectedIndex = -1;
    }

    function showSearchError() {
      panel.replaceChildren();
      const message = document.createElement('p');
      message.className = 'suggestion-heading';
      message.textContent = 'Chưa thể tải gợi ý. Bạn vẫn có thể nhấn Enter để tìm kiếm.';
      panel.appendChild(message);
      panel.hidden = false;
    }

    function saveRecent(query) {
      try {
        const current = JSON.parse(localStorage.getItem('tsf-recent-searches') || '[]');
        const next = [query, ...current.filter(item => item !== query)].slice(0, 5);
        localStorage.setItem('tsf-recent-searches', JSON.stringify(next));
      } catch (_) {
        // Search still works when browser storage is unavailable.
      }
    }

    function addOption(label, href, image, detail) {
      const link = document.createElement('a');
      link.href = href;
      link.className = 'suggestion-option';
      link.setAttribute('role', 'option');
      link.setAttribute('aria-selected', 'false');
      if (image) {
        const img = document.createElement('img');
        img.src = image;
        img.alt = '';
        img.loading = 'lazy';
        link.appendChild(img);
      }
      const copy = document.createElement('span');
      copy.className = 'suggestion-copy';
      const title = document.createElement('strong');
      title.textContent = label;
      copy.appendChild(title);
      if (detail) {
        const meta = document.createElement('small');
        meta.textContent = detail;
        copy.appendChild(meta);
      }
      link.appendChild(copy);
      panel.appendChild(link);
    }

    function showRecentSearches() {
      panel.replaceChildren();
      panel.hidden = true;
      let searches = [];
      try {
        searches = JSON.parse(localStorage.getItem('tsf-recent-searches') || '[]');
      } catch (_) {
        searches = [];
      }
      if (!Array.isArray(searches) || !searches.length) return;
      panel.replaceChildren();
      const heading = document.createElement('p');
      heading.className = 'suggestion-heading';
      heading.textContent = 'Tìm kiếm gần đây';
      panel.appendChild(heading);
      searches.forEach(query => addOption(query, `/tim-kiem?q=${encodeURIComponent(query)}`, '', 'Tìm kiếm'));
      const clearHistory = document.createElement('button');
      clearHistory.type = 'button';
      clearHistory.className = 'clear-history';
      clearHistory.textContent = 'Xóa lịch sử tìm kiếm';
      clearHistory.addEventListener('click', () => {
        localStorage.removeItem('tsf-recent-searches');
        closeSuggestions();
      });
      panel.appendChild(clearHistory);
      panel.hidden = false;
    }

    input.addEventListener('focus', () => {
      if (!input.value.trim()) showRecentSearches();
    });

    input.addEventListener('input', () => {
      clear.hidden = !input.value;
      const query = input.value.trim();
      clearTimeout(timer);
      if (controller) controller.abort();
      if (!query) {
        lastQuery = '';
        showRecentSearches();
        return;
      }
      timer = setTimeout(async () => {
        if (query === lastQuery) return;
        lastQuery = query;
        controller = new AbortController();
        try {
          const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`, { signal: controller.signal });
          if (!response.ok) throw new Error('Search suggestions request failed');
          const data = await response.json();
          panel.replaceChildren();
          (data.items || []).forEach(item => {
            addOption(item.name, `/san-pham/${encodeURIComponent(item.id)}`, item.image,
              `${Number(item.price).toLocaleString('vi-VN')} ₫${item.category ? ` · ${item.category}` : ''}${item.available ? '' : ' · Hết hàng'}`);
          });
          const all = document.createElement('a');
          all.className = 'suggestion-all';
          all.href = `/tim-kiem?q=${encodeURIComponent(query)}`;
          all.textContent = `Xem tất cả kết quả cho “${query}”`;
          panel.appendChild(all);
          panel.hidden = false;
          selectedIndex = -1;
        } catch (error) {
          if (error.name !== 'AbortError') {
            lastQuery = '';
            showSearchError();
          }
        }
      }, 220);
    });

    input.addEventListener('keydown', event => {
      const options = [...panel.querySelectorAll('.suggestion-option, .suggestion-all')];
      if (event.key === 'Escape') {
        closeSuggestions();
        return;
      }
      if (!options.length || panel.hidden) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        selectedIndex = (selectedIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options.forEach((option, index) => {
          const selected = index === selectedIndex;
          option.classList.toggle('selected', selected);
          option.setAttribute('aria-selected', String(selected));
        });
      } else if (event.key === 'Enter' && selectedIndex >= 0) {
        event.preventDefault();
        window.location.href = options[selectedIndex].href;
      }
    });

    clear.addEventListener('click', () => {
      input.value = '';
      lastQuery = '';
      clear.hidden = true;
      input.focus();
      showRecentSearches();
    });

    form.addEventListener('submit', () => {
      const query = input.value.trim();
      if (query) saveRecent(query);
    });

    document.addEventListener('click', event => {
      if (!form.contains(event.target)) closeSuggestions();
    });
  });
});

document.addEventListener('click', async (event) => {
  const add = event.target.closest('.js-add');
  if (!add) return;
  if (add.disabled) return;
  if (add.dataset.requiresVariant === 'true') {
    window.location.href = `/san-pham/${encodeURIComponent(add.dataset.id)}`;
    return;
  }

  const qtyInput = document.getElementById('qty');
  const qty = qtyInput ? Number(qtyInput.value || 1) : 1;
  const variantId = document.getElementById('selectedVariantId')?.value || add.dataset.variantId || '';
  const wasDisabled = add.disabled;
  add.disabled = true;
  add.classList.add('is-loading');
  const label = add.querySelector('span');
  const originalLabel = label?.textContent;
  if (label) label.textContent = 'Đang thêm...';
  try {
    const result = await api('/api/cart/add', 'POST', { id: add.dataset.id, variantId, qty });
    await refreshBadges();
    showToast(result.ok ? 'Đã thêm sản phẩm vào giỏ hàng.' : 'Không thể thêm sản phẩm.');
  } catch (error) {
    showToast(error.message || 'Không thể thêm sản phẩm. Vui lòng thử lại.');
  } finally {
    add.disabled = wasDisabled;
    add.classList.remove('is-loading');
    if (label) label.textContent = originalLabel;
  }
});
