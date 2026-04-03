// ===== CART PAGE =====

let cartSearch = '';

// Diferença de preço com impacto total pela quantidade
function buildPriceDiffHtml(newPrice, lastPrice, qty) {
  if (!newPrice || !lastPrice) return '';
  const diff = newPrice - lastPrice;
  const pct = (diff / lastPrice) * 100;
  const totalDiff = diff * qty;
  if (Math.abs(pct) < 0.1) return '<div class="price-diff same">= Mesmo preço da última compra</div>';
  const isUp = diff > 0;
  const cls = isUp ? 'up' : 'down';
  const arrow = isUp ? '↑' : '↓';
  const label = isUp ? 'mais caro' : 'mais barato';
  const impact = isUp ? 'Pagando a mais' : 'Economizando';
  return `<div class="price-diff ${cls}">
    ${arrow} ${Math.abs(pct).toFixed(1)}% ${label} que a última compra (R$ ${lastPrice.toFixed(2)})<br>
    <strong>${impact}: R$ ${Math.abs(totalDiff).toFixed(2)}</strong>
    <span style="font-weight:400;opacity:.8"> (${qty}x R$ ${Math.abs(diff).toFixed(2)})</span>
  </div>`;
}

function buildCartItemHtml(item) {
  const hasDiff = item.last_price && item.price_paid;
  const priceDiff = hasDiff ? ((item.price_paid - item.last_price) / item.last_price * 100) : null;
  const totalDiff = hasDiff ? (item.price_paid - item.last_price) * item.quantity : null;

  let diffHtml = '';
  if (priceDiff !== null) {
    if (priceDiff > 0.1) diffHtml = `<span class="price-change up">↑${priceDiff.toFixed(1)}%</span>`;
    else if (priceDiff < -0.1) diffHtml = `<span class="price-change down">↓${Math.abs(priceDiff).toFixed(1)}%</span>`;
  }

  let totalDiffHtml = '';
  if (totalDiff !== null && Math.abs(totalDiff) >= 0.01) {
    const isUp = totalDiff > 0;
    const color = isUp ? 'hsl(0,75%,45%)' : 'hsl(160,60%,35%)';
    const bg = isUp ? 'hsl(0,75%,96%)' : 'hsl(160,60%,94%)';
    const label = isUp
      ? `↑ Pagando R$ ${Math.abs(totalDiff).toFixed(2)} a mais (${item.quantity}x R$ ${Math.abs(item.price_paid - item.last_price).toFixed(2)})`
      : `↓ Economizando R$ ${Math.abs(totalDiff).toFixed(2)} (${item.quantity}x R$ ${Math.abs(item.price_paid - item.last_price).toFixed(2)})`;
    totalDiffHtml = `<div style="font-size:.75rem;font-weight:600;color:${color};background:${bg};border-radius:.5rem;padding:.25rem .625rem;margin-top:.375rem;display:inline-block">${label}</div>`;
  }

  return `
    <div class="cart-item" data-ean="${item.product_ean}" data-name="${escHtml(item.product_name).toLowerCase()}">
      <div class="cart-item-top">
        ${item.product_image_url
          ? `<img src="${item.product_image_url}" class="stock-thumb" style="width:3.5rem;height:3.5rem" onerror="this.style.display='none'">`
          : `<div class="stock-thumb-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg></div>`
        }
        <div class="cart-item-info">
          <h3>${escHtml(item.product_name)}</h3>
          ${item.product_brand ? `<div style="font-size:.8125rem;color:var(--muted-fg)">${escHtml(item.product_brand)}</div>` : ''}
          <div class="cart-item-price">R$ ${item.price_paid.toFixed(2)} ${diffHtml}</div>
          ${totalDiffHtml}
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
}

function renderCartPage() {
  const page = document.getElementById('page-cart');
  const items = getCart();
  const total = getCartTotal();

  if (items.length === 0) {
    cartSearch = '';
    page.innerHTML = `
      <div class="page-header"><h1>Carrinho</h1></div>
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <h3>Carrinho vazio</h3>
        <p>Escaneie produtos para adicionar</p>
      </div>`;
    return;
  }

  // Filtra itens conforme a pesquisa actual
  const filtered = cartSearch
    ? items.filter(i => {
        const q = cartSearch.toLowerCase();
        return i.product_name?.toLowerCase().includes(q)
          || i.product_brand?.toLowerCase().includes(q)
          || i.product_ean?.includes(q);
      })
    : items;

  const itemsHtml = filtered.length
    ? filtered.map(buildCartItemHtml).join('')
    : `<div class="empty-state" style="padding:2rem 1rem">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3;margin-bottom:.75rem"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <p style="color:var(--muted-fg);font-size:.9rem">Nenhum item encontrado</p>
       </div>`;

  page.innerHTML = `
    <div class="page-header">
      <h1>Carrinho</h1>
      <p>${items.length} ${items.length === 1 ? 'item' : 'itens'}${filtered.length !== items.length ? ` · ${filtered.length} visível${filtered.length !== 1 ? 'is' : ''}` : ''}</p>
    </div>

    <div class="products-search-wrap">
      <div class="barcode-input-wrap" id="cart-barcode-wrap">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(220,80%,50%)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          id="cart-search-input"
          placeholder="Nome, marca ou código EAN..."
          value="${escHtml(cartSearch)}"
          autocomplete="off"
          oninput="onCartSearchInput(this.value)"
          onkeydown="if(event.key==='Enter')onCartSearchEnter()">
        ${cartSearch ? `
        <button onclick="clearCartSearch()" title="Limpar" style="width:1.75rem;height:1.75rem;border:none;background:var(--muted);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:var(--muted-fg)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>` : ''}
        <button class="barcode-btn-camera" onclick="openCartCameraScanner()" title="Escanear código de barras">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </button>
      </div>
      <p class="barcode-input-hint">Busque por nome, marca, EAN ou escaneie o código</p>
    </div>

    <div class="cart-list">${itemsHtml}</div>

    <div style="padding:1rem">
      <div style="background:var(--card);border-radius:1rem;border:1px solid var(--border);padding:1rem;margin-bottom:.75rem">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="color:var(--muted-fg);font-size:.875rem">Total${cartSearch ? ' (carrinho completo)' : ''}</span>
          <span style="font-size:1.5rem;font-weight:700;color:var(--primary)">R$ ${total.toFixed(2)}</span>
        </div>
        ${cartSearch && filtered.length > 0 ? `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.375rem;padding-top:.375rem;border-top:1px solid var(--border)">
          <span style="color:var(--muted-fg);font-size:.8125rem">Filtrados (${filtered.length})</span>
          <span style="font-size:.9375rem;font-weight:600;color:var(--muted-fg)">R$ ${filtered.reduce((s,i)=>s+i.price_paid*i.quantity,0).toFixed(2)}</span>
        </div>` : ''}
      </div>
      <button class="btn-primary w-full" style="height:3rem;font-size:1rem" onclick="openFinalizeModal()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        Finalizar Compra
      </button>
    </div>`;
}

// ===== SEARCH HANDLERS =====

function onCartSearchInput(value) {
  cartSearch = value;
  renderCartPage();
  // Reposiciona o foco no input após re-render
  setTimeout(() => {
    const inp = document.getElementById('cart-search-input');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }, 0);
}

function onCartSearchEnter() {
  const val = cartSearch.trim();
  if (!val) return;
  // Se parece EAN (só números), destaca o resultado
  if (/^\d{8,14}$/.test(val)) {
    const items = getCart();
    const match = items.find(i => i.product_ean === val);
    if (match) showToast(`Encontrado: ${match.product_name}`, 'success');
    else showToast('Nenhum item com esse EAN no carrinho', 'error');
  }
}

function clearCartSearch() {
  cartSearch = '';
  renderCartPage();
  setTimeout(() => document.getElementById('cart-search-input')?.focus(), 50);
}

function openCartCameraScanner() {
  document.getElementById('camera-modal').classList.remove('hidden');
  startCameraScanner();
  window._cartFilterMode = true;
}

function handleCartCameraScan(code) {
  if (!window._cartFilterMode) return false;
  window._cartFilterMode = false;
  const ean = code.replace(/\D/g, '');
  closeCameraScanner();
  cartSearch = ean;
  renderCartPage();
  setTimeout(() => {
    const inp = document.getElementById('cart-search-input');
    if (inp) { inp.value = ean; inp.focus(); }
  }, 100);
  return true;
}

// ===== CART ACTIONS =====

function adjustCartQty(ean, delta) {
  const cart = getCart();
  const item = cart.find(i => i.product_ean === ean);
  if (!item) return;
  const newQty = item.quantity + delta;
  if (newQty < 1) { removeCartItem(ean); return; }
  updateCartItem(ean, { quantity: newQty });
  renderCartPage();
  // Restaura o foco no input de pesquisa se estava activo
  setTimeout(() => {
    if (cartSearch) {
      const inp = document.getElementById('cart-search-input');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
  }, 0);
}

function removeCartItem(ean) {
  removeFromCart(ean);
  renderCartPage();
}

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
    const { error: pError } = await db.from('purchases').insert(purchases);
    if (pError) throw pError;
    const { data: existingStock } = await db.from('stock').select('*').eq('user_id', user.id);
    const stockMap = {};
    (existingStock || []).forEach(s => stockMap[s.product_ean] = s);
    const stockUpdates = [], stockInserts = [];
    for (const item of items) {
      const existing = stockMap[item.product_ean];
      if (existing) {
        stockUpdates.push(db.from('stock').update({
          quantity: (existing.quantity || 0) + item.quantity,
          product_name: item.product_name,
          product_brand: item.product_brand || existing.product_brand || '',
          product_image_url: item.product_image_url || existing.product_image_url || ''
        }).eq('id', existing.id));
      } else {
        stockInserts.push({
          product_ean: item.product_ean, product_name: item.product_name,
          product_brand: item.product_brand || '', product_image_url: item.product_image_url || '',
          quantity: item.quantity, user_id: user.id
        });
      }
    }
    await Promise.all(stockUpdates);
    if (stockInserts.length) await db.from('stock').insert(stockInserts);
    cartSearch = '';
    clearCart();
    showToast(`Compra no ${storeName} registrada!`, 'success');
    renderCartPage();
  } catch (e) {
    console.error(e);
    showToast('Erro ao registrar compra', 'error');
  }
}
