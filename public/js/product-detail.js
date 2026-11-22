document.addEventListener('DOMContentLoaded', () => {
  const purchase = document.querySelector('.purchase-panel');
  if (!purchase) return;

  const variants = Array.isArray(window.tsfProductVariants) ? window.tsfProductVariants : [];
  const qty = document.getElementById('qty');
  const addButton = document.querySelector('.purchase-add');
  const status = document.getElementById('inventoryStatus');
  const variantId = document.getElementById('selectedVariantId');
  const sizeSelect = document.getElementById('productSize');
  const colorSelect = document.getElementById('productColor');
  const genericSelect = document.getElementById('productVariant');
  const decrement = document.querySelector('[data-quantity-step="-1"]');
  const increment = document.querySelector('[data-quantity-step="1"]');
  const lowStock = Number(purchase.dataset.lowStock || 10);
  const veryLowStock = Number(purchase.dataset.veryLowStock || 5);
  let stock = Number(qty.max || 0);

  function setQuantity(value) {
    const minimum = stock > 0 ? 1 : 0;
    const next = Math.min(stock, Math.max(minimum, Number.parseInt(value, 10) || minimum));
    qty.value = String(next);
    qty.disabled = stock <= 0;
    qty.min = String(minimum);
    qty.max = String(stock);
    decrement.disabled = stock <= 0 || next <= 1;
    increment.disabled = stock <= 0 || next >= stock;
    addButton.disabled = stock <= 0;
  }

  function currentVariant() {
    if (!variants.length) return null;
    if (genericSelect) return variants.find(variant => String(variant._id) === genericSelect.value) || null;
    return variants.find(variant =>
      (!sizeSelect || String(variant.size || '') === sizeSelect.value) &&
      (!colorSelect || String(variant.color || '') === colorSelect.value)
    ) || null;
  }

  function updateOptions() {
    if (sizeSelect) {
      [...sizeSelect.options].forEach(option => {
        option.disabled = !variants.some(variant => String(variant.size || '') === option.value &&
          variant.available !== false && Number(variant.stock || 0) > 0);
      });
    }
    if (colorSelect) {
      [...colorSelect.options].forEach(option => {
        option.disabled = !variants.some(variant => String(variant.color || '') === option.value &&
          variant.available !== false && Number(variant.stock || 0) > 0);
      });
    }
    if (genericSelect) {
      [...genericSelect.options].forEach(option => {
        const variant = variants.find(item => String(item._id) === option.value);
        option.disabled = !variant || variant.available === false || Number(variant.stock || 0) <= 0;
      });
    }
  }

  function resolveVariantForChangedOption(control) {
    const selected = currentVariant();
    if (selected && selected.available !== false && Number(selected.stock || 0) > 0) return selected;
    const match = variants.find(variant =>
      variant.available !== false && Number(variant.stock || 0) > 0 &&
      String(variant[control.id === 'productSize' ? 'size' : 'color'] || '') === control.value
    );
    if (!match) return selected;
    if (sizeSelect) sizeSelect.value = String(match.size || '');
    if (colorSelect) colorSelect.value = String(match.color || '');
    return match;
  }

  function renderStock(selected, resetQuantity) {
    const unavailable = selected && selected.available === false;
    stock = variants.length ? Number(selected?.stock || 0) : Number(qty.max || 0);
    if (unavailable) stock = 0;
    if (variantId) variantId.value = selected?._id ? String(selected._id) : '';
    updateOptions();

    if (stock <= 0) {
      status.textContent = 'Hết hàng';
      status.className = 'inventory-status out-of-stock';
      setQuantity(0);
      return;
    }
    if (resetQuantity) setQuantity(1);
    else setQuantity(Math.min(Number(qty.value || 1), stock));
    if (stock <= veryLowStock) {
      status.textContent = `Chỉ còn ${stock} sản phẩm · Sắp hết hàng`;
      status.className = 'inventory-status low-stock';
    } else if (stock <= lowStock) {
      status.textContent = `Sắp hết hàng · Còn ${stock} sản phẩm`;
      status.className = 'inventory-status low-stock';
    } else {
      status.textContent = `Còn hàng · ${stock} sản phẩm`;
      status.className = 'inventory-status in-stock';
    }
  }

  const controls = [sizeSelect, colorSelect, genericSelect].filter(Boolean);
  controls.forEach(control => control.addEventListener('change', () => {
    const selected = sizeSelect && control === sizeSelect || colorSelect && control === colorSelect
      ? resolveVariantForChangedOption(control)
      : currentVariant();
    renderStock(selected, true);
  }));
  decrement.addEventListener('click', () => setQuantity(Number(qty.value) - 1));
  increment.addEventListener('click', () => setQuantity(Number(qty.value) + 1));
  qty.addEventListener('input', () => setQuantity(qty.value));
  qty.addEventListener('blur', () => setQuantity(qty.value));

  renderStock(currentVariant(), false);
});
