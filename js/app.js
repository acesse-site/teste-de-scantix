// ===== APP.JS — Main Init =====

let currentPage = 'scanner';

function navigate(page) {
  currentPage = page;
  // Update nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  // Show correct page
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');
  // Render page
  renderPage(page);
  window.scrollTo(0, 0);
}

function renderPage(page) {
  switch (page) {
    case 'scanner': renderScanner(); break;
    case 'cart': renderCartPage(); break;
    case 'stock': renderStockPage(); break;
    case 'purchases': renderPurchasesPage(); break;
    case 'analysis': renderAnalysisPage(); break;
    case 'products': renderProductsPage(); break;
  }
}

// Toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// HTML escape
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Date formatters
function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

function formatDateFull(dateStr) {
  if (!dateStr) return '';
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  try {
    const [y, m, d] = dateStr.split('-');
    return `${parseInt(d)} de ${months[parseInt(m)-1]} de ${y}`;
  } catch { return dateStr; }
}

// Init
async function init() {
  // Check for existing session
  const { data: { session } } = await db.auth.getSession();

  if (session) {
    showMainApp();
    navigate('scanner');
    updateCartBadge();
    loadProfileData();
  } else {
    showAuthScreen();
  }

  // Listen for auth state changes
  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      showMainApp();
      navigate('scanner');
      updateCartBadge();
      loadProfileData();
    } else if (event === 'SIGNED_OUT') {
      showAuthScreen();
    }
  });

  // Listen for cart updates
  window.addEventListener('cart-updated', () => {
    if (currentPage === 'cart') renderCartPage();
  });
}

// Check if Supabase is configured
if (SUPABASE_URL === 'COLE_SUA_URL_AQUI' || SUPABASE_ANON_KEY === 'COLE_SUA_ANON_KEY_AQUI') {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('app').innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;font-family:Inter,sans-serif">
        <div style="max-width:480px;background:#fff;border-radius:1.25rem;padding:2rem;box-shadow:0 4px 20px rgba(0,0,0,.1);text-align:center">
          <div style="font-size:3rem;margin-bottom:1rem">⚙️</div>
          <h2 style="font-size:1.5rem;font-weight:700;margin-bottom:.75rem;color:hsl(220,80%,50%)">Configure o Supabase</h2>
          <p style="color:#666;margin-bottom:1.25rem;line-height:1.6">Abra o arquivo <code style="background:#f0f2f5;padding:.125rem .375rem;border-radius:.25rem">js/config.js</code> e preencha suas credenciais do Supabase:</p>
          <div style="background:#1e1e2e;color:#cdd6f4;padding:1rem;border-radius:.75rem;text-align:left;font-family:monospace;font-size:.8125rem;line-height:1.8;margin-bottom:1.25rem">
            <span style="color:#cba6f7">const</span> SUPABASE_URL = <span style="color:#a6e3a1">'sua-url.supabase.co'</span>;<br>
            <span style="color:#cba6f7">const</span> SUPABASE_ANON_KEY = <span style="color:#a6e3a1">'sua-anon-key'</span>;
          </div>
          <p style="font-size:.875rem;color:#888">Crie sua conta gratuita em <a href="https://supabase.com" target="_blank" style="color:hsl(220,80%,50%)">supabase.com</a> e siga o <strong>README.md</strong> incluído no projeto.</p>
        </div>
      </div>`;
  });
} else {
  document.addEventListener('DOMContentLoaded', init);
}
