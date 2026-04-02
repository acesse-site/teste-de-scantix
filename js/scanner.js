// ===== SCANNER PAGE =====
let scannerProduct = null;
let scannerLastPurchase = null;
let html5QrCode = null;
let cameraScanLocked = false;
let cameraScanTimeout = null;
let scanAbortController = null;

const BARCODE_SVG = `<svg id="barcode-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(220,80%,50%)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="8" y1="7" x2="8" y2="17"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="16" y1="7" x2="16" y2="17"/><line x1="20" y1="10" x2="20" y2="14"/><line x1="4" y1="10" x2="4" y2="14"/></svg>`;

function renderScanner() {
  const page = document.getElementById('page-scanner');
  page.innerHTML = `
    <div class="scanner-hero">
      <div class="scanner-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="8" y1="7" x2="8" y2="17"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="16" y1="7" x2="16" y2="17"/><line x1="20" y1="10" x2="20" y2="14"/><line x1="4" y1="10" x2="4" y2="14"/></svg>
      </div>
      <h1>Scantix</h1>
      <p>Escaneie o código de barras do produto</p>
    </div>
    <div class="section-padding">
      <div class="barcode-input-wrap" id="barcode-wrap">
        ${BARCODE_SVG}
        <input type="text" id="ean-input" inputmode="numeric" placeholder="Bipe ou digite o EAN..."
          autocomplete="off" oninput="this.value=this.value.replace(/\D/g,'')"
          onkeydown="if(event.key==='Enter')triggerScan()">
        <button class="barcode-btn-camera" onclick="openCameraScanner()" title="Camêra">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </button>
      </div>
      <p class="barcode-input-hint">Bipe, digite o EAN + Enter, ou use a câmera</p>
      <div id="scan-cancel-row" style="display:none;justify-content:center;margin-top:.5rem">
        <button class="btn-secondary" style="height:2.25rem;font-size:.875rem;padding:0 1.25rem" onclick="cancelScan()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Cancelar busca
        </button>
      </div>
    </div>
    <div id="scanner-result" class="section-padding"></div>
  `;
  setTimeout(() => document.getElementById('ean-input')?.focus(), 100);
}

// ===== Validação de EAN =====
function validateEAN(ean) {
  if (!ean || !/^\d+$/.test(ean)) {
    return { valid: false, reason: 'O código deve conter apenas números.' };
  }
  const len = ean.length;
  if (![8, 12, 13, 14].includes(len)) {
    return { valid: false, reason: `Código com ${len} dígitos não é um EAN válido. EAN deve ter 8, 12, 13 ou 14 dígitos.` };
  }
  return { valid: true, reason: '' };
}

// ===== Busca principal =====
async function triggerScan() {
  const input = document.getElementById('ean-input');
  const ean = input?.value?.trim();
  if (!ean) return;

  const validation = validateEAN(ean);
  if (!validation.valid) {
    input.value = '';
    showEanValidationError(ean, validation.reason);
    return;
  }

  input.value = '';
  input.blur();

  if (scanAbortController) scanAbortController.abort();
  scanAbortController = new AbortController();
  const signal = scanAbortController.signal;

  setScannerLoading(true);
  clearScannerResult();

  try {
    const [lookupResult, lastPurchase] = await Promise.all([
      lookupProduct(ean),
      getLastPurchaseForEan(ean)
    ]);
    if (signal.aborted) return;
    const { product } = lookupResult;
    if (!product) { renderNotFound(ean); }
    else { scannerProduct = product; scannerLastPurchase = lastPurchase; renderProductResult(product, lastPurchase); }
  } catch (e) {
    if (signal.aborted) return;
    console.error(e);
    showToast('Erro ao buscar produto', 'error');
  } finally {
    if (!signal.aborted) {
      setScannerLoading(false);
      setTimeout(() => document.getElementById('ean-input')?.focus(), 100);
    }
  }
}

function cancelScan() {
  if (scanAbortController) { scanAbortController.abort(); scanAbortController = null; }
  setScannerLoading(false);
  clearScannerResult();
  setTimeout(() => document.getElementById('ean-input')?.focus(), 100);
}

// ===== Loading state =====
function setScannerLoading(loading) {
  const cancelRow = document.getElementById('scan-cancel-row');
  if (loading) {
    const icon = document.getElementById('barcode-icon');
    if (icon) icon.outerHTML = `<span class="spinner" id="barcode-icon"></span>`;
    if (cancelRow) cancelRow.style.display = 'flex';
  } else {
    const icon = document.getElementById('barcode-icon');
    if (icon) icon.outerHTML = BARCODE_SVG;
    if (cancelRow) cancelRow.style.display = 'none';
  }
}

function clearScannerResult() {
  const el = document.getElementById('scanner-result');
  if (el) el.innerHTML = '';
}

// ===== EAN inválido =====
function showEanValidationError(ean, reason) {
  const el = document.getElementById('scanner-result');
  if (!el) return;
  el.innerHTML = `
    <div class="not-found-card">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--destructive)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="17" r="1" fill="var(--destructive)"/></svg>
      <p style="color:var(--destructive)">Código inválido</p>
      <small>${escHtml(reason)}</small>
      <div style="margin-top:1rem;display:flex;flex-direction:column;gap:.5rem;width:100%">
        <button class="btn-secondary w-full" onclick="clearScannerResult();setTimeout(()=>document.getElementById('ean-input')?.focus(),50)">
          Escanear novamente
        </button>
        <button class="btn-primary w-full" onclick="openManualRegisterModal('${escHtml(ean)}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Cadastrar manualmente
        </button>
      </div>
    </div>`;
}

// ===== Não encontrado =====
function renderNotFound(ean) {
  const el = document.getElementById('scanner-result');
  if (!el) return;
  el.innerHTML = `
    <div class="not-found-card">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p>Produto não encontrado</p>
      <small>Nenhuma base de dados possui esse código</small>
      <button class="btn-primary w-full" style="margin-top:1rem" onclick="openManualRegisterModal('${escHtml(ean || '')}')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Cadastrar produto manualmente
      </button>
    </div>`;
}

// ===== Modal cadastro manual =====
let _manualImageFile = null;   // arquivo selecionado (câmera ou galeria)
let _manualImageUrl  = '';     // url final a salvar

function openManualRegisterModal(prefillEan) {
  _manualImageFile = null;
  _manualImageUrl  = '';

  // Reseta preview de imagem no modal
  const preview = document.getElementById('manual-image-preview');
  const placeholder = document.getElementById('manual-image-placeholder');
  if (preview)     { preview.src = ''; preview.classList.add('hidden'); }
  if (placeholder) placeholder.classList.remove('hidden');

  const urlInput = document.getElementById('manual-image-url');
  if (urlInput) urlInput.value = '';

  const eanInput = document.getElementById('manual-ean');
  const nameInput = document.getElementById('manual-name');
  const brandInput = document.getElementById('manual-brand');
  const errorEl = document.getElementById('manual-register-error');
  if (eanInput) eanInput.value = prefillEan || '';
  if (nameInput) nameInput.value = '';
  if (brandInput) brandInput.value = '';
  if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
  document.getElementById('manual-register-overlay').classList.remove('hidden');
  document.getElementById('manual-register-modal').classList.remove('hidden');
  setTimeout(() => nameInput?.focus(), 100);
}

function closeManualRegisterModal() {
  document.getElementById('manual-register-overlay').classList.add('hidden');
  document.getElementById('manual-register-modal').classList.add('hidden');
}

function showManualRegisterError(msg) {
  const el = document.getElementById('manual-register-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

// Seleção de imagem (câmera ou galeria)
function handleManualImageSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showManualRegisterError('Selecione uma imagem válida.'); return; }
  _manualImageFile = file;
  _manualImageUrl  = '';  // arquivo tem prioridade sobre URL
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('manual-image-preview');
    const placeholder = document.getElementById('manual-image-placeholder');
    if (preview)     { preview.src = e.target.result; preview.classList.remove('hidden'); }
    if (placeholder) placeholder.classList.add('hidden');
    // Limpa campo de URL para evitar confusão
    const urlInput = document.getElementById('manual-image-url');
    if (urlInput) urlInput.value = '';
  };
  reader.readAsDataURL(file);
}

// Preview ao digitar URL
function previewManualImageUrl(url) {
  _manualImageFile = null;  // URL tem prioridade quando digitada
  _manualImageUrl  = url.trim();
  const preview     = document.getElementById('manual-image-preview');
  const placeholder = document.getElementById('manual-image-placeholder');
  if (!url.trim()) {
    if (preview)     { preview.src = ''; preview.classList.add('hidden'); }
    if (placeholder) placeholder.classList.remove('hidden');
    return;
  }
  if (preview) {
    preview.src = url.trim();
    preview.classList.remove('hidden');
    preview.onerror = () => { preview.classList.add('hidden'); if (placeholder) placeholder.classList.remove('hidden'); };
    preview.onload  = () => { if (placeholder) placeholder.classList.add('hidden'); };
  }
}

async function handleManualRegister() {
  const ean   = document.getElementById('manual-ean')?.value?.trim();
  const name  = document.getElementById('manual-name')?.value?.trim();
  const brand = document.getElementById('manual-brand')?.value?.trim();

  if (!name) { showManualRegisterError('O nome do produto é obrigatório.'); return; }
  if (!ean)  { showManualRegisterError('O código EAN é obrigatório.'); return; }

  const validation = validateEAN(ean);
  if (!validation.valid) { showManualRegisterError(validation.reason); return; }

  const btn = document.getElementById('manual-register-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    // Verifica se EAN já existe no banco geral
    const { data: existing } = await db.from('products').select('id').eq('ean', ean).limit(1);
    if (existing && existing.length > 0) {
      showManualRegisterError('Este EAN já está cadastrado no banco de dados.');
      return;
    }

    // --- Resolve imagem ---
    let imageUrl = '';

    if (_manualImageFile) {
      // Upload do arquivo (câmera ou galeria) para o Storage do Supabase
      const user = await getCurrentUser();
      const ext  = _manualImageFile.type === 'image/png' ? 'png' : 'jpg';
      const path = `products/${ean}_${Date.now()}.${ext}`;
      const compressed = await compressProductImage(_manualImageFile);
      const { error: upErr } = await db.storage
        .from('products')
        .upload(path, compressed, { contentType: compressed.type, upsert: false });
      if (upErr) {
        showManualRegisterError('Erro ao enviar imagem: ' + upErr.message);
        return;
      }
      const { data: { publicUrl } } = db.storage.from('products').getPublicUrl(path);
      imageUrl = publicUrl;
    } else if (_manualImageUrl) {
      imageUrl = _manualImageUrl;
    }

    // --- Salva no banco geral ---
    const product = {
      ean,
      name,
      brand:     brand    || '',
      image_url: imageUrl || '',
      source:    'manual',
      price:     null
    };

    const saved = await saveProductToDB(product);

    if (!saved) {
      // RLS bloqueou (não deveria com a policy correta, mas como fallback salva override)
      await saveUserOverride(ean, { name, brand: brand || '', image_url: imageUrl || '' });
      showToast('Produto salvo no seu perfil!', 'success');
    } else {
      showToast('Produto cadastrado com sucesso!', 'success');
    }

    closeManualRegisterModal();
    clearScannerResult();
    const input = document.getElementById('ean-input');
    if (input) { input.value = ean; triggerScan(); }
  } catch (e) {
    console.error(e);
    showManualRegisterError('Erro ao cadastrar produto. Tente novamente.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Cadastrar';
  }
}

// Comprime imagem de produto: máx 800px, 400kb
function compressProductImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_DIM  = 800;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
        else                { width  = Math.round(width  * MAX_DIM / height); height = MAX_DIM; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      let quality = 0.85;
      const MAX_BYTES = 400 * 1024;
      const tryCompress = () => {
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('Falha na compressão')); return; }
          if (blob.size <= MAX_BYTES || quality <= 0.3) {
            resolve(new File([blob], 'product.jpg', { type: 'image/jpeg' }));
          } else { quality -= 0.1; tryCompress(); }
        }, 'image/jpeg', quality);
      };
      tryCompress();
    };
    img.onerror = () => reject(new Error('Imagem inválida'));
    img.src = url;
  });
}

// ===== Resultado produto =====
function renderProductResult(product, lastPurchase) {
  const el = document.getElementById('scanner-result');
  if (!el) return;
  const lastPrice = lastPurchase?.price_paid;
  const suggestedPrice = product.price || '';
  el.innerHTML = `
    <div class="product-result-card">
      <div class="product-result-top">
        ${product.image_url
          ? `<img src="${product.image_url}" class="product-thumb" onerror="this.style.display='none'">`
          : `<div class="product-thumb-placeholder"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg></div>`}
        <div class="product-info">
          <h3>${escHtml(product.name)}</h3>
          ${product.brand ? `<p class="brand">${escHtml(product.brand)}</p>` : ''}
          <p class="ean">${product.ean}</p>
        </div>
      </div>
      ${lastPrice ? `<div class="last-price-row">Último preço: <strong>R$ ${lastPrice.toFixed(2)}</strong></div>` : ''}
      <div class="product-actions">
        <div class="product-inputs">
          <div style="flex:1">
            <label style="font-size:.8125rem;font-weight:500;display:block;margin-bottom:.375rem">Preço (R$)</label>
            <input type="number" id="result-price" step="0.01" min="0" placeholder="0,00"
              value="${suggestedPrice}" oninput="updatePriceDiff()"
              style="width:100%;font-size:1.125rem;font-weight:600;height:3rem;padding:.625rem .875rem">
          </div>
          <div style="width:7rem">
            <label style="font-size:.8125rem;font-weight:500;display:block;margin-bottom:.375rem">Qtd</label>
            <div class="qty-control">
              <button onclick="changeResultQty(-1)">−</button>
              <span id="result-qty">1</span>
              <button onclick="changeResultQty(1)">+</button>
            </div>
          </div>
        </div>
        <div id="price-diff-indicator" class="price-diff hidden"></div>
        <button class="btn-primary w-full" style="height:3rem;font-size:1rem;border-radius:.75rem" onclick="addResultToCart()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          Adicionar ao Carrinho
        </button>
      </div>
    </div>`;
  if (lastPrice) setTimeout(updatePriceDiff, 50);
}

let resultQty = 1;
function changeResultQty(delta) {
  resultQty = Math.max(1, resultQty + delta);
  const el = document.getElementById('result-qty');
  if (el) el.textContent = resultQty;
}

function updatePriceDiff() {
  const priceInput = document.getElementById('result-price');
  const indicator = document.getElementById('price-diff-indicator');
  if (!priceInput || !indicator || !scannerLastPurchase) return;
  const price = parseFloat(priceInput.value);
  const last = scannerLastPurchase.price_paid;
  if (!price || !last) { indicator.classList.add('hidden'); return; }
  const diff = ((price - last) / last) * 100;
  indicator.classList.remove('hidden', 'up', 'down', 'same');
  if (diff > 0.1) {
    indicator.classList.add('up');
    indicator.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> ${diff.toFixed(1)}% mais caro`;
  } else if (diff < -0.1) {
    indicator.classList.add('down');
    indicator.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg> ${Math.abs(diff).toFixed(1)}% mais barato`;
  } else {
    indicator.classList.add('same');
    indicator.textContent = 'Mesmo preço';
  }
}

function addResultToCart() {
  if (!scannerProduct) return;
  const priceInput = document.getElementById('result-price');
  const price = parseFloat(priceInput?.value);
  if (!price || price <= 0) { showToast('Informe o preço do produto', 'error'); return; }
  addToCart({
    product_id: scannerProduct.id || '',
    product_ean: scannerProduct.ean,
    product_name: scannerProduct.name,
    product_brand: scannerProduct.brand || '',
    product_image_url: scannerProduct.image_url || '',
    price_paid: price,
    quantity: resultQty,
    last_price: scannerLastPurchase?.price_paid || null
  });
  showToast('Adicionado ao carrinho!', 'success');
  scannerProduct = null; scannerLastPurchase = null; resultQty = 1;
  clearScannerResult();
  setTimeout(() => document.getElementById('ean-input')?.focus(), 100);
}

// ===== CÂMERA =====
function openCameraScanner() {
  cameraScanLocked = false;
  document.getElementById('camera-modal').classList.remove('hidden');
  startCameraScanner();
}

function closeCameraScanner() {
  document.getElementById('camera-modal').classList.add('hidden');
  stopCameraScanner();
  if (cameraScanTimeout) { clearTimeout(cameraScanTimeout); cameraScanTimeout = null; }
  cameraScanLocked = false;
}

function stopCameraScanner() {
  if (html5QrCode?.isScanning) html5QrCode.stop().catch(() => {});
  html5QrCode = null;
}

function applyAutofocus() {
  const vid = document.querySelector('#camera-reader video');
  if (!vid?.srcObject) return;
  vid.srcObject.getVideoTracks().forEach(track => {
    const cap = track.getCapabilities?.() || {};
    if (cap.focusMode?.includes('continuous')) {
      track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    }
  });
}

function onScanSuccess(code, readerEl) {
  if (cameraScanLocked) return;
  cameraScanLocked = true;
  const feedbackEl = document.createElement('div');
  feedbackEl.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,200,100,.3);z-index:10;pointer-events:none';
  feedbackEl.innerHTML = '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
  readerEl.style.position = 'relative';
  readerEl.appendChild(feedbackEl);
  cameraScanTimeout = setTimeout(() => {
    closeCameraScanner();
    handleCameraScan(code);
  }, 500);
}

async function startCameraScanner() {
  const readerEl = document.getElementById('camera-reader');
  readerEl.innerHTML = '<p style="color:rgba(255,255,255,.5);text-align:center;padding:3rem 1rem">Abrindo câmera...</p>';
  try {
    const devices = await Html5Qrcode.getCameras();
    if (!devices || devices.length === 0) {
      readerEl.innerHTML = '<p style="color:#f88;text-align:center;padding:2rem">Nenhuma câmera encontrada</p>';
      return;
    }
    const backCamera = devices[devices.length - 1];
    html5QrCode = new Html5Qrcode('camera-reader');
    await html5QrCode.start(
      backCamera.id,
      { fps: 15, qrbox: { width: 280, height: 120 }, aspectRatio: 1.7,
        videoConstraints: { deviceId: { exact: backCamera.id }, focusMode: 'continuous' } },
      (code) => onScanSuccess(code, readerEl),
      () => {}
    );
    setTimeout(applyAutofocus, 1000);
    const focusInterval = setInterval(() => {
      if (!html5QrCode?.isScanning) { clearInterval(focusInterval); return; }
      applyAutofocus();
    }, 3000);
  } catch (e) {
    readerEl.innerHTML = '<p style="color:#f88;text-align:center;padding:2rem">Não foi possível acessar a câmera.<br>Verifique as permissões do navegador.</p>';
  }
}

function handleCameraScan(code) {
  const cleaned = code.trim();
  if (cleaned.length >= 8) {
    const input = document.getElementById('ean-input');
    if (input) { input.value = cleaned; triggerScan(); }
  }
}
