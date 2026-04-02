// ===== PRODUCT LOOKUP =====
// Sistema de dois níveis:
// 1. user_products — sobreposições pessoais do usuário (nome, marca, foto)
// 2. products      — banco geral (somente admin edita)
// Na exibição: user_products tem prioridade sobre products

// Cache de verificação de admin na sessão
let _isAdminCache = null;

async function checkIsAdmin() {
  if (_isAdminCache !== null) return _isAdminCache;
  const user = await getCurrentUser();
  if (!user) { _isAdminCache = false; return false; }
  const { data } = await db.from('admins').select('user_id').eq('user_id', user.id).single();
  _isAdminCache = !!data;
  return _isAdminCache;
}

// Mescla produto geral com sobreposição do usuário
// Campos do user_products sobrescrevem os do banco geral
function mergeWithOverride(baseProduct, override) {
  if (!override) return baseProduct;
  return {
    ...baseProduct,
    name:      override.name      || baseProduct.name,
    brand:     override.brand     || baseProduct.brand,
    image_url: override.image_url || baseProduct.image_url,
    _override: override,          // guarda referência para edições futuras
    _hasOverride: true
  };
}

// Busca sobreposição do usuário para um EAN
async function getUserOverride(ean) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await db.from('user_products')
    .select('*')
    .eq('user_id', user.id)
    .eq('product_ean', ean)
    .single();
  return data || null;
}

// Busca sobreposições do usuário para vários EANs de uma vez
async function getUserOverrides(eans) {
  if (!eans.length) return {};
  const user = await getCurrentUser();
  if (!user) return {};
  const { data } = await db.from('user_products')
    .select('*')
    .eq('user_id', user.id)
    .in('product_ean', eans);
  const map = {};
  (data || []).forEach(o => map[o.product_ean] = o);
  return map;
}

// Busca produto no banco geral pelo EAN
async function searchLocalDB(ean) {
  const { data } = await db.from('products').select('*').eq('ean', ean).limit(1);
  return data && data.length > 0 ? data[0] : null;
}

async function searchOpenFoodFacts(ean) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    return {
      ean,
      name: p.product_name || p.generic_name || 'Produto sem nome',
      brand: p.brands || '',
      image_url: p.image_url || p.image_front_url || '',
      price: null,
      source: 'openfoodfacts'
    };
  } catch { return null; }
}

async function searchBluesoft(ean) {
  try {
    const res = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${ean}`, {
      headers: { 'X-Cosmos-Token': BLUESOFT_TOKEN }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.description) return null;
    return {
      ean,
      name: data.description || 'Produto sem nome',
      brand: data.brand?.name || '',
      image_url: data.thumbnail || '',
      price: data.avg_price || null,
      source: 'bluesoft'
    };
  } catch { return null; }
}

// Salva novo produto no banco geral (só admin consegue, policy do Supabase garante)
async function saveProductToDB(product) {
  const { data, error } = await db.from('products').insert(product).select().single();
  if (error) { console.error('Save product error:', error); return null; }
  return data;
}

// Salva/atualiza sobreposição do usuário
async function saveUserOverride(ean, fields) {
  const user = await getCurrentUser();
  if (!user) return null;
  const payload = {
    user_id: user.id,
    product_ean: ean,
    ...fields,
    updated_at: new Date().toISOString()
  };
  // upsert — cria se não existe, atualiza se já existe
  const { data, error } = await db.from('user_products')
    .upsert(payload, { onConflict: 'user_id,product_ean' })
    .select().single();
  if (error) { console.error('Save override error:', error); return null; }
  return data;
}

// Deleta sobreposição do usuário (volta a usar dados do banco geral)
async function deleteUserOverride(ean) {
  const user = await getCurrentUser();
  if (!user) return;
  await db.from('user_products')
    .delete()
    .eq('user_id', user.id)
    .eq('product_ean', ean);
}

// Lookup principal — busca produto e aplica override do usuário
async function lookupProduct(ean) {
  // Busca banco geral e override do usuário em paralelo
  const [baseProduct, override] = await Promise.all([
    searchLocalDB(ean),
    getUserOverride(ean)
  ]);

  if (baseProduct) {
    return { product: mergeWithOverride(baseProduct, override), isNew: false };
  }

  // Não achou localmente — busca nas APIs externas
  const off = await searchOpenFoodFacts(ean);
  if (off) {
    const saved = await saveProductToDB(off);
    const base = saved || off;
    return { product: mergeWithOverride(base, override), isNew: true };
  }

  const blue = await searchBluesoft(ean);
  if (blue) {
    const saved = await saveProductToDB(blue);
    const base = saved || blue;
    return { product: mergeWithOverride(base, override), isNew: true };
  }

  return { product: null, isNew: false };
}

async function getLastPurchaseForEan(ean) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await db.from('purchases')
    .select('*')
    .eq('product_ean', ean)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1);
  return data && data.length > 0 ? data[0] : null;
}
