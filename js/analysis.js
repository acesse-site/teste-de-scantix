// ===== ANALYSIS PAGE =====
let analysisTab = 'geral';

async function renderAnalysisPage() {
  const page = document.getElementById('page-analysis');
  page.innerHTML = `<div class="page-header"><h1>Análise</h1><p>Carregando...</p></div>`;

  const user = await getCurrentUser();
  if (!user) return;

  const { data: purchases } = await db.from('purchases').select('*').eq('user_id', user.id);
  const all = purchases || [];

  page.innerHTML = `
    <div class="page-header">
      <h1>Análise</h1>
      <p>Acompanhe seus gastos e economias</p>
    </div>
    <div class="analysis-tabs-row">
      <button class="analysis-tab ${analysisTab==='geral'?'active':''}" onclick="setAnalysisTab('geral')">Geral</button>
      <button class="analysis-tab ${analysisTab==='mensal'?'active':''}" onclick="setAnalysisTab('mensal')">Mensal</button>
      <button class="analysis-tab ${analysisTab==='mercados'?'active':''}" onclick="setAnalysisTab('mercados')">Mercados</button>
      <button class="analysis-tab ${analysisTab==='produtos'?'active':''}" onclick="setAnalysisTab('produtos')">Produtos</button>
    </div>
    <div id="analysis-content"></div>`;

  renderAnalysisTab(all);
}

function setAnalysisTab(tab) {
  analysisTab = tab;
  document.querySelectorAll('.analysis-tab').forEach((t, i) => {
    const tabs = ['geral', 'mensal', 'mercados', 'produtos'];
    t.classList.toggle('active', tabs[i] === tab);
  });
  // re-fetch if needed
  getCurrentUser().then(user => {
    if (!user) return;
    db.from('purchases').select('*').eq('user_id', user.id).then(({ data }) => {
      renderAnalysisTab(data || []);
    });
  });
}

function renderAnalysisTab(all) {
  const content = document.getElementById('analysis-content');
  if (!content) return;
  if (analysisTab === 'geral') content.innerHTML = renderOverview(all);
  else if (analysisTab === 'mensal') content.innerHTML = renderMonthly(all);
  else if (analysisTab === 'mercados') content.innerHTML = renderStores(all);
  else if (analysisTab === 'produtos') content.innerHTML = renderProductsAnalysis(all);
}

function renderOverview(all) {
  const totalSpent = all.reduce((s, p) => s + p.price_paid * p.quantity, 0);
  const savings = all.filter(p => p.last_price && p.price_paid < p.last_price)
    .reduce((s, p) => s + (p.last_price - p.price_paid) * p.quantity, 0);
  const sessions = new Set(all.map(p => p.session_id || p.id)).size;
  const uniqueProducts = new Set(all.map(p => p.product_ean)).size;
  const totalItems = all.reduce((s, p) => s + p.quantity, 0);
  const stores = new Set(all.map(p => p.store_name).filter(Boolean)).size;

  // Monthly spending chart
  const byMonth = {};
  for (const p of all) {
    const month = (p.purchase_date || '').slice(0, 7);
    if (!month) continue;
    byMonth[month] = (byMonth[month] || 0) + p.price_paid * p.quantity;
  }
  const months = Object.keys(byMonth).sort().slice(-6);
  const maxVal = Math.max(...months.map(m => byMonth[m]), 1);
  const chartHtml = months.length ? `
    <div class="chart-bar-wrap" style="background:var(--card);border-radius:1rem;border:1px solid var(--border);padding:1rem;margin:0 1rem 1rem">
      <h3>Gastos por mês</h3>
      <div class="bar-chart">
        ${months.map(m => `
          <div class="bar-row">
            <div class="bar-label">${m.slice(5)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(byMonth[m]/maxVal*100).toFixed(1)}%"></div></div>
            <div class="bar-val">R$ ${byMonth[m].toFixed(0)}</div>
          </div>`).join('')}
      </div>
    </div>` : '';

  return `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Total gasto</div><div class="stat-value">R$ ${totalSpent.toFixed(2)}</div></div>
      <div class="stat-card"><div class="stat-label">Economia total</div><div class="stat-value green">R$ ${savings.toFixed(2)}</div></div>
      <div class="stat-card"><div class="stat-label">Compras realizadas</div><div class="stat-value">${sessions}</div></div>
      <div class="stat-card"><div class="stat-label">Produtos únicos</div><div class="stat-value">${uniqueProducts}</div></div>
      <div class="stat-card"><div class="stat-label">Total de itens</div><div class="stat-value">${totalItems}</div></div>
      <div class="stat-card"><div class="stat-label">Mercados visitados</div><div class="stat-value">${stores}</div></div>
    </div>
    ${chartHtml}`;
}

function renderMonthly(all) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthly = all.filter(p => (p.purchase_date || '').startsWith(currentMonth));
  const totalSpent = monthly.reduce((s, p) => s + p.price_paid * p.quantity, 0);
  const itemCount = monthly.reduce((s, p) => s + p.quantity, 0);
  const sessions = new Set(monthly.map(p => p.session_id || p.id)).size;

  // By store
  const byStore = {};
  for (const p of monthly) {
    const s = p.store_name || 'Outros';
    byStore[s] = (byStore[s] || 0) + p.price_paid * p.quantity;
  }
  const storeList = Object.entries(byStore).sort((a,b) => b[1]-a[1]);
  const maxStore = Math.max(...storeList.map(s => s[1]), 1);

  // Top products
  const byProduct = {};
  for (const p of monthly) {
    if (!byProduct[p.product_ean]) byProduct[p.product_ean] = { name: p.product_name, total: 0 };
    byProduct[p.product_ean].total += p.price_paid * p.quantity;
  }
  const topProducts = Object.values(byProduct).sort((a,b) => b.total - a.total).slice(0, 5);

  return `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Gasto no mês</div><div class="stat-value">R$ ${totalSpent.toFixed(2)}</div></div>
      <div class="stat-card"><div class="stat-label">Compras</div><div class="stat-value">${sessions}</div></div>
      <div class="stat-card"><div class="stat-label">Itens comprados</div><div class="stat-value">${itemCount}</div></div>
      <div class="stat-card"><div class="stat-label">Ticket médio</div><div class="stat-value">${sessions ? 'R$ '+(totalSpent/sessions).toFixed(2) : '-'}</div></div>
    </div>
    ${storeList.length ? `
    <div class="chart-bar-wrap" style="background:var(--card);border-radius:1rem;border:1px solid var(--border);padding:1rem;margin:0 1rem 1rem">
      <h3>Por mercado</h3>
      <div class="bar-chart">
        ${storeList.map(([store, val]) => `
          <div class="bar-row">
            <div class="bar-label" style="min-width:5rem;max-width:5rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(store)}">${escHtml(store)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(val/maxStore*100).toFixed(1)}%"></div></div>
            <div class="bar-val">R$ ${val.toFixed(0)}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}
    ${topProducts.length ? `
    <div style="padding:0 1rem 1rem">
      <h3 style="font-size:1rem;font-weight:600;margin-bottom:.75rem">Mais gastou</h3>
      ${topProducts.map(p => `
        <div style="display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border);font-size:.875rem">
          <span>${escHtml(p.name)}</span>
          <span style="font-weight:600">R$ ${p.total.toFixed(2)}</span>
        </div>`).join('')}
    </div>` : ''}`;
}

function renderStores(all) {
  const byStore = {};
  for (const p of all) {
    const s = p.store_name || 'Outros';
    if (!byStore[s]) byStore[s] = { total: 0, count: 0, visits: new Set() };
    byStore[s].total += p.price_paid * p.quantity;
    byStore[s].count += p.quantity;
    byStore[s].visits.add(p.session_id || p.id);
  }
  const stores = Object.entries(byStore).sort((a,b) => b[1].total - a[1].total);

  if (!stores.length) return `<div class="empty-state" style="padding:3rem 1rem"><p>Sem dados de mercados</p></div>`;

  return `<div style="padding:0 1rem">
    ${stores.map(([name, data]) => `
      <div style="background:var(--card);border-radius:1rem;border:1px solid var(--border);padding:1rem;margin-bottom:.75rem;box-shadow:var(--shadow)">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem">
          <div style="width:2.5rem;height:2.5rem;background:var(--primary-light);border-radius:.625rem;display:flex;align-items:center;justify-content:center;color:var(--primary)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          </div>
          <div>
            <div style="font-weight:600">${escHtml(name)}</div>
            <div style="font-size:.8125rem;color:var(--muted-fg)">${data.visits.size} visitas · ${data.count} itens</div>
          </div>
          <div style="margin-left:auto;font-size:1.25rem;font-weight:700;color:var(--primary)">R$ ${data.total.toFixed(2)}</div>
        </div>
      </div>`).join('')}
  </div>`;
}

function renderProductsAnalysis(all) {
  const byProduct = {};
  for (const p of all) {
    if (!byProduct[p.product_ean]) byProduct[p.product_ean] = {
      name: p.product_name, brand: p.product_brand, prices: [], image: p.product_image_url
    };
    byProduct[p.product_ean].prices.push(p.price_paid);
  }
  const products = Object.values(byProduct).filter(p => p.prices.length >= 2)
    .sort((a,b) => b.prices.length - a.prices.length).slice(0, 15);

  if (!products.length) return `<div class="empty-state" style="padding:3rem 1rem"><p>Compre um produto mais de uma vez para ver o histórico de preços</p></div>`;

  return `<div style="padding:0 1rem">
    ${products.map(p => {
      const min = Math.min(...p.prices), max = Math.max(...p.prices);
      const avg = p.prices.reduce((s,v) => s+v, 0) / p.prices.length;
      const last = p.prices[p.prices.length - 1];
      return `
        <div style="background:var(--card);border-radius:1rem;border:1px solid var(--border);padding:1rem;margin-bottom:.75rem;box-shadow:var(--shadow)">
          <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem">
            ${p.image ? `<img src="${p.image}" style="width:2.5rem;height:2.5rem;border-radius:.5rem;object-fit:cover">` : `<div style="width:2.5rem;height:2.5rem;border-radius:.5rem;background:var(--muted);display:flex;align-items:center;justify-content:center;color:var(--muted-fg)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg></div>`}
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:.875rem;line-height:1.3">${escHtml(p.name)}</div>
              ${p.brand ? `<div style="font-size:.75rem;color:var(--muted-fg)">${escHtml(p.brand)}</div>` : ''}
            </div>
            <div style="font-size:1rem;font-weight:700;color:var(--primary)">R$ ${last.toFixed(2)}</div>
          </div>
          <div style="display:flex;gap:1rem;font-size:.8125rem">
            <div><span style="color:var(--muted-fg)">Mín </span><span style="color:hsl(160,60%,40%);font-weight:600">R$ ${min.toFixed(2)}</span></div>
            <div><span style="color:var(--muted-fg)">Máx </span><span style="color:var(--destructive);font-weight:600">R$ ${max.toFixed(2)}</span></div>
            <div><span style="color:var(--muted-fg)">Média </span><span style="font-weight:600">R$ ${avg.toFixed(2)}</span></div>
            <div><span style="color:var(--muted-fg)">${p.prices.length}x comprado</span></div>
          </div>
        </div>`;
    }).join('')}
  </div>`;
}
