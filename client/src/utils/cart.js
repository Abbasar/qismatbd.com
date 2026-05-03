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
