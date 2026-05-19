/**
 * কার্ট — ব্রাউজার localStorage (সার্ভার সেশন নয়)
 * buyNow() এক পণ্য দিয়ে সরাসরি চেকআউট; addToCart() একাধিক আইটেম
 */
const CART_KEY = 'qismat-cart';
const CART_EVENT = 'qismat-cart-updated';

export const cartLineKey = (item) =>
  `${item.id}|${item.selectedSize || ''}|${item.selectedColor || ''}`;

export const getCart = () => {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  } catch {
    return [];
  }
};

export const saveCart = (items) => {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { items } }));
};

/** Insert or update one line; drop `previousKey` when unit/variant changed. */
export const syncCartLine = (product, previousKey = null) => {
  let cart = getCart();
  if (previousKey && previousKey !== cartLineKey(product)) {
    cart = cart.filter((item) => cartLineKey(item) !== previousKey);
  }
  const payload = { ...product };
  if (!payload.selectedSize) delete payload.selectedSize;
  if (!payload.selectedColor) delete payload.selectedColor;
  const key = cartLineKey(payload);
  const qty = Number(payload.quantity) || 1;
  const idx = cart.findIndex((item) => cartLineKey(item) === key);
  if (idx >= 0) {
    cart[idx] = { ...cart[idx], ...payload, quantity: qty };
  } else {
    cart.push({ ...payload, quantity: qty });
  }
  saveCart(cart);
  return { key, cart };
};

export const addToCart = (product) => {
  const cart = getCart();
  const payload = { ...product };
  if (!payload.selectedSize) delete payload.selectedSize;
  if (!payload.selectedColor) delete payload.selectedColor;
  const key = cartLineKey(payload);
  const existingItem = cart.find((item) => cartLineKey(item) === key);

  if (existingItem) {
    existingItem.quantity += product.quantity || 1;
  } else {
    cart.push({ ...payload, quantity: product.quantity || 1 });
  }

  saveCart(cart);
  return cart;
};

/** Replace cart with a single line so checkout opens with only this item. */
export const buyNow = (product) => {
  const payload = { ...product };
  if (!payload.selectedSize) delete payload.selectedSize;
  if (!payload.selectedColor) delete payload.selectedColor;
  const line = { ...payload, quantity: product.quantity || 1 };
  saveCart([line]);
  return [line];
};

export const removeFromCart = (lineKey) => {
  const cart = getCart();
  const updated = cart.filter((item) => cartLineKey(item) !== lineKey);
  saveCart(updated);
  return updated;
};

export const updateQuantity = (lineKey, quantity) => {
  const cart = getCart();
  const item = cart.find((i) => cartLineKey(i) === lineKey);
  if (item) {
    if (Number(quantity) <= 0) {
      return removeFromCart(lineKey);
    }
    item.quantity = Number(quantity);
  }
  saveCart(cart);
  return cart;
};

export const updateCartItem = (lineKey, updates) => {
  const cart = getCart();
  const idx = cart.findIndex((item) => cartLineKey(item) === lineKey);
  if (idx === -1) return cart;

  const current = cart[idx];
  const next = { ...current, ...(updates || {}) };
  if (!next.selectedSize) delete next.selectedSize;
  if (!next.selectedColor) delete next.selectedColor;

  const qty = Number(next.quantity);
  if (Number.isFinite(qty) && qty <= 0) {
    const updated = cart.filter((item) => cartLineKey(item) !== lineKey);
    saveCart(updated);
    return updated;
  }

  const nextKey = cartLineKey(next);
  if (nextKey !== lineKey) {
    const existingIdx = cart.findIndex((item, i) => i !== idx && cartLineKey(item) === nextKey);
    if (existingIdx >= 0) {
      const merged = [...cart];
      merged[existingIdx] = {
        ...merged[existingIdx],
        quantity: Number(merged[existingIdx].quantity || 0) + Number(next.quantity || 1),
      };
      merged.splice(idx, 1);
      saveCart(merged);
      return merged;
    }
  }

  cart[idx] = next;
  saveCart(cart);
  return cart;
};

export const clearCart = () => {
  localStorage.removeItem(CART_KEY);
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { items: [] } }));
};

export const getCartCount = () => {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
};

export const getCartTotal = () => {
  return getCart().reduce((sum, item) => sum + item.price * item.quantity, 0);
};

export const CART_UPDATED_EVENT = CART_EVENT;
