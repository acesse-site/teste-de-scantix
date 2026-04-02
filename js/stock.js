// ===== STOCK PAGE =====
let stockItems = [];
let stockFilter = 'all';
let stockExitItem = null;
let stockCartItem = null;

async function renderStockPage() {
  const page = document.getElementById('page-stock');
  page.innerHTML = `
    <div class="page-header"><h1>Estoque</h1></div>
    <div style="display:flex;align-items:center;justify-content:center;height:60vh">
      <span class="spinner" style="width:2.5rem;height:2.5rem;border-width:4px"></span>
    </div>`;

  const user = await getCurrentUser();
  if (!user) return;

  const { data, error } = await db.from('stock').select('*').eq('user_id', user.id).order('product_name');
  if (error) { showToast('Erro ao carregar estoque', 'error'); return; }
  stockItems = data || [];

  renderStockList();
}

function renderStockList() {
  const page = document.getElementById('page-stock');
  const all = stockItems;
  const inStock = all.filter(i => i.quantity > 0);
  const zeroed = all.filter(i => i.quantity <= 0);

  let filtered;
  if (stockFilter === 'in') filtered = inStock;
  else if (stockFilter === 'zero') filtered = zeroed;
  else filtered = all;

  const barcode = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(220,80%,50%)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="8" y1="7" x2="8" y2="17"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="16" y1="7" x2="16" y2="17"/><line x1="20" y1="10" x2="20" y2="14"/><line x1="4" y1="10" x2="4" y2="14"/></svg>`;

  page.innerHTML = `
    <div class="page-header">
      <h1>Estoque</h1>
      <p>${all.length} produtos cadastrados</p>
    </div>
    <div class="filter-tabs">
      <button class="filter-tab ${stockFilter==='all'?'active-all':''}" onclick="setStockFilter('all')">Todos</button>
      <button class="filter-tab ${stockFilter==='in'?'active-in':''}" onclick="setStockFilter('in')">Em estoque</button>
      <button class="filter-tab ${stockFilter==='zero'?'active-zero':''}" onclick="setStockFilter('zero')">Zerados</button>
    </div>
    <div class="section-padding">
      <div class="barcode-input-wrap">
        ${barcode}
        <input type="text" id="stock-ean-search" inputmode="numeric" placeholder="Bipe ou digite o EAN..."
          autocomplete="off" oninput="this.value=this.value.replace(/\\D/g,'');filterStockByEan(this.value)"
          onkeydown="if(event.key==='Enter')filterStockByEan(this.value)">
        <button class="barcode-btn-camera" onclick="openStockCamera()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </button>
      </div>
      <p class="barcode-input-hint">Bipe, digite o EAN + Enter, ou use a câmera</p>
    </div>
    <div id="stock-items-list" class="stock-list">
      ${renderStockItems(filtered, stockFilter === 'zero')}
    </div>`;
}

function renderStockItems(items, showZeroedHeader) {
  if (!items.length) {
    return `<div class="empty-state" style="padding:2rem 1rem">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>
      <h3>Nenhum produto</h3><p>Finalize uma compra para popular o estoque</p></div>`;
  }

  const inStock = items.filter(i => i.quantity > 0);
  const zeroed = items.filter(i => i.quantity <= 0);

  let html = '';
  if (!showZeroedHeader) {
    html += inStock.map(i => renderStockItem(i)).join('');
    if (zeroed.length) {
      html += `<div class="zeroed-header">⚠ ZERADOS / ESGOTADOS</div>`;
      html += zeroed.map(i => renderStockItem(i, true)).join('');
    }
  } else {
    html += `<div class="zeroed-header">⚠ ZERADOS / ESGOTADOS</div>`;
    html += zeroed.map(i => renderStockItem(i, true)).join('');
  }
  return html;
}

function renderStockItem(item, isZeroed = false) {
  const qty = item.quantity || 0;
  const badgeClass = qty <= 0 ? 'badge-zero' : qty <= 3 ? 'badge-low' : 'badge-in';
  const badgeText = qty <= 0 ? '⚠ Zerado' : `${qty} em estoque`;
  const exitInfo = item.last_exit_date
    ? `<span class="badge badge-exit">↘ Saída: ${item.last_exit_quantity}x em ${formatDate(item.last_exit_date)}</span>` : '';

  return `
    <div class="stock-item ${isZeroed ? 'zeroed' : ''}" data-ean="${item.product_ean}">
      <div class="stock-item-top">
        ${item.product_image_url
          ? `<img src="${item.product_image_url}" class="stock-thumb" onerror="this.style.display='none'">`
          : `<div class="stock-thumb-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg></div>`
        }
        <div class="stock-info">
          <h3>${escHtml(item.product_name)}</h3>
          ${item.product_brand ? `<div class="brand">${escHtml(item.product_brand)}</div>` : ''}
          <div class="stock-badges">
            <span class="badge ${badgeClass}">${badgeText}</span>
            ${exitInfo}
          </div>
        </div>
      </div>
      <div class="stock-actions">
        <button class="stock-btn-exit" onclick="openStockExitModal('${item.id}')" ${qty <= 0 ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>
          Dar Saída
        </button>
        <button class="stock-btn-icon cart" onclick="openStockCartModal('${item.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        </button>
        <button class="stock-btn-icon trash" onclick="deleteStockItem('${item.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>`;
}

function setStockFilter(f) {
  stockFilter = f;
  renderStockList();
}

function filterStockByEan(ean) {
  if (!ean || ean.length < 3) { renderStockList(); return; }
  const found = stockItems.filter(i => i.product_ean.includes(ean));
  document.getElementById('stock-items-list').innerHTML = renderStockItems(found);
}

function openStockCamera() {
  document.getElementById('camera-modal').classList.remove('hidden');
  startCameraScanner();
  // Override scan handler for stock search
  const orig = handleCameraScan;
  window._stockCamHandler = (code) => {
    closeCameraScanner();
    const input = document.getElementById('stock-ean-search');
    if (input) { input.value = code.replace(/\D/g, ''); filterStockByEan(input.value); }
  };
}

// Exit modal
let exitQty = 1;
function openStockExitModal(id) {
  stockExitItem = stockItems.find(i => i.id === id);
  if (!stockExitItem) return;
  exitQty = 1;
  document.getElementById('stock-exit-product-name').textContent = stockExitItem.product_name;
  document.getElementById('stock-exit-max').textContent = `Máximo: ${stockExitItem.quantity} unidades`;
  document.getElementById('exit-qty').textContent = exitQty;
  document.getElementById('stock-exit-overlay').classList.remove('hidden');
  document.getElementById('stock-exit-modal').classList.remove('hidden');
}

function closeStockExitModal() {
  document.getElementById('stock-exit-overlay').classList.add('hidden');
  document.getElementById('stock-exit-modal').classList.add('hidden');
  stockExitItem = null;
}

function changeExitQty(delta) {
  if (!stockExitItem) return;
  exitQty = Math.max(1, Math.min(stockExitItem.quantity, exitQty + delta));
  document.getElementById('exit-qty').textContent = exitQty;
}

async function confirmStockExit() {
  if (!stockExitItem) return;
  const newQty = Math.max(0, (stockExitItem.quantity || 0) - exitQty);
  const today = new Date().toISOString().split('T')[0];
  const { error } = await db.from('stock').update({
    quantity: newQty,
    last_exit_date: today,
    last_exit_quantity: exitQty
  }).eq('id', stockExitItem.id);
  if (error) { showToast('Erro ao dar saída', 'error'); return; }
  showToast('Saída registrada!', 'success');
  closeStockExitModal();
  await renderStockPage();
}

// Stock → Cart modal
let stockCartQty = 1;
let stockCartLastPrice = null;

async function openStockCartModal(id) {
  stockCartItem = stockItems.find(i => i.id === id);
  if (!stockCartItem) return;
  stockCartQty = 1;
  document.getElementById('stock-cart-product-name').textContent = stockCartItem.product_name;
  document.getElementById('stock-cart-qty').textContent = stockCartQty;
  document.getElementById('stock-cart-price').value = '';
  document.getElementById('stock-cart-diff').classList.add('hidden');

  const last = await getLastPurchaseForEan(stockCartItem.product_ean);
  stockCartLastPrice = last?.price_paid || null;
  if (stockCartLastPrice) {
    document.getElementById('stock-cart-price').value = stockCartLastPrice.toFixed(2);
    updateStockCartDiff();
  }

  document.getElementById('stock-cart-overlay').classList.remove('hidden');
  document.getElementById('stock-cart-modal').classList.remove('hidden');
}

function closeStockCartModal() {
  document.getElementById('stock-cart-overlay').classList.add('hidden');
  document.getElementById('stock-cart-modal').classList.add('hidden');
  stockCartItem = null;
}

function changeStockCartQty(delta) {
  stockCartQty = Math.max(1, stockCartQty + delta);
  document.getElementById('stock-cart-qty').textContent = stockCartQty;
}

function updateStockCartDiff() {
  const price = parseFloat(document.getElementById('stock-cart-price').value);
  const diffEl = document.getElementById('stock-cart-diff');
  if (!price || !stockCartLastPrice) { diffEl.classList.add('hidden'); return; }
  const diff = ((price - stockCartLastPrice) / stockCartLastPrice * 100);
  diffEl.classList.remove('hidden', 'up', 'down', 'same');
  if (diff > 0.1) {
    diffEl.classList.add('up');
    diffEl.innerHTML = `↑ ${diff.toFixed(1)}% mais caro que a última compra (R$ ${stockCartLastPrice.toFixed(2)})`;
  } else if (diff < -0.1) {
    diffEl.classList.add('down');
    diffEl.innerHTML = `↓ ${Math.abs(diff).toFixed(1)}% mais barato que a última compra (R$ ${stockCartLastPrice.toFixed(2)})`;
  } else {
    diffEl.classList.add('same');
    diffEl.textContent = 'Mesmo preço da última compra';
  }
}

function confirmStockCartAdd() {
  if (!stockCartItem) return;
  const price = parseFloat(document.getElementById('stock-cart-price').value);
  if (!price || price <= 0) { showToast('Informe o preço', 'error'); return; }
  addToCart({
    product_ean: stockCartItem.product_ean,
    product_name: stockCartItem.product_name,
    product_brand: stockCartItem.product_brand || '',
    product_image_url: stockCartItem.product_image_url || '',
    price_paid: price,
    quantity: stockCartQty,
    last_price: stockCartLastPrice
  });
  showToast('Adicionado ao carrinho!', 'success');
  closeStockCartModal();
}

async function deleteStockItem(id) {
  openConfirmModal('Remover produto', 'Deseja remover este produto do estoque?', async () => {
    const { error } = await db.from('stock').delete().eq('id', id);
    if (error) { showToast('Erro ao remover', 'error'); return; }
    showToast('Produto removido', 'success');
    await renderStockPage();
  });
}
