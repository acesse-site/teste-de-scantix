// ===== CART PAGE =====

function renderCartPage() {
  const page = document.getElementById('page-cart');
  const items = getCart();
  const total = getCartTotal();

  if (items.length === 0) {
    page.innerHTML = `
      <div class="page-header"><h1>Carrinho</h1></div>
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <h3>Carrinho vazio</h3>
        <p>Escaneie produtos para adicionar</p>
      </div>`;
    return;
  }

  const itemsHtml = items.map(item => {
    const priceDiff = item.last_price && item.price_paid
      ? ((item.price_paid - item.last_price) / item.last_price * 100) : null;
    const diffHtml = priceDiff !== null
      ? `<span class="price-change ${priceDiff > 0.1 ? 'up' : priceDiff < -0.1 ? 'down' : ''}">${
          priceDiff > 0.1 ? `↑${priceDiff.toFixed(1)}%` : priceDiff < -0.1 ? `↓${Math.abs(priceDiff).toFixed(1)}%` : '='
        }</span>` : '';

    return `
      <div class="cart-item">
        <div class="cart-item-top">
          ${item.product_image_url
            ? `<img src="${item.product_image_url}" class="stock-thumb" style="width:3.5rem;height:3.5rem" onerror="this.style.display='none'">`
            : `<div class="stock-thumb-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg></div>`
          }
          <div class="cart-item-info">
            <h3>${escHtml(item.product_name)}</h3>
            ${item.product_brand ? `<div style="font-size:.8125rem;color:var(--muted-fg)">${escHtml(item.product_brand)}</div>` : ''}
            <div class="cart-item-price">R$ ${item.price_paid.toFixed(2)} ${diffHtml}</div>
          </div>
        </div>
        <div class="cart-item-controls">
          <div class="qty-control" style="width:auto">
            <button onclick="adjustCartQty('${item.product_ean}', -1)">−</button>
            <span style="min-width:2rem">${item.quantity}</span>
            <button onclick="adjustCartQty('${item.product_ean}', 1)">+</button>
          </div>
          <span style="font-size:1rem;font-weight:700">R$ ${(item.price_paid * item.quantity).toFixed(2)}</span>
          <button class="stock-btn-icon trash" onclick="removeCartItem('${item.product_ean}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');

  page.innerHTML = `
    <div class="page-header">
      <h1>Carrinho</h1>
      <p>${items.length} ${items.length === 1 ? 'item' : 'itens'}</p>
    </div>
    <div class="cart-list">${itemsHtml}</div>
    <div style="padding:1rem">
      <div style="background:var(--card);border-radius:1rem;border:1px solid var(--border);padding:1rem;margin-bottom:.75rem">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="color:var(--muted-fg);font-size:.875rem">Total</span>
          <span style="font-size:1.5rem;font-weight:700;color:var(--primary)">R$ ${total.toFixed(2)}</span>
        </div>
      </div>
      <button class="btn-primary w-full" style="height:3rem;font-size:1rem" onclick="openFinalizeModal()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        Finalizar Compra
      </button>
    </div>`;
}

function adjustCartQty(ean, delta) {
  const cart = getCart();
  const item = cart.find(i => i.product_ean === ean);
  if (!item) return;
  const newQty = item.quantity + delta;
  if (newQty < 1) { removeCartItem(ean); return; }
  updateCartItem(ean, { quantity: newQty });
  renderCartPage();
}

function removeCartItem(ean) {
  removeFromCart(ean);
  renderCartPage();
}

// Finalize Modal
function openFinalizeModal() {
  const items = getCart();
  const total = getCartTotal();
  document.getElementById('store-name-input').value = '';

  const summaryEl = document.getElementById('finalize-summary');
  summaryEl.innerHTML = `
    ${items.slice(0, 3).map(i => `
      <div class="summary-row">
        <span>${escHtml(i.product_name)}</span>
        <span>${i.quantity}x R$ ${i.price_paid.toFixed(2)}</span>
      </div>`).join('')}
    ${items.length > 3 ? `<div class="summary-row"><span style="color:var(--muted-fg)">+${items.length - 3} mais...</span></div>` : ''}
    <div class="summary-total"><span>Total</span><span>R$ ${total.toFixed(2)}</span></div>`;

  document.getElementById('finalize-overlay').classList.remove('hidden');
  document.getElementById('finalize-modal').classList.remove('hidden');
}

function closeFinalizeModal() {
  document.getElementById('finalize-overlay').classList.add('hidden');
  document.getElementById('finalize-modal').classList.add('hidden');
}

async function handleFinalize() {
  const storeName = document.getElementById('store-name-input').value.trim();
  if (!storeName) { showToast('Informe o nome do mercado', 'error'); return; }

  const user = await getCurrentUser();
  if (!user) return;

  const items = getCart();
  if (!items.length) return;

  closeFinalizeModal();
  showToast('Registrando compra...', 'info');

  const today = new Date().toISOString().split('T')[0];
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const purchases = items.map(item => ({
    product_id: item.product_id || null,
    product_ean: item.product_ean,
    product_name: item.product_name,
    product_brand: item.product_brand || '',
    product_image_url: item.product_image_url || '',
    price_paid: item.price_paid,
    quantity: item.quantity,
    purchase_date: today,
    store_name: storeName,
    session_id: sessionId,
    last_price: item.last_price || null,
    user_id: user.id
  }));

  try {
    // Save purchases
    const { error: pError } = await db.from('purchases').insert(purchases);
    if (pError) throw pError;

    // Update stock
    const { data: existingStock } = await db.from('stock')
      .select('*').eq('user_id', user.id);

    const stockMap = {};
    (existingStock || []).forEach(s => stockMap[s.product_ean] = s);

    const stockUpdates = [], stockInserts = [];
    for (const item of items) {
      const existing = stockMap[item.product_ean];
      if (existing) {
        stockUpdates.push(
          db.from('stock').update({
            quantity: (existing.quantity || 0) + item.quantity,
            product_name: item.product_name,
            product_brand: item.product_brand || existing.product_brand || '',
            product_image_url: item.product_image_url || existing.product_image_url || ''
          }).eq('id', existing.id)
        );
      } else {
        stockInserts.push({
          product_ean: item.product_ean,
          product_name: item.product_name,
          product_brand: item.product_brand || '',
          product_image_url: item.product_image_url || '',
          quantity: item.quantity,
          user_id: user.id
        });
      }
    }

    await Promise.all(stockUpdates);
    if (stockInserts.length) await db.from('stock').insert(stockInserts);

    clearCart();
    showToast(`Compra no ${storeName} registrada!`, 'success');
    renderCartPage();
  } catch (e) {
    console.error(e);
    showToast('Erro ao registrar compra', 'error');
  }
}
