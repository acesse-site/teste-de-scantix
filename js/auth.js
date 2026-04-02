// ===== AUTH =====

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'register' && i === 1));
  });
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('auth-error').classList.add('hidden');
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return showAuthError('Preencha todos os campos');
  const btn = document.querySelector('#login-form .btn-primary');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  const { error } = await db.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.innerHTML = '<span>Entrar</span>';
  if (error) showAuthError(error.message === 'Invalid login credentials' ? 'Email ou senha incorretos' : error.message);
}

async function handleRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!name || !email || !password) return showAuthError('Preencha todos os campos');
  if (password.length < 6) return showAuthError('A senha deve ter pelo menos 6 caracteres');
  const btn = document.querySelector('#register-form .btn-primary');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  const { error } = await db.auth.signUp({ email, password, options: { data: { full_name: name } } });
  btn.disabled = false; btn.innerHTML = '<span>Criar conta</span>';
  if (error) showAuthError(error.message);
  else showToast('Conta criada! Verifique seu email.', 'success');
}

async function handleGoogleLogin() {
  await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
}

async function handleLogout() {
  await db.auth.signOut();
  closeProfile();
  showAuthScreen();
}

function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
}

function showMainApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
}

// Profile drawer
function toggleProfile() {
  document.getElementById('profile-overlay').classList.toggle('hidden');
  document.getElementById('profile-drawer').classList.toggle('hidden');
  loadProfileData();
}
function closeProfile() {
  document.getElementById('profile-overlay').classList.add('hidden');
  document.getElementById('profile-drawer').classList.add('hidden');
}

async function loadProfileData() {
  const user = await getCurrentUser();
  if (!user) return;
  document.getElementById('profile-email').textContent = user.email;
  const name = user.user_metadata?.full_name || '';
  document.getElementById('profile-name').value = name;
  const avatarUrl = user.user_metadata?.avatar_url || '';
  const img = document.getElementById('profile-avatar-img');
  const topImg = document.getElementById('user-avatar');
  const fallback = document.getElementById('profile-avatar-fallback');
  const topFallback = document.getElementById('user-avatar-fallback');
  if (avatarUrl) {
    img.src = avatarUrl; img.classList.remove('hidden');
    fallback.classList.add('hidden');
    topImg.src = avatarUrl; topImg.classList.remove('hidden');
    topFallback.classList.add('hidden');
  }
}

async function saveName() {
  const name = document.getElementById('profile-name').value.trim();
  if (!name) return;
  await db.auth.updateUser({ data: { full_name: name } });
  showToast('Nome atualizado!', 'success');
}

async function handleAvatarChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Selecione uma imagem válida', 'error'); return; }

  const user = await getCurrentUser();
  if (!user) return;

  showToast('Enviando foto...', 'info');

  try {
    // Comprime avatar para máx 400px e 200kb — foto de perfil não precisa ser grande
    const compressed = await compressAvatar(file);
    const kb = Math.round(compressed.size / 1024);
    console.log('[Scantix] Avatar comprimido:', kb + 'kb');

    // Usa timestamp para evitar cache — sempre novo arquivo
    const timestamp = Date.now();
    const path = `avatars/${user.id}_${timestamp}.jpg`;

    // Deleta avatar anterior se existir
    const oldUrl = user.user_metadata?.avatar_url || '';
    if (oldUrl && oldUrl.includes('/avatars/')) {
      const bucketStr = '/avatars/';
      const idx = oldUrl.indexOf(bucketStr);
      if (idx !== -1) {
        const oldPath = oldUrl.substring(idx + bucketStr.length).split('?')[0];
        await db.storage.from('avatars').remove([oldPath]).catch(() => {});
      }
    }

    // Upload novo avatar
    const { error: uploadError } = await db.storage
      .from('avatars')
      .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });

    if (uploadError) {
      console.error('[Scantix] Erro upload avatar:', uploadError);
      showToast('Erro ao enviar foto: ' + uploadError.message, 'error');
      return;
    }

    // Pega URL pública
    const { data: { publicUrl } } = db.storage.from('avatars').getPublicUrl(path);
    console.log('[Scantix] Avatar URL:', publicUrl);

    // Salva no perfil do usuário
    const { error: updateError } = await db.auth.updateUser({ data: { avatar_url: publicUrl } });
    if (updateError) {
      console.error('[Scantix] Erro ao salvar avatar no perfil:', updateError);
      showToast('Erro ao salvar foto', 'error');
      return;
    }

    // Atualiza UI
    const img = document.getElementById('profile-avatar-img');
    const topImg = document.getElementById('user-avatar');
    img.src = publicUrl; img.classList.remove('hidden');
    document.getElementById('profile-avatar-fallback').classList.add('hidden');
    topImg.src = publicUrl; topImg.classList.remove('hidden');
    document.getElementById('user-avatar-fallback').classList.add('hidden');

    showToast('Foto atualizada!', 'success');
  } catch (e) {
    console.error('[Scantix] Erro inesperado no avatar:', e);
    showToast('Erro: ' + e.message, 'error');
  }
}

// Comprime avatar: máx 400px, 200kb
function compressAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_DIM = 400;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
        else { width = Math.round(width * MAX_DIM / height); height = MAX_DIM; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      let quality = 0.85;
      const MAX_BYTES = 200 * 1024;
      const tryCompress = () => {
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('Falha na compressão')); return; }
          if (blob.size <= MAX_BYTES || quality <= 0.3) {
            resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
          } else { quality -= 0.1; tryCompress(); }
        }, 'image/jpeg', quality);
      };
      tryCompress();
    };
    img.onerror = () => reject(new Error('Imagem inválida'));
    img.src = url;
  });
}

// Confirm modal
let confirmCallback = null;
function openConfirmModal(title, message, cb) {
  confirmCallback = cb;
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-input').value = '';
  document.getElementById('confirm-btn').disabled = true;
  document.getElementById('confirm-overlay').classList.remove('hidden');
  document.getElementById('confirm-modal').classList.remove('hidden');
}
function closeConfirmModal() {
  document.getElementById('confirm-overlay').classList.add('hidden');
  document.getElementById('confirm-modal').classList.add('hidden');
  confirmCallback = null;
}
function checkConfirmInput() {
  document.getElementById('confirm-btn').disabled =
    document.getElementById('confirm-input').value !== 'CONFIRMAR';
}
function executeConfirm() {
  if (confirmCallback) confirmCallback();
  closeConfirmModal();
}

async function confirmReset() {
  openConfirmModal('Redefinir dados', 'Isso apagará todas suas compras e produtos cadastrados.', async () => {
    const user = await getCurrentUser();
    if (!user) return;
    await db.from('purchases').delete().eq('user_id', user.id);
    await db.from('stock').delete().eq('user_id', user.id);
    await db.from('products').delete().eq('user_id', user.id).eq('source', 'manual');
    clearCart();
    showToast('Dados redefinidos!', 'success');
    closeProfile();
  });
}
