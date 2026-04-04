// ===== FAMILY / COMPARTILHAMENTO =====
// Sistema de contas compartilhadas entre família
// - Dono cria grupo, gera código de convite
// - Membros entram pelo código e acessam dados do dono
// - Sessão ativa salva no localStorage (qual conta está sendo visualizada)

const FAMILY_SESSION_KEY = 'scantix_active_account';

// ── Estado global da sessão de família ──────────────────────
// activeAccount = { type: 'own' } | { type: 'shared', ownerId, ownerName, ownerEmail, ownerAvatar, permissions }
let _activeAccount = null;

// Carrega conta ativa do localStorage
function loadActiveAccount() {
  try {
    const raw = localStorage.getItem(FAMILY_SESSION_KEY);
    _activeAccount = raw ? JSON.parse(raw) : { type: 'own' };
  } catch {
    _activeAccount = { type: 'own' };
  }
  return _activeAccount;
}

// Salva conta ativa
function saveActiveAccount(account) {
  _activeAccount = account;
  localStorage.setItem(FAMILY_SESSION_KEY, JSON.stringify(account));
}

// Retorna o user_id efetivo para queries (dono ou conta própria)
function getEffectiveUserId() {
  const acc = _activeAccount || loadActiveAccount();
  return acc.type === 'shared' ? acc.ownerId : null; // null = usa getCurrentUser()
}

// Retorna user_id efetivo como promise (resolve com string sempre)
async function getActiveUserId() {
  const eff = getEffectiveUserId();
  if (eff) return eff;
  const user = await getCurrentUser();
  return user?.id || null;
}

// Verifica se está em conta compartilhada
function isViewingSharedAccount() {
  const acc = _activeAccount || loadActiveAccount();
  return acc.type === 'shared';
}

// Retorna permissões da conta ativa
function getActivePermissions() {
  const acc = _activeAccount || loadActiveAccount();
  if (acc.type === 'own') return { can_purchase: true, can_edit: true, can_delete: true };
  return {
    can_purchase: acc.permissions?.can_purchase || false,
    can_edit:     acc.permissions?.can_edit     || false,
    can_delete:   acc.permissions?.can_delete   || false,
  };
}

// Verifica permissão específica
function hasPermission(perm) {
  return getActivePermissions()[perm] === true;
}

// ── Grupo do usuário ─────────────────────────────────────────

async function getOrCreateFamilyGroup() {
  const user = await getCurrentUser();
  if (!user) return null;
  // Busca grupo existente
  const { data: existing } = await db.from('family_groups')
    .select('*').eq('owner_id', user.id).single();
  if (existing) return existing;
  // Cria novo
  const { data: created, error } = await db.from('family_groups')
    .insert({ owner_id: user.id, name: 'Minha Família' })
    .select().single();
  if (error) { console.error('family group error:', error); return null; }
  return created;
}

// ── Convites ─────────────────────────────────────────────────

async function generateInviteCode(permissions = {}) {
  const group = await getOrCreateFamilyGroup();
  if (!group) return null;
  const { data, error } = await db.from('family_invites').insert({
    group_id:     group.id,
    can_purchase: permissions.can_purchase || false,
    can_edit:     permissions.can_edit     || false,
    can_delete:   permissions.can_delete   || false,
  }).select().single();
  if (error) { console.error('invite error:', error); return null; }
  return data;
}

async function acceptInviteCode(code) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Não autenticado' };

  // Busca convite pelo código
  const { data: invite, error: invErr } = await db.from('family_invites')
    .select('*, family_groups(*)')
    .eq('code', code.toUpperCase().trim())
    .single();

  if (invErr || !invite) return { error: 'Código inválido ou expirado' };
  if (invite.used_by)    return { error: 'Este código já foi utilizado' };
  if (new Date(invite.expires_at) < new Date()) return { error: 'Este código expirou' };

  const group = invite.family_groups;
  if (!group) return { error: 'Grupo não encontrado' };
  if (group.owner_id === user.id) return { error: 'Você não pode entrar no seu próprio grupo' };

  // Verifica se já é membro
  const { data: existing } = await db.from('family_members')
    .select('id').eq('group_id', group.id).eq('member_user_id', user.id).single();
  if (existing) return { error: 'Você já é membro deste grupo' };

  // Adiciona como membro
  const { error: memErr } = await db.from('family_members').insert({
    group_id:       group.id,
    member_user_id: user.id,
    can_purchase:   invite.can_purchase,
    can_edit:       invite.can_edit,
    can_delete:     invite.can_delete,
  });
  if (memErr) return { error: 'Erro ao entrar no grupo: ' + memErr.message };

  // Marca convite como usado
  await db.from('family_invites').update({ used_by: user.id, used_at: new Date().toISOString() }).eq('id', invite.id);

  return { success: true, group, invite };
}

async function getMyMemberships() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data } = await db.from('family_members')
    .select('*, family_groups(id, name, owner_id)')
    .eq('member_user_id', user.id);
  return data || [];
}

async function getGroupMembers(groupId) {
  const { data } = await db.from('family_members_view')
    .select('*').eq('group_id', groupId);
  return data || [];
}

async function updateMemberPermissions(memberId, permissions) {
  const { error } = await db.from('family_members').update(permissions).eq('id', memberId);
  return !error;
}

async function removeMember(memberId) {
  const { error } = await db.from('family_members').delete().eq('id', memberId);
  return !error;
}

async function revokeInvite(inviteId) {
  const { error } = await db.from('family_invites').delete().eq('id', inviteId);
  return !error;
}

async function getActiveInvites(groupId) {
  const { data } = await db.from('family_invites')
    .select('*')
    .eq('group_id', groupId)
    .is('used_by', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  return data || [];
}

// ── Busca info do dono para montar a sessão compartilhada ────

async function getOwnerInfo(ownerId) {
  const { data } = await db.from('family_groups')
    .select('owner_id, name')
    .eq('owner_id', ownerId).single();
  return data;
}

// ── Troca de conta ───────────────────────────────────────────

async function switchToOwnAccount() {
  saveActiveAccount({ type: 'own' });
  updateAccountBanner();
  renderPage(currentPage);
  showToast('Voltando para sua conta', 'info');
}

async function switchToSharedAccount(membership) {
  // membership = { family_groups: { owner_id, name }, can_purchase, can_edit, can_delete, ... }
  const group = membership.family_groups;

  // Busca nome/email do dono via família_groups_view
  const { data: ownerData } = await db.from('family_members_view')
    .select('*').eq('group_id', group.id).limit(1);

  // Pega email do dono via query separada (só temos acesso via family_groups)
  const account = {
    type:        'shared',
    ownerId:     group.owner_id,
    ownerName:   group.name,
    groupId:     group.id,
    permissions: {
      can_purchase: membership.can_purchase,
      can_edit:     membership.can_edit,
      can_delete:   membership.can_delete,
    }
  };
  saveActiveAccount(account);
  updateAccountBanner();
  navigate('stock');
  showToast(`Acessando: ${group.name}`, 'success');
}

// ── Banner de conta compartilhada (topbar) ───────────────────

function updateAccountBanner() {
  const existing = document.getElementById('family-banner');
  if (existing) existing.remove();

  const acc = _activeAccount || loadActiveAccount();
  if (acc.type !== 'shared') return;

  const perms = acc.permissions || {};
  const permText = [
    perms.can_purchase ? '🛒' : '',
    perms.can_edit     ? '✏️' : '',
    perms.can_delete   ? '🗑' : '',
  ].filter(Boolean).join(' ') || '👁 só visualizar';

  const banner = document.createElement('div');
  banner.id = 'family-banner';
  banner.style.cssText = `
    background: hsl(220,80%,50%);
    color: #fff;
    padding: .375rem 1rem;
    font-size: .75rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .5rem;
    position: sticky;
    top: 3.5rem;
    z-index: 40;
  `;
  banner.innerHTML = `
    <span style="font-weight:600">👨‍👩‍👧 ${escHtml(acc.ownerName)} ${permText}</span>
    <button onclick="switchToOwnAccount()" style="background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:.375rem;padding:.2rem .5rem;font-size:.7rem;cursor:pointer;font-weight:600">Sair</button>
  `;

  const pageContent = document.querySelector('.page-content');
  if (pageContent) pageContent.parentNode.insertBefore(banner, pageContent);
}

// ── UI: Painel de Família no drawer ──────────────────────────

async function renderFamilySection() {
  const container = document.getElementById('family-section');
  if (!container) return;
  container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:1rem"><span class="spinner"></span></div>`;

  const user = await getCurrentUser();
  if (!user) return;

  const [group, memberships] = await Promise.all([
    getOrCreateFamilyGroup(),
    getMyMemberships()
  ]);

  let html = '';

  // ── Seletor de conta ativa ──
  const acc = _activeAccount || loadActiveAccount();
  html += `
    <div style="margin-bottom:1rem">
      <div style="font-size:.75rem;font-weight:600;color:var(--muted-fg);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem">Conta ativa</div>
      <div style="display:flex;flex-direction:column;gap:.375rem">
        <button onclick="switchToOwnAccount()" style="
          display:flex;align-items:center;gap:.625rem;padding:.625rem .75rem;border-radius:.625rem;
          border:1.5px solid ${acc.type==='own'?'var(--primary)':'var(--border)'};
          background:${acc.type==='own'?'var(--primary-light)':'var(--card)'};
          cursor:pointer;text-align:left;transition:all .15s">
          <div style="width:2rem;height:2rem;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:#fff;font-size:.8rem;flex-shrink:0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.8125rem;font-weight:600;color:var(--fg)">Minha conta</div>
            <div style="font-size:.7rem;color:var(--muted-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(user.email)}</div>
          </div>
          ${acc.type==='own'?'<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--primary)" stroke="var(--primary)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>':''}
        </button>
        ${memberships.map(m => {
          const isActive = acc.type === 'shared' && acc.groupId === m.family_groups?.id;
          const g = m.family_groups;
          const perms = [m.can_purchase?'🛒':'', m.can_edit?'✏️':'', m.can_delete?'🗑':''].filter(Boolean).join(' ') || '👁';
          return `
          <button onclick="switchToSharedAccount(${JSON.stringify(m).replace(/"/g, '&quot;')})" style="
            display:flex;align-items:center;gap:.625rem;padding:.625rem .75rem;border-radius:.625rem;
            border:1.5px solid ${isActive?'var(--primary)':'var(--border)'};
            background:${isActive?'var(--primary-light)':'var(--card)'};
            cursor:pointer;text-align:left;transition:all .15s">
            <div style="width:2rem;height:2rem;border-radius:50%;background:hsl(280,70%,55%);display:flex;align-items:center;justify-content:center;color:#fff;font-size:.8rem;flex-shrink:0">👨‍👩‍👧</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:.8125rem;font-weight:600;color:var(--fg)">${escHtml(g?.name || 'Família')}</div>
              <div style="font-size:.7rem;color:var(--muted-fg)">${perms}</div>
            </div>
            ${isActive?'<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--primary)" stroke="var(--primary)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>':''}
          </button>`;
        }).join('')}
      </div>
    </div>`;

  // ── Entrar com código ──
  html += `
    <div style="margin-bottom:1rem">
      <div style="font-size:.75rem;font-weight:600;color:var(--muted-fg);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem">Entrar em família</div>
      <div style="display:flex;gap:.5rem">
        <input type="text" id="invite-code-input" placeholder="Código de convite" maxlength="8"
          style="flex:1;text-transform:uppercase;letter-spacing:.1em;font-weight:700"
          oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'')">
        <button class="btn-primary" style="white-space:nowrap" onclick="handleJoinFamily()">Entrar</button>
      </div>
    </div>`;

  // ── Meu grupo (gerenciar membros e convites) ──
  if (group) {
    const [members, invites] = await Promise.all([
      getGroupMembers(group.id),
      getActiveInvites(group.id)
    ]);

    html += `
      <div>
        <div style="font-size:.75rem;font-weight:600;color:var(--muted-fg);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem">Meu grupo · ${escHtml(group.name)}</div>

        ${members.length ? members.map(m => `
          <div style="display:flex;align-items:center;gap:.625rem;padding:.5rem 0;border-bottom:1px solid var(--border)">
            <div style="width:1.75rem;height:1.75rem;border-radius:50%;background:var(--muted);display:flex;align-items:center;justify-content:center;font-size:.75rem;flex-shrink:0">
              ${m.member_avatar ? `<img src="${escHtml(m.member_avatar)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : '👤'}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:.8125rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(m.member_name || m.member_email)}</div>
              <div style="font-size:.7rem;color:var(--muted-fg)">${escHtml(m.member_email)}</div>
            </div>
            <button onclick="openPermissionsModal('${m.id}','${escHtml(m.member_name||m.member_email)}',${m.can_purchase},${m.can_edit},${m.can_delete})"
              style="padding:.25rem .5rem;border-radius:.375rem;border:1px solid var(--border);background:var(--card);font-size:.7rem;cursor:pointer">
              ⚙️
            </button>
            <button onclick="handleRemoveMember('${m.id}','${escHtml(m.member_name||m.member_email)}')"
              style="padding:.25rem .5rem;border-radius:.375rem;border:1px solid hsl(0,70%,80%);background:hsl(0,70%,97%);color:hsl(0,65%,45%);font-size:.7rem;cursor:pointer">
              ✕
            </button>
          </div>`).join('') : `<p style="font-size:.8125rem;color:var(--muted-fg);margin:.5rem 0">Nenhum membro ainda.</p>`}

        <button onclick="openNewInviteModal('${group.id}')" style="
          width:100%;margin-top:.75rem;padding:.625rem;border-radius:.625rem;
          border:1.5px dashed var(--border);background:transparent;
          color:var(--primary);font-weight:600;font-size:.8125rem;cursor:pointer;
          display:flex;align-items:center;justify-content:center;gap:.375rem">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Gerar código de convite
        </button>

        ${invites.length ? `
          <div style="margin-top:.75rem">
            <div style="font-size:.7rem;color:var(--muted-fg);margin-bottom:.375rem">Convites ativos</div>
            ${invites.map(inv => {
              const exp = new Date(inv.expires_at);
              const days = Math.ceil((exp - new Date()) / 86400000);
              const perms = [inv.can_purchase?'🛒':'', inv.can_edit?'✏️':'', inv.can_delete?'🗑':''].filter(Boolean).join(' ')||'👁';
              return `
              <div style="display:flex;align-items:center;gap:.5rem;padding:.375rem 0;border-bottom:1px solid var(--border)">
                <code style="font-size:.9rem;font-weight:700;letter-spacing:.1em;color:var(--primary);flex:1">${inv.code}</code>
                <span style="font-size:.7rem;color:var(--muted-fg)">${perms} · ${days}d</span>
                <button onclick="copyInviteLink('${inv.code}')" style="padding:.2rem .4rem;border-radius:.3rem;border:1px solid var(--border);background:var(--card);font-size:.7rem;cursor:pointer">📋</button>
                <button onclick="handleRevokeInvite('${inv.id}')" style="padding:.2rem .4rem;border-radius:.3rem;border:1px solid hsl(0,70%,80%);background:hsl(0,70%,97%);color:hsl(0,65%,45%);font-size:.7rem;cursor:pointer">✕</button>
              </div>`;
            }).join('')}
          </div>` : ''}
      </div>`;
  }

  container.innerHTML = html;
}

// ── Handlers da UI ────────────────────────────────────────────

async function handleJoinFamily() {
  const code = document.getElementById('invite-code-input')?.value?.trim();
  if (!code || code.length < 6) { showToast('Digite o código completo', 'error'); return; }
  showToast('Verificando código...', 'info');
  const result = await acceptInviteCode(code);
  if (result.error) { showToast(result.error, 'error'); return; }
  showToast('Você entrou no grupo! ✓', 'success');
  await renderFamilySection();
}

function openNewInviteModal(groupId) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'invite-modal-overlay';
  overlay.onclick = closeInviteModal;

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'invite-modal';
  modal.innerHTML = `
    <div class="modal-header">
      <h3>Gerar convite</h3>
      <button class="icon-btn" onclick="closeInviteModal()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <p style="font-size:.875rem;color:var(--muted-fg);margin-bottom:1rem">Defina as permissões do familiar antes de gerar o código.</p>
      <div style="display:flex;flex-direction:column;gap:.625rem">
        ${[
          ['invite-perm-purchase', '🛒 Registrar compras e atualizar estoque'],
          ['invite-perm-edit',     '✏️ Editar produtos e informações'],
          ['invite-perm-delete',   '🗑 Excluir itens do estoque']
        ].map(([id, label]) => `
          <label style="display:flex;align-items:center;gap:.625rem;cursor:pointer;padding:.5rem;border-radius:.5rem;border:1px solid var(--border)">
            <input type="checkbox" id="${id}" style="width:1rem;height:1rem">
            <span style="font-size:.875rem">${label}</span>
          </label>`).join('')}
      </div>
      <div id="invite-result" class="hidden" style="margin-top:1rem;text-align:center">
        <div style="font-size:.8125rem;color:var(--muted-fg);margin-bottom:.375rem">Código de convite (válido por 7 dias)</div>
        <div id="invite-code-display" style="font-size:2rem;font-weight:800;letter-spacing:.2em;color:var(--primary);padding:.75rem;background:var(--primary-light);border-radius:.75rem"></div>
        <button onclick="copyInviteLink(document.getElementById('invite-code-display').textContent)" style="margin-top:.5rem;padding:.4rem .875rem;border-radius:.5rem;border:1px solid var(--border);background:var(--card);font-size:.8125rem;cursor:pointer">📋 Copiar código</button>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeInviteModal()">Fechar</button>
      <button id="gen-invite-btn" class="btn-primary" onclick="handleGenerateInvite('${groupId}')">Gerar código</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(modal);
  overlay.classList.remove('hidden');
  modal.classList.remove('hidden');
}

function closeInviteModal() {
  document.getElementById('invite-modal-overlay')?.remove();
  document.getElementById('invite-modal')?.remove();
  renderFamilySection();
}

async function handleGenerateInvite(groupId) {
  const btn = document.getElementById('gen-invite-btn');
  btn.disabled = true; btn.textContent = '...';
  const perms = {
    can_purchase: document.getElementById('invite-perm-purchase')?.checked || false,
    can_edit:     document.getElementById('invite-perm-edit')?.checked     || false,
    can_delete:   document.getElementById('invite-perm-delete')?.checked   || false,
  };
  const invite = await generateInviteCode(perms);
  btn.disabled = false; btn.textContent = 'Gerar código';
  if (!invite) { showToast('Erro ao gerar convite', 'error'); return; }
  document.getElementById('invite-result').classList.remove('hidden');
  document.getElementById('invite-code-display').textContent = invite.code;
}

function copyInviteLink(code) {
  const text = `Entre na minha família no Scantix!\nCódigo: ${code}`;
  navigator.clipboard?.writeText(text).then(() => showToast('Código copiado!', 'success'))
    .catch(() => showToast(`Código: ${code}`, 'info'));
}

function openPermissionsModal(memberId, memberName, canPurchase, canEdit, canDelete) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'perm-modal-overlay';
  overlay.onclick = closePermissionsModal;

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'perm-modal';
  modal.innerHTML = `
    <div class="modal-header">
      <h3>Permissões · ${escHtml(memberName)}</h3>
      <button class="icon-btn" onclick="closePermissionsModal()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div style="display:flex;flex-direction:column;gap:.625rem">
        ${[
          ['perm-purchase', '🛒 Registrar compras e atualizar estoque', canPurchase],
          ['perm-edit',     '✏️ Editar produtos e informações',          canEdit],
          ['perm-delete',   '🗑 Excluir itens do estoque',               canDelete],
        ].map(([id, label, checked]) => `
          <label style="display:flex;align-items:center;gap:.625rem;cursor:pointer;padding:.5rem;border-radius:.5rem;border:1px solid var(--border)">
            <input type="checkbox" id="${id}" ${checked?'checked':''} style="width:1rem;height:1rem">
            <span style="font-size:.875rem">${label}</span>
          </label>`).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closePermissionsModal()">Cancelar</button>
      <button class="btn-primary" onclick="handleSavePermissions('${memberId}')">Salvar</button>
    </div>`;

  document.body.appendChild(overlay);
  document.body.appendChild(modal);
  overlay.classList.remove('hidden');
  modal.classList.remove('hidden');
}

function closePermissionsModal() {
  document.getElementById('perm-modal-overlay')?.remove();
  document.getElementById('perm-modal')?.remove();
}

async function handleSavePermissions(memberId) {
  const perms = {
    can_purchase: document.getElementById('perm-purchase')?.checked || false,
    can_edit:     document.getElementById('perm-edit')?.checked     || false,
    can_delete:   document.getElementById('perm-delete')?.checked   || false,
  };
  const ok = await updateMemberPermissions(memberId, perms);
  if (ok) { showToast('Permissões atualizadas!', 'success'); closePermissionsModal(); renderFamilySection(); }
  else showToast('Erro ao atualizar', 'error');
}

async function handleRemoveMember(memberId, memberName) {
  if (!confirm(`Remover ${memberName} do grupo?`)) return;
  const ok = await removeMember(memberId);
  if (ok) { showToast(`${memberName} removido`, 'success'); renderFamilySection(); }
  else showToast('Erro ao remover', 'error');
}

async function handleRevokeInvite(inviteId) {
  const ok = await revokeInvite(inviteId);
  if (ok) { showToast('Convite cancelado', 'success'); renderFamilySection(); }
  else showToast('Erro ao cancelar', 'error');
}

// ── Init: carrega conta ativa ao iniciar ─────────────────────
function initFamilySession() {
  loadActiveAccount();
  updateAccountBanner();
}
