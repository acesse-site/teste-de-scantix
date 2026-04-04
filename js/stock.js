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
  const inUseItems = all.filter(i => (i.in_use_quantity || 0) > 0);

  let filtered;
  if (stockFilter === 'inuse')       filtered = inUseItems;
  else if (stockFilter === 'in')     filtered = all.filter(i => (i.quantity - (i.in_use_quantity || 0)) > 0);
  else if (stockFilter === 'zero')   filtered = all.filter(i => i.quantity <= 0);
  else                               filtered = all;

  const barcode = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(220,80%,50%)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="8" y1="7" x2="8" y2="17"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="16" y1="7" x2="16" y2="17"/><line x1="20" y1="10" x2="20" y2="14"/><line x1="4" y1="10" x2="4" y2="14"/></svg>`;

  page.innerHTML = `
    <div class="page-header">
      <h1>Estoque</h1>
      <p>${all.length} produtos cadastrados${inUseItems.length ? ` · ${inUseItems.length} em uso` : ''}</p>
    </div>
    <div class="filter-tabs" style="flex-wrap:nowrap;gap:.375rem">
      <button class="filter-tab ${stockFilter==='all'   ?'active-all':''}"   onclick="setStockFilter('all')">Todos</button>
      <button class="filter-tab" onclick="setStockFilter('inuse')" style="position:relative;overflow:visible;padding-right:${inUseItems.length ? '.9rem' : ''};${stockFilter==='inuse'?'background:hsl(280,70%,55%);color:#fff;border-color:hsl(280,70%,45%);font-weight:700':''}">
        Em Uso${inUseItems.length ? `<span style="position:absolute;top:-.45rem;right:-.45rem;background:${stockFilter==='inuse'?'#fff':'hsl(280,70%,55%)'};color:${stockFilter==='inuse'?'hsl(280,70%,45%)':'#fff'};border-radius:999px;font-size:.6rem;min-width:1.2rem;height:1.2rem;display:flex;align-items:center;justify-content:center;padding:0 .25rem;font-weight:700;line-height:1;box-shadow:0 0 0 1.5px var(--bg,#f5f5f5)">${inUseItems.length}</span>` : ''}
      </button>
      <button class="filter-tab ${stockFilter==='in'   ?'active-in':''}"    onclick="setStockFilter('in')">Em estoque</button>
      <button class="filter-tab ${stockFilter==='zero' ?'active-zero':''}"  onclick="setStockFilter('zero')">Zerados</button>
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
      ${renderStockItems(filtered)}
    </div>

    ${inUseModalHtml()}
    ${inUseFinishModalHtml()}`;
}

function renderStockItems(items) {
  if (!items.length) {
    const emptyMsg  = stockFilter === 'inuse' ? 'Nenhum produto em uso' : 'Nenhum produto encontrado';
    const emptyDesc = stockFilter === 'inuse'
      ? 'Abra um produto do estoque para marcar como em uso'
      : 'Finalize uma compra para popular o estoque';
    return `<div class="empty-state" style="padding:2rem 1rem">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>
      <h3>${emptyMsg}</h3><p>${emptyDesc}</p></div>`;
  }

  if (stockFilter === 'inuse') {
    return items.map(i => renderStockItem(i)).join('');
  }

  // "EM USO" section: only items with NO available stock left (all consumed/in use)
  const inUseOnly = items.filter(i => {
    const available = (i.quantity || 0) - (i.in_use_quantity || 0);
    return (i.in_use_quantity || 0) > 0 && available <= 0;
  });
  // "ESTOQUE" section: items with available stock (including those also in use)
  const normal = items.filter(i => (i.quantity - (i.in_use_quantity || 0)) > 0);
  // "ZERADOS" section: items with zero stock and not in use
  const zeroed = items.filter(i => (i.quantity - (i.in_use_quantity || 0)) <= 0 && !((i.in_use_quantity || 0) > 0));

  let html = '';
  if (inUseOnly.length) {
    html += `<div class="zeroed-header" style="background:hsl(280,60%,96%);color:hsl(280,70%,38%);border-left:3px solid hsl(280,70%,55%);margin-top:.5rem">▶ EM USO (${inUseOnly.length})</div>`;
    html += inUseOnly.map(i => renderStockItem(i)).join('');
    if (normal.length || zeroed.length)
      html += `<div class="zeroed-header" style="opacity:.6;font-size:.7rem">📦 ESTOQUE</div>`;
  }
  html += normal.map(i => renderStockItem(i)).join('');
  if (zeroed.length) {
    html += `<div class="zeroed-header">⚠ ZERADOS / ESGOTADOS</div>`;
    html += zeroed.map(i => renderStockItem(i, true)).join('');
  }
  return html;
}

function renderStockItem(item, isZeroed = false) {
  const qty      = item.quantity || 0;
  const inUseQty = item.in_use_quantity || 0;
  const hasInUse = inUseQty > 0;

  const available = Math.max(0, qty - inUseQty);
  const badgeClass = available <= 0 ? 'badge-zero' : available <= 3 ? 'badge-low' : 'badge-in';
  const badgeText  = available <= 0 ? '⚠ Zerado' : `${available} em estoque`;
  const exitInfo   = item.last_exit_date
    ? `<span class="badge badge-exit">↘ Saída: ${item.last_exit_quantity}x em ${formatDate(item.last_exit_date)}</span>` : '';

  const inUseBadge = hasInUse
    ? `<span class="badge" style="background:hsl(280,60%,93%);color:hsl(280,70%,38%);font-weight:700;border:1px solid hsl(280,55%,78%)">▶ ${inUseQty} em uso</span>`
    : '';

  const inUseOpenBtn = `
    <button onclick="openInUseModal('${item.id}')"
      style="display:flex;align-items:center;gap:.3rem;padding:.35rem .65rem;border-radius:.5rem;
             border:1.5px solid;font-size:.75rem;font-weight:600;cursor:pointer;transition:all .15s;
             ${hasInUse
               ? 'background:hsl(280,60%,93%);color:hsl(280,70%,38%);border-color:hsl(280,55%,75%)'
               : 'background:var(--card);color:var(--muted-fg);border-color:var(--border)'}">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      ${hasInUse ? `${inUseQty} em uso` : 'Em Uso'}
    </button>`;

  const inUseFinishBtn = hasInUse ? `
    <button onclick="openInUseFinishModal('${item.id}')"
      style="display:flex;align-items:center;gap:.3rem;padding:.35rem .65rem;border-radius:.5rem;
             border:1.5px solid hsl(0,70%,75%);background:hsl(0,60%,97%);color:hsl(0,65%,42%);
             font-size:.75rem;font-weight:600;cursor:pointer;transition:all .15s"
      title="Dar baixa no produto em uso (acabou)">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      Baixa uso
    </button>` : '';

  return `
    <div class="stock-item ${isZeroed ? 'zeroed' : ''}" data-ean="${item.product_ean}"
      style="${hasInUse && available <= 0 ? 'border-left:3px solid hsl(280,70%,55%);' : ''}">
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
            ${inUseBadge}
            ${exitInfo}
          </div>
        </div>
      </div>
      <div class="stock-actions">
        ${available > 0
          ? `${inUseOpenBtn}
             <button class="stock-btn-exit" onclick="openStockExitModal('${item.id}')">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>
               Dar Saída
             </button>`
          : hasInUse
            ? inUseFinishBtn
            : ''
        }
        <button class="stock-btn-icon cart" onclick="openStockCartModal('${item.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        </button>
        <button class="stock-btn-icon trash" onclick="deleteStockItem('${item.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>`;
}

// ===== MODAL: COLOCAR EM USO =====
let inUseItem = null;
let inUseQtyVal = 1;

function inUseModalHtml() {
  return `
  <div id="in-use-overlay" class="modal-overlay hidden" onclick="closeInUseModal()"></div>
  <div id="in-use-modal" class="modal hidden" style="max-width:22rem">
    <div class="modal-header">
      <h2 style="font-size:1.1rem">Colocar em Uso</h2>
      <button class="modal-close" onclick="closeInUseModal()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div style="padding:1rem 1.25rem 1.5rem">
      <p id="in-use-product-name" style="font-weight:600;font-size:.9375rem;margin-bottom:.25rem;color:var(--fg)"></p>
      <p id="in-use-stock-info"   style="font-size:.8125rem;color:var(--muted-fg);margin-bottom:1.25rem"></p>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem">
        <span style="font-size:.875rem;color:var(--muted-fg)">Quantidade em uso</span>
        <div class="qty-control">
          <button onclick="changeInUseQty(-1)">−</button>
          <span id="in-use-qty-val" style="min-width:2rem">1</span>
          <button onclick="changeInUseQty(1)">+</button>
        </div>
      </div>

      <div id="in-use-info-box" style="background:hsl(280,60%,96%);border:1px solid hsl(280,55%,82%);border-radius:.75rem;padding:.75rem 1rem;margin-bottom:1.25rem;font-size:.8125rem;color:hsl(280,60%,40%);display:none">
        <strong>Atenção:</strong> já há <span id="in-use-current"></span> em uso. Confirmar vai substituir pela nova quantidade.
      </div>

      <button class="btn-primary w-full" onclick="confirmInUse()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Confirmar em Uso
      </button>
    </div>
  </div>`;
}

function openInUseModal(id) {
  inUseItem = stockItems.find(i => i.id === id);
  if (!inUseItem) return;
  const currentInUse = inUseItem.in_use_quantity || 0;
  inUseQtyVal = currentInUse > 0 ? currentInUse : 1;

  document.getElementById('in-use-product-name').textContent = inUseItem.product_name;
  document.getElementById('in-use-stock-info').textContent =
    `Estoque disponível: ${inUseItem.quantity} unidade${inUseItem.quantity !== 1 ? 's' : ''}`;
  document.getElementById('in-use-qty-val').textContent = inUseQtyVal;

  const infoBox = document.getElementById('in-use-info-box');
  if (currentInUse > 0) {
    document.getElementById('in-use-current').textContent = `${currentInUse} unidade${currentInUse !== 1 ? 's' : ''}`;
    infoBox.style.display = 'block';
  } else {
    infoBox.style.display = 'none';
  }

  document.getElementById('in-use-overlay').classList.remove('hidden');
  document.getElementById('in-use-modal').classList.remove('hidden');
}

function closeInUseModal() {
  document.getElementById('in-use-overlay').classList.add('hidden');
  document.getElementById('in-use-modal').classList.add('hidden');
  inUseItem = null;
}

function changeInUseQty(delta) {
  if (!inUseItem) return;
  const max = inUseItem.quantity || 0;
  inUseQtyVal = Math.max(1, Math.min(max, inUseQtyVal + delta));
  document.getElementById('in-use-qty-val').textContent = inUseQtyVal;
}

async function confirmInUse() {
  if (!inUseItem) return;
  if (inUseQtyVal > (inUseItem.quantity || 0)) {
    showToast('Quantidade maior que o estoque disponível', 'error');
    return;
  }
  const { error } = await db.from('stock')
    .update({ in_use_quantity: inUseQtyVal })
    .eq('id', inUseItem.id);
  if (error) { showToast('Erro ao atualizar', 'error'); return; }

  inUseItem.in_use_quantity = inUseQtyVal;
  showToast(`▶ ${inUseQtyVal} unidade${inUseQtyVal !== 1 ? 's' : ''} em uso!`, 'success');
  closeInUseModal();
  renderStockList();
}

// ===== MODAL: BAIXA NO USO =====
let inUseFinishItem = null;
let inUseFinishQtyVal = 1;

function inUseFinishModalHtml() {
  return `
  <div id="in-use-finish-overlay" class="modal-overlay hidden" onclick="closeInUseFinishModal()"></div>
  <div id="in-use-finish-modal" class="modal hidden" style="max-width:22rem">
    <div class="modal-header">
      <h2 style="font-size:1.1rem">Baixa no Uso</h2>
      <button class="modal-close" onclick="closeInUseFinishModal()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div style="padding:1rem 1.25rem 1.5rem">
      <p id="in-use-finish-name" style="font-weight:600;font-size:.9375rem;margin-bottom:.25rem;color:var(--fg)"></p>
      <p id="in-use-finish-info" style="font-size:.8125rem;color:var(--muted-fg);margin-bottom:1.25rem"></p>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
        <span style="font-size:.875rem;color:var(--muted-fg)">Qtd. que acabou</span>
        <div class="qty-control">
          <button onclick="changeInUseFinishQty(-1)">−</button>
          <span id="in-use-finish-qty-val" style="min-width:2rem">1</span>
          <button onclick="changeInUseFinishQty(1)">+</button>
        </div>
      </div>

      <div style="background:hsl(0,60%,97%);border:1px solid hsl(0,55%,85%);border-radius:.75rem;padding:.75rem 1rem;margin-bottom:1.25rem;font-size:.8125rem;color:hsl(0,60%,40%)">
        O produto será removido do "Em Uso" e <strong>descontado do estoque</strong>.
      </div>

      <button class="btn-primary w-full" style="background:hsl(0,65%,50%)" onclick="confirmInUseFinish()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        Confirmar Baixa
      </button>
    </div>
  </div>`;
}

function openInUseFinishModal(id) {
  inUseFinishItem = stockItems.find(i => i.id === id);
  if (!inUseFinishItem) return;
  const inUseQty = inUseFinishItem.in_use_quantity || 0;
  inUseFinishQtyVal = inUseQty;

  document.getElementById('in-use-finish-name').textContent = inUseFinishItem.product_name;
  document.getElementById('in-use-finish-info').textContent =
    `Em uso: ${inUseQty} · Estoque: ${inUseFinishItem.quantity} unidade${inUseFinishItem.quantity !== 1 ? 's' : ''}`;
  document.getElementById('in-use-finish-qty-val').textContent = inUseFinishQtyVal;

  document.getElementById('in-use-finish-overlay').classList.remove('hidden');
  document.getElementById('in-use-finish-modal').classList.remove('hidden');
}

function closeInUseFinishModal() {
  document.getElementById('in-use-finish-overlay').classList.add('hidden');
  document.getElementById('in-use-finish-modal').classList.add('hidden');
  inUseFinishItem = null;
}

function changeInUseFinishQty(delta) {
  if (!inUseFinishItem) return;
  const max = inUseFinishItem.in_use_quantity || 1;
  inUseFinishQtyVal = Math.max(1, Math.min(max, inUseFinishQtyVal + delta));
  document.getElementById('in-use-finish-qty-val').textContent = inUseFinishQtyVal;
}

async function confirmInUseFinish() {
  if (!inUseFinishItem) return;
  const currentInUse = inUseFinishItem.in_use_quantity || 0;
  const currentStock = inUseFinishItem.quantity || 0;
  const newInUse     = Math.max(0, currentInUse - inUseFinishQtyVal);
  const newStock     = Math.max(0, currentStock - inUseFinishQtyVal);
  const today        = new Date().toISOString().split('T')[0];

  const { error } = await db.from('stock').update({
    in_use_quantity:    newInUse,
    quantity:           newStock,
    last_exit_date:     today,
    last_exit_quantity: inUseFinishQtyVal
  }).eq('id', inUseFinishItem.id);

  if (error) { showToast('Erro ao registrar baixa', 'error'); return; }

  inUseFinishItem.in_use_quantity    = newInUse;
  inUseFinishItem.quantity           = newStock;
  inUseFinishItem.last_exit_date     = today;
  inUseFinishItem.last_exit_quantity = inUseFinishQtyVal;

  showToast(
    newInUse === 0
      ? `✓ Produto finalizado · ${inUseFinishQtyVal} baixado do estoque`
      : `✓ Baixa de ${inUseFinishQtyVal} · ainda ${newInUse} em uso`,
    'success'
  );
  closeInUseFinishModal();
  renderStockList();
}

// ===== FILTRO / BUSCA =====
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
  window._stockCamHandler = (code) => {
    closeCameraScanner();
    const input = document.getElementById('stock-ean-search');
    if (input) { input.value = code.replace(/\D/g, ''); filterStockByEan(input.value); }
  };
}

// ===== EXIT MODAL =====
let exitQty = 1;
function openStockExitModal(id) {
  stockExitItem = stockItems.find(i => i.id === id);
  if (!stockExitItem) return;
  exitQty = 1;
  document.getElementById('stock-exit-product-name').textContent = stockExitItem.product_name;
  const availableExit = Math.max(0, (stockExitItem.quantity||0) - (stockExitItem.in_use_quantity||0));
  document.getElementById('stock-exit-max').textContent = `Máximo: ${availableExit} unidades`;
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
  const avail = Math.max(0, (stockExitItem.quantity||0) - (stockExitItem.in_use_quantity||0));
  exitQty = Math.max(1, Math.min(avail, exitQty + delta));
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

// ===== STOCK → CART MODAL =====
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
  updateStockCartDiff();
}

function updateStockCartDiff() {
  const price = parseFloat(document.getElementById('stock-cart-price').value);
  const qty = stockCartQty || 1;
  const diffEl = document.getElementById('stock-cart-diff');
  if (!price || !stockCartLastPrice) { diffEl.classList.add('hidden'); diffEl.innerHTML = ''; return; }
  diffEl.classList.remove('hidden');
  diffEl.innerHTML = buildPriceDiffHtml(price, stockCartLastPrice, qty);
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
