// ===== PURCHASES PAGE =====

async function renderPurchasesPage() {
  const page = document.getElementById('page-purchases');
  page.innerHTML = `
    <div class="page-header"><h1>Histórico de Compras</h1></div>
    <div style="display:flex;align-items:center;justify-content:center;height:60vh">
      <span class="spinner" style="width:2.5rem;height:2.5rem;border-width:4px"></span>
    </div>`;

  const user = await getCurrentUser();
  if (!user) return;

  const { data, error } = await db.from('purchases')
    .select('*').eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) { showToast('Erro ao carregar compras', 'error'); return; }

  const purchases = data || [];

  if (!purchases.length) {
    page.innerHTML = `
      <div class="page-header"><h1>Histórico de Compras</h1><p>Suas compras registradas</p></div>
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <h3>Sem compras registradas</h3><p>Finalize seu carrinho para registrar</p>
      </div>`;
    return;
  }

  // Group by session_id
  const sessions = {};
  for (const p of purchases) {
    const sid = p.session_id || p.id;
    if (!sessions[sid]) sessions[sid] = [];
    sessions[sid].push(p);
  }

  // Calculate session stats
  const sessionList = Object.values(sessions).map(items => {
    const total = items.reduce((s, i) => s + i.price_paid * i.quantity, 0);
    const itemCount = items.reduce((s, i) => s + i.quantity, 0);
    const productCount = items.length;
    const storeName = items[0].store_name || 'Mercado';
    const date = items[0].purchase_date || items[0].created_at?.split('T')[0];
    const time = items[0].created_at ? new Date(items[0].created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    // Price variation
    const withLastPrice = items.filter(i => i.last_price && i.price_paid);
    let avgChange = null;
    if (withLastPrice.length) {
      avgChange = withLastPrice.reduce((s, i) => s + ((i.price_paid - i.last_price) / i.last_price * 100), 0) / withLastPrice.length;
    }
    return { items, total, itemCount, productCount, storeName, date, time, avgChange };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const sessionsHtml = sessionList.map((s, idx) => {
    const changeHtml = s.avgChange !== null
      ? `<div class="session-change">${s.avgChange > 0 ? '↑' : '↓'} ${Math.abs(s.avgChange).toFixed(1)}% em média vs compra anterior</div>`
      : '';
    const itemsHtml = s.items.map(item => {
      const priceDiff = item.last_price ? ((item.price_paid - item.last_price) / item.last_price * 100) : null;
      const diffHtml = priceDiff !== null
        ? `<div class="session-item-change ${priceDiff > 0.1 ? 'up' : 'down'}">${priceDiff > 0.1 ? `↑${priceDiff.toFixed(1)}%` : `↓${Math.abs(priceDiff).toFixed(1)}%`} (R$ ${priceDiff > 0 ? '+' : ''}${((item.price_paid - item.last_price) * item.quantity).toFixed(2)})</div>` : '';
      return `
        <div class="session-item">
          ${item.product_image_url
            ? `<img src="${item.product_image_url}" class="session-item-thumb" onerror="this.style.display='none'">`
            : `<div class="session-item-thumb" style="display:flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg></div>`
          }
          <div class="session-item-info">
            <div class="session-item-name">${escHtml(item.product_name)}</div>
            <div class="session-item-qty">${item.quantity}x R$ ${item.price_paid.toFixed(2)}</div>
            ${diffHtml}
          </div>
          <div class="session-item-price">R$ ${(item.price_paid * item.quantity).toFixed(2)}</div>
        </div>`;
    }).join('');

    return `
      <div class="purchase-session">
        <div class="session-header" onclick="toggleSession('session-${idx}')">
          <h3>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            ${escHtml(s.storeName)}
            <span style="margin-left:auto;font-size:1rem;opacity:.8" id="session-arrow-${idx}">∧</span>
          </h3>
          <div class="session-meta">
            <span class="session-date">${formatDateFull(s.date)}${s.time ? ' ' + s.time : ''}</span>
          </div>
          <div class="session-meta">
            <div class="session-tags">
              <span class="session-tag">${s.itemCount} itens</span>
              <span class="session-tag">📦 ${s.productCount} produtos</span>
            </div>
            <span class="session-total">R$ ${s.total.toFixed(2)}</span>
          </div>
          ${changeHtml}
        </div>
        <div id="session-${idx}" class="session-items hidden">${itemsHtml}</div>
      </div>`;
  }).join('');

  page.innerHTML = `
    <div class="page-header"><h1>Histórico de Compras</h1><p>Suas compras registradas</p></div>
    ${sessionsHtml}`;
}

function toggleSession(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const idx = id.replace('session-', '');
  const arrow = document.getElementById(`session-arrow-${idx}`);
  el.classList.toggle('hidden');
  if (arrow) arrow.textContent = el.classList.contains('hidden') ? '∧' : '∨';
}
