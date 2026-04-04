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

// ===== PRODUCTS PAGE =====
let allProducts = [];
let productSearch = '';
let productPage = 1;
const PRODUCTS_PER_PAGE = 20;
let editingProduct = null;
let addCartProduct = null;
let addCartQtyVal = 1;
let addCartLastPrice = null;

async function renderProductsPage() {
  const page = document.getElementById('page-products');
  if (!page) {
    // Products page is accessed from profile drawer, create it dynamically
    const main = document.getElementById('main-app');
    const existingProducts = document.getElementById('products-page-overlay');
    if (existingProducts) existingProducts.remove();

    const overlay = document.createElement('div');
    overlay.id = 'products-page-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:55;background:var(--bg);overflow-y:auto;padding-bottom:2rem';
    overlay.innerHTML = `
      <div style="max-width:32rem;margin:0 auto">
        <div style="display:flex;align-items:center;gap:.75rem;padding:1rem;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg);z-index:1">
          <button onclick="document.getElementById('products-page-overlay').remove()" style="width:2.25rem;height:2.25rem;border:1.5px solid var(--border);border-radius:50%;background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 style="font-size:1.25rem;font-weight:700">Produtos</h1>
        </div>
        <div id="products-overlay-content"><div style="display:flex;align-items:center;justify-content:center;height:60vh"><span class="spinner" style="width:2.5rem;height:2.5rem;border-width:4px"></span></div></div>
      </div>`;
    main.appendChild(overlay);
    await loadAndRenderProducts('products-overlay-content');
    return;
  }
  await loadAndRenderProducts('page-products');
}

async function loadAndRenderProducts(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const user = await getCurrentUser();
  if (!user) return;

  // Verifica se é admin (para mostrar/esconder opções)
  const isAdmin = await checkIsAdmin();
  window._userIsAdmin = isAdmin;

  // Busca todos os produtos do banco geral
  // Busca todos os produtos, deduplica por EAN (mantém o mais recente de cada)
  const { data: allProds } = await db.from('products').select('*').order('name');
  const seen = new Set();
  const base = (allProds || []).filter(p => {
    if (seen.has(p.ean)) return false;
    seen.add(p.ean);
    return true;
  });

  // Busca todas as sobreposições do usuário de uma vez
  const eans = base.map(p => p.ean);
  const overrides = await getUserOverrides(eans);

  // Mescla: override do usuário tem prioridade
  allProducts = base.map(p => mergeWithOverride(p, overrides[p.ean] || null));

  renderProductsList(containerId);
}

function renderProductsList(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const isAdmin = window._userIsAdmin || false;

  const filtered = allProducts.filter(p => {
    if (!productSearch) return true;
    const q = productSearch.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q) || p.ean?.includes(q);
  });

  const total = filtered.length;
  const totalPages = Math.ceil(total / PRODUCTS_PER_PAGE);
  const start = (productPage - 1) * PRODUCTS_PER_PAGE;
  const paged = filtered.slice(start, start + PRODUCTS_PER_PAGE);

  const itemsHtml = paged.map(p => `
    <div class="product-item">
      ${p.image_url
        ? `<img src="${p.image_url}" class="product-item-thumb" onerror="this.style.display='none'">`
        : `<div class="product-item-placeholder"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg></div>`
      }
      <div class="product-item-info">
        <h3>${escHtml(p.name)}</h3>
        ${p.brand ? `<div class="brand">${escHtml(p.brand)}</div>` : ''}
        ${p.price ? `<div class="last-price">Último: R$ ${parseFloat(p.price).toFixed(2)}</div>` : ''}
      </div>
      <div class="product-item-actions">
        <button class="btn-icon-sm" onclick="openEditModal('${p.id}')" title="Editar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon-sm blue" onclick="openAddCartModal('${p.id}')" title="Adicionar ao carrinho">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        </button>
        ${isAdmin ? `
        <button class="btn-icon-sm red" onclick="confirmDeleteProduct('${p.id}', '${escHtml(p.name).replace(/'/g, "\\'")}')" title="Excluir produto">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>` : ''}
      </div>
    </div>`).join('');

  const paginationHtml = totalPages > 1 ? `
    <div class="pagination">
      ${Array.from({ length: totalPages }, (_, i) => `
        <button class="${i+1===productPage?'active':''}" onclick="goProductPage(${i+1})">${i+1}</button>`).join('')}
    </div>` : '';

  const prefix = containerId === 'page-products'
    ? `<div class="page-header"><h1>Produtos</h1><p>${total} cadastrados</p></div>`
    : `<div style="padding:1rem 1rem .5rem;color:var(--muted-fg);font-size:.875rem">${total} produtos</div>`;

  container.innerHTML = `
    ${prefix}
    <div class="products-search-wrap">
      <div class="barcode-input-wrap" id="products-barcode-wrap">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(220,80%,50%)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          id="products-search-input"
          placeholder="Nome, marca ou código EAN..."
          value="${escHtml(productSearch)}"
          autocomplete="off"
          oninput="onProductsSearchInput(this.value, '${containerId}')"
          onkeydown="if(event.key==='Enter')onProductsSearchEnter('${containerId}')">
        ${productSearch ? `
        <button onclick="clearProductsSearch('${containerId}')" title="Limpar" style="width:1.75rem;height:1.75rem;border:none;background:var(--muted);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:var(--muted-fg)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>` : ''}
        <button class="barcode-btn-camera" onclick="openProductsCameraScanner('${containerId}')" title="Escanear código de barras">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </button>
      </div>
      <p class="barcode-input-hint">Busque por nome, marca, EAN ou escaneie o código</p>
    </div>
    <div class="products-list">${itemsHtml || '<div class="empty-state" style="padding:2rem 1rem"><p>Nenhum produto encontrado</p></div>'}</div>
    ${paginationHtml}`;
}

// ===== SEARCH HANDLERS =====

function onProductsSearchInput(value, containerId) {
  productSearch = value;
  productPage = 1;
  renderProductsList(containerId);
}

function onProductsSearchEnter(containerId) {
  // Se o valor digitado parece um EAN (só números, 8-14 dígitos), destaca o resultado
  const val = productSearch.trim();
  if (/^\d{8,14}$/.test(val)) {
    const match = allProducts.find(p => p.ean === val);
    if (match) {
      showToast(`Produto encontrado: ${match.name}`, 'success');
    } else {
      showToast('Nenhum produto com esse EAN', 'error');
    }
  }
}

function clearProductsSearch(containerId) {
  productSearch = '';
  productPage = 1;
  renderProductsList(containerId);
  setTimeout(() => document.getElementById('products-search-input')?.focus(), 50);
}

function openProductsCameraScanner(containerId) {
  // Abre o modal de câmera existente e redireciona o resultado para o filtro de produtos
  document.getElementById('camera-modal').classList.remove('hidden');
  startCameraScanner();

  // Sobrescreve o handler padrão para filtrar produtos em vez de escanear
  window._productsCamContainerId = containerId;
  window._productsFilterMode = true;
}

// Intercepta o resultado do scanner quando estamos em modo filtro de produtos
// Esta função é chamada em scanner.js via handleCameraScan — precisamos de um hook
const _origHandleCameraScan = typeof handleCameraScan === 'function' ? handleCameraScan : null;

function handleProductsCameraScan(code) {
  if (!window._productsFilterMode) return false;
  window._productsFilterMode = false;
  const ean = code.replace(/\D/g, '');
  closeCameraScanner();
  const containerId = window._productsCamContainerId || 'products-overlay-content';
  productSearch = ean;
  productPage = 1;
  renderProductsList(containerId);
  // Foca no input para o utilizador ver o EAN preenchido
  setTimeout(() => {
    const inp = document.getElementById('products-search-input');
    if (inp) { inp.value = ean; inp.focus(); }
  }, 100);
  return true;
}

function goProductPage(p) {
  productPage = p;
  const cid = document.getElementById('products-overlay-content') ? 'products-overlay-content' : 'page-products';
  renderProductsList(cid);
}

// ===== EXCLUIR PRODUTO (somente admin) =====

function confirmDeleteProduct(id, name) {
  openConfirmModal(
    'Excluir produto',
    `Isso vai excluir "${name}" e todos os registros relacionados (compras, estoque, overrides). Esta ação não pode ser desfeita.`,
    () => deleteProductById(id)
  );
}

async function deleteProductById(id) {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  const ean = product.ean;

  showToast('Excluindo produto...', 'info');

  try {
    const user = await getCurrentUser();
    if (!user) return;

    // 1. Deleta imagem do storage se for do nosso bucket
    const imageUrl = product.image_url || '';
    if (imageUrl && imageUrl.includes('product-images')) {
      const bucketStr = '/product-images/';
      const idx = imageUrl.indexOf(bucketStr);
      if (idx !== -1) {
        const oldPath = imageUrl.substring(idx + bucketStr.length).split('?')[0];
        await db.storage.from('product-images').remove([oldPath]).catch(() => {});
      }
    }

    // 2. Deleta purchases relacionadas (todos os usuários que compraram esse EAN)
    await db.from('purchases').delete().eq('product_ean', ean);

    // 3. Deleta stock relacionado (todos os usuários)
    await db.from('stock').delete().eq('product_ean', ean);

    // 4. Deleta overrides de todos os usuários para esse EAN
    await db.from('user_products').delete().eq('product_ean', ean);

    // 5. Deleta o produto do banco geral
    const { error } = await db.from('products').delete().eq('id', id);
    if (error) throw error;

    showToast('Produto excluído com sucesso!', 'success');

    // Recarrega a lista
    const cid = document.getElementById('products-overlay-content') ? 'products-overlay-content' : 'page-products';
    await loadAndRenderProducts(cid);

  } catch (e) {
    console.error('[Scantix] Erro ao excluir produto:', e);
    showToast('Erro ao excluir: ' + e.message, 'error');
  }
}

// ===== IMAGE UPLOAD + COMPRESS =====

// Comprime imagem no navegador antes do upload
// Reduz para no máximo 800px e qualidade 0.75 — fica ~80-150kb
function compressImage(file, maxKb = 800) {
  return new Promise((resolve, reject) => {
    const MAX_BYTES = maxKb * 1024;
    // Se já está dentro do limite, devolve direto
    if (file.size <= MAX_BYTES) { resolve(file); return; }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      // Reduz dimensões mantendo proporção (máx 800px)
      const MAX_DIM = 800;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
        else { width = Math.round(width * MAX_DIM / height); height = MAX_DIM; }
      }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Comprime progressivamente até caber em maxKb
      let quality = 0.8;
      const tryCompress = () => {
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('Falha na compressão')); return; }
          if (blob.size <= MAX_BYTES || quality <= 0.3) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          } else {
            quality -= 0.1;
            tryCompress();
          }
        }, 'image/jpeg', quality);
      };
      tryCompress();
    };
    img.onerror = () => reject(new Error('Imagem inválida'));
    img.src = url;
  });
}

// Preview ao selecionar arquivo
function handleEditImageSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  // Valida tipo
  if (!file.type.startsWith('image/')) { showToast('Selecione uma imagem válida', 'error'); return; }

  // Preview imediato
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('edit-image-preview');
    const placeholder = document.getElementById('edit-image-placeholder');
    const area = document.getElementById('edit-image-area');
    preview.src = e.target.result;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
    area.classList.add('has-image');
  };
  reader.readAsDataURL(file);

  // Limpa URL manual
  document.getElementById('edit-image').value = '';

  const status = document.getElementById('edit-image-upload-status');
  const sizekb = Math.round(file.size / 1024);
  status.textContent = `Arquivo: ${file.name} (${sizekb}kb) — será comprimido no envio`;
  status.classList.remove('hidden');
}

// Preview ao colar URL
function previewEditImageUrl(url) {
  if (!url) return;
  const preview = document.getElementById('edit-image-preview');
  const placeholder = document.getElementById('edit-image-placeholder');
  const area = document.getElementById('edit-image-area');
  preview.src = url;
  preview.onload = () => {
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
    area.classList.add('has-image');
  };
  preview.onerror = () => {
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    area.classList.remove('has-image');
  };
}

// Edit modal
function openEditModal(id) {
  editingProduct = allProducts.find(p => p.id === id);
  if (!editingProduct) return;

  const isAdmin = window._userIsAdmin || false;
  const hasOverride = editingProduct._hasOverride || false;

  // Preenche campos — usa dados do override se existir, senão do banco geral
  document.getElementById('edit-name').value = editingProduct.name || '';
  document.getElementById('edit-brand').value = editingProduct.brand || '';
  // EAN: admin pode editar, usuário comum não
  const eanInput = document.getElementById('edit-ean');
  eanInput.value = editingProduct.ean || '';
  eanInput.readOnly = !isAdmin;
  eanInput.style.opacity = isAdmin ? '1' : '0.5';
  eanInput.title = isAdmin ? '' : 'Apenas administradores podem editar o EAN';

  document.getElementById('edit-image').value = editingProduct.image_url || '';
  document.getElementById('edit-image-upload-status').classList.add('hidden');

  // Mostra badge informando o modo (admin ou usuário)
  const modalTitle = document.querySelector('#edit-modal .modal-header h3');
  if (isAdmin) {
    modalTitle.innerHTML = 'Editar Produto <span style="font-size:.75rem;background:hsl(220,80%,95%);color:hsl(220,80%,50%);padding:.125rem .5rem;border-radius:99px;font-weight:600;margin-left:.375rem">Admin</span>';
  } else if (hasOverride) {
    modalTitle.innerHTML = 'Editar Produto <span style="font-size:.75rem;background:hsl(160,60%,94%);color:hsl(160,60%,35%);padding:.125rem .5rem;border-radius:99px;font-weight:600;margin-left:.375rem">Sua versão</span>';
  } else {
    modalTitle.innerHTML = 'Editar Produto <span style="font-size:.75rem;background:var(--muted);color:var(--muted-fg);padding:.125rem .5rem;border-radius:99px;font-weight:500;margin-left:.375rem">Versão geral</span>';
  }

  // Mostra botão de resetar override (só se tiver override e não for admin)
  let resetBtn = document.getElementById('reset-override-btn');
  if (!resetBtn) {
    resetBtn = document.createElement('button');
    resetBtn.id = 'reset-override-btn';
    resetBtn.className = 'btn-secondary';
    resetBtn.style.cssText = 'font-size:.8125rem;padding:.5rem .75rem;margin-bottom:.75rem;width:100%';
    resetBtn.onclick = resetUserOverride;
    document.querySelector('#edit-modal .modal-body').prepend(resetBtn);
  }
  if (!isAdmin && hasOverride) {
    resetBtn.textContent = '↩ Voltar para versão geral do produto';
    resetBtn.classList.remove('hidden');
  } else {
    resetBtn.classList.add('hidden');
  }

  // Preview da imagem
  const preview = document.getElementById('edit-image-preview');
  const placeholder = document.getElementById('edit-image-placeholder');
  const area = document.getElementById('edit-image-area');
  const fileInput = document.getElementById('edit-image-file');
  fileInput.value = '';

  if (editingProduct.image_url) {
    preview.src = editingProduct.image_url;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
    area.classList.add('has-image');
  } else {
    preview.src = '';
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    area.classList.remove('has-image');
  }

  document.getElementById('edit-overlay').classList.remove('hidden');
  document.getElementById('edit-modal').classList.remove('hidden');
}

// Reseta override do usuário — volta a usar dados do banco geral
async function resetUserOverride() {
  if (!editingProduct) return;
  await deleteUserOverride(editingProduct.ean);
  showToast('Versão pessoal removida! Usando dados gerais.', 'success');
  closeEditModal();
  const cid = document.getElementById('products-overlay-content') ? 'products-overlay-content' : 'page-products';
  await loadAndRenderProducts(cid);
}

function closeEditModal() {
  document.getElementById('edit-overlay').classList.add('hidden');
  document.getElementById('edit-modal').classList.add('hidden');
  editingProduct = null;
}

async function saveProductEdit() {
  if (!editingProduct) return;

  const btn = document.getElementById('edit-save-btn');
  const status = document.getElementById('edit-image-upload-status');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const setStatus = (msg, color) => {
    status.textContent = msg;
    status.style.color = color || 'var(--muted-fg)';
    status.classList.remove('hidden');
    console.log('[Scantix]', msg);
  };

  try {
    const user = await getCurrentUser();
    if (!user) { showToast('Usuário não autenticado', 'error'); return; }

    let imageUrl = document.getElementById('edit-image').value.trim()
                   || editingProduct.image_url || '';

    // ── UPLOAD DE IMAGEM ──────────────────────────────────────
    const fileInput = document.getElementById('edit-image-file');
    const file = fileInput.files?.[0];

    if (file) {
      // PASSO 1 — Comprime
      setStatus('1/4 Comprimindo imagem...');
      let compressed;
      try {
        compressed = await compressImage(file, 800);
      } catch (e) {
        setStatus('Erro ao comprimir: ' + e.message, 'var(--destructive)');
        return;
      }
      const kb = Math.round(compressed.size / 1024);
      setStatus(`1/4 Comprimido: ${kb}kb ✓`);

      // PASSO 2 — Deleta imagem anterior se era do nosso storage
      const oldUrl = editingProduct.image_url || '';
      if (oldUrl && oldUrl.includes('product-images')) {
        setStatus('2/4 Removendo imagem anterior...');
        try {
          // Extrai path após o bucket name
          const bucketStr = '/product-images/';
          const idx = oldUrl.indexOf(bucketStr);
          if (idx !== -1) {
            const oldPath = oldUrl.substring(idx + bucketStr.length).split('?')[0];
            console.log('[Scantix] Deletando path:', oldPath);
            const { error: delErr } = await db.storage
              .from('product-images')
              .remove([oldPath]);
            if (delErr) console.warn('[Scantix] Aviso ao deletar antiga:', delErr.message);
            else setStatus('2/4 Imagem anterior removida ✓');
          }
        } catch (e) {
          console.warn('[Scantix] Erro ao deletar imagem antiga (ignorado):', e);
        }
      } else {
        setStatus('2/4 Sem imagem anterior para remover');
      }

      // PASSO 3 — Upload nova imagem
      const timestamp = Date.now();
      const storagePath = `products/${user.id}/${editingProduct.id}_${timestamp}.jpg`;
      setStatus(`3/4 Enviando para o storage... (${kb}kb)`);
      console.log('[Scantix] Fazendo upload para:', storagePath);

      const { data: uploadData, error: uploadError } = await db.storage
        .from('product-images')
        .upload(storagePath, compressed, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) {
        console.error('[Scantix] Erro upload:', uploadError);
        setStatus('Erro no upload: ' + uploadError.message, 'var(--destructive)');
        showToast('Erro no upload: ' + uploadError.message, 'error');
        return;
      }

      console.log('[Scantix] Upload OK:', uploadData);

      // PASSO 4 — Gera URL pública
      const { data: urlData } = db.storage
        .from('product-images')
        .getPublicUrl(storagePath);

      imageUrl = urlData.publicUrl;
      console.log('[Scantix] URL pública:', imageUrl);
      setStatus('3/4 Upload concluído ✓');
    }

    // ── SALVA NO BANCO ────────────────────────────────────────
    const isAdmin = window._userIsAdmin || false;
    setStatus(file ? '4/4 Salvando...' : 'Salvando...');

    const nameVal  = document.getElementById('edit-name').value.trim();
    const brandVal = document.getElementById('edit-brand').value.trim();
    const eanVal   = document.getElementById('edit-ean').value.trim();

    if (isAdmin) {
      // ADMIN — salva direto na tabela products (banco geral)
      console.log('[Scantix] Admin: salvando no banco geral');
      const updates = { name: nameVal, brand: brandVal, ean: eanVal, image_url: imageUrl };
      const { data: savedData, error: saveError } = await db
        .from('products').update(updates).eq('id', editingProduct.id).select().single();
      if (saveError) {
        console.error('[Scantix] Erro admin save:', saveError);
        setStatus('Erro ao salvar: ' + saveError.message, 'var(--destructive)');
        showToast('Erro ao salvar: ' + saveError.message, 'error');
        return;
      }
      console.log('[Scantix] Admin salvo:', savedData);
      // Sincroniza snapshots em purchases e stock de todos os usuários
      await syncProductSnapshots(editingProduct.ean, {
        product_name:      nameVal,
        product_brand:     brandVal,
        product_image_url: imageUrl
      }, null); // null = todos os usuários (admin)
    } else {
      // USUÁRIO COMUM — salva em user_products (sobreposição pessoal)
      // EAN não muda — usa o original do produto
      console.log('[Scantix] Usuário: salvando override pessoal para EAN:', editingProduct.ean);
      const overrideFields = { name: nameVal, brand: brandVal, image_url: imageUrl };
      const saved = await saveUserOverride(editingProduct.ean, overrideFields);
      if (!saved) {
        setStatus('Erro ao salvar versão pessoal', 'var(--destructive)');
        showToast('Erro ao salvar', 'error');
        return;
      }
      console.log('[Scantix] Override salvo:', saved);
      // Sincroniza snapshots em purchases e stock apenas do próprio usuário
      await syncProductSnapshots(editingProduct.ean, {
        product_name:      nameVal,
        product_brand:     brandVal,
        product_image_url: imageUrl
      }, user.id); // user.id = só deste usuário
    }

    setStatus('✓ Salvo com sucesso!', 'hsl(160,60%,40%)');
    showToast(isAdmin ? 'Produto atualizado no banco geral!' : 'Sua versão do produto foi salva!', 'success');

    setTimeout(async () => {
      closeEditModal();
      const cid = document.getElementById('products-overlay-content')
        ? 'products-overlay-content' : 'page-products';
      await loadAndRenderProducts(cid);
    }, 800);

  } catch (e) {
    console.error('[Scantix] Erro inesperado:', e);
    showToast('Erro: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Salvar';
  }
}

// Add to cart from products
async function openAddCartModal(id) {
  addCartProduct = allProducts.find(p => p.id === id);
  if (!addCartProduct) return;
  addCartQtyVal = 1;
  addCartLastPrice = null;
  document.getElementById('add-cart-product-name').textContent = addCartProduct.name;
  document.getElementById('add-cart-qty').textContent = 1;
  document.getElementById('add-cart-price').value = addCartProduct.price ? parseFloat(addCartProduct.price).toFixed(2) : '';
  document.getElementById('add-cart-diff').classList.add('hidden');

  const last = await getLastPurchaseForEan(addCartProduct.ean);
  addCartLastPrice = last?.price_paid || null;
  if (addCartLastPrice && !addCartProduct.price) {
    document.getElementById('add-cart-price').value = addCartLastPrice.toFixed(2);
  }
  updateAddCartDiff();

  document.getElementById('add-cart-overlay').classList.remove('hidden');
  document.getElementById('add-cart-modal').classList.remove('hidden');
}

function closeAddCartModal() {
  document.getElementById('add-cart-overlay').classList.add('hidden');
  document.getElementById('add-cart-modal').classList.add('hidden');
  addCartProduct = null;
}

function changeAddCartQty(delta) {
  addCartQtyVal = Math.max(1, addCartQtyVal + delta);
  document.getElementById('add-cart-qty').textContent = addCartQtyVal;
  updateAddCartDiff();
}

function updateAddCartDiff() {
  const price = parseFloat(document.getElementById('add-cart-price').value);
  const qty = addCartQtyVal || 1;
  const diffEl = document.getElementById('add-cart-diff');
  if (!price || !addCartLastPrice) { diffEl.classList.add('hidden'); diffEl.innerHTML = ''; return; }
  diffEl.classList.remove('hidden');
  diffEl.innerHTML = buildPriceDiffHtml(price, addCartLastPrice, qty);
}

function confirmAddCart() {
  if (!addCartProduct) return;
  const price = parseFloat(document.getElementById('add-cart-price').value);
  if (!price || price <= 0) { showToast('Informe o preço', 'error'); return; }
  addToCart({
    product_id: addCartProduct.id,
    product_ean: addCartProduct.ean,
    product_name: addCartProduct.name,
    product_brand: addCartProduct.brand || '',
    product_image_url: addCartProduct.image_url || '',
    price_paid: price,
    quantity: addCartQtyVal,
    last_price: addCartLastPrice
  });
  showToast('Adicionado ao carrinho!', 'success');
  closeAddCartModal();
}
