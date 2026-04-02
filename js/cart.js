// ===== CART (localStorage) =====
const CART_KEY = 'scantix_cart';

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event('cart-updated'));
}

function addToCart(item) {
  const cart = getCart();
  const existing = cart.find(c => c.product_ean === item.product_ean);
  if (existing) {
    existing.quantity += item.quantity;
    existing.price_paid = item.price_paid;
  } else {
    cart.push(item);
  }
  saveCart(cart);
  return cart;
}

function updateCartItem(ean, data) {
  const cart = getCart();
  const idx = cart.findIndex(c => c.product_ean === ean);
  if (idx !== -1) { cart[idx] = { ...cart[idx], ...data }; saveCart(cart); }
}

function removeFromCart(ean) {
  saveCart(getCart().filter(c => c.product_ean !== ean));
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  window.dispatchEvent(new Event('cart-updated'));
}

function getCartTotal() {
  return getCart().reduce((sum, i) => sum + i.price_paid * i.quantity, 0);
}

function updateCartBadge() {
  const count = getCart().length;
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

window.addEventListener('cart-updated', updateCartBadge);
