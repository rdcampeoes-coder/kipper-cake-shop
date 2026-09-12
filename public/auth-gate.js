(() => {
  const nativeFetch = window.fetch.bind(window);
  let accessToken = '';
  let supabase = null;
  let config = null;
  let account = null;

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if(url.startsWith('/api/') && accessToken){
      const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined) || {});
      headers.set('Authorization', `Bearer ${accessToken}`);
      init = { ...init, headers };
    }
    return nativeFetch(input, init);
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const json = async (url, options = {}) => {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    let body = {};
    try { body = await r.json(); } catch {}
    if(!r.ok) throw new Error(body.error || `Erro ${r.status}`);
    return body;
  };

  function mount(){
    document.body.insertAdjacentHTML('beforeend', `
      <div id="authGate" class="auth-gate hidden">
        <div class="auth-card">
          <img src="/kipper-logo.jpg" alt="Kipper" class="auth-logo">
          <div id="authGateBody"></div>
        </div>
      </div>
      <button id="accountButton" class="account-button hidden" type="button">Conta</button>
      <div id="accountPanel" class="account-panel hidden"><div id="accountPanelBody"></div></div>
    `);
    document.querySelector('#accountButton').onclick = openAccountPanel;
    document.querySelector('#accountPanel').addEventListener('click', e => {
      if(e.target.id === 'accountPanel') closeAccountPanel();
    });
  }

  function showGate(html){
    document.documentElement.classList.add('auth-pending');
    const gate = document.querySelector('#authGate');
    gate.classList.remove('hidden');
    document.querySelector('#authGateBody').innerHTML = html;
  }

  function unlock(){
    document.querySelector('#authGate')?.classList.add('hidden');
    document.documentElement.classList.remove('auth-pending');
    document.querySelector('#accountButton')?.classList.remove('hidden');
    if(typeof window.reload === 'function') window.reload().catch(console.error);
  }

  function showLogin(message = ''){
    showGate(`
      <h1>Entrar na Kipper</h1>
      <p class="auth-muted">Acede à tua área de gestão.</p>
      ${message ? `<div class="auth-message">${esc(message)}</div>` : ''}
      <form id="loginForm" class="auth-form">
        <label>Email<input id="loginEmail" type="email" autocomplete="email" required></label>
        <label>Palavra-passe<input id="loginPassword" type="password" autocomplete="current-password" minlength="6" required></label>
        <button class="auth-primary" type="submit">Entrar</button>
      </form>
      <button id="showSignup" class="auth-link" type="button">Ainda não tenho conta</button>
    `);
    document.querySelector('#loginForm').onsubmit = async e => {
      e.preventDefault();
      const email = document.querySelector('#loginEmail').value.trim();
      const password = document.querySelector('#loginPassword').value;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if(error) return showLogin(error.message);
    };
    document.querySelector('#showSignup').onclick = showSignup;
  }

  function showSignup(message = ''){
    showGate(`
      <h1>Criar conta</h1>
      <p class="auth-muted">Cria a tua conta para subscrever a Kipper.</p>
      ${message ? `<div class="auth-message">${esc(message)}</div>` : ''}
      <form id="signupForm" class="auth-form">
        <label>Email<input id="signupEmail" type="email" autocomplete="email" required></label>
        <label>Palavra-passe<input id="signupPassword" type="password" autocomplete="new-password" minlength="6" required></label>
        <button class="auth-primary" type="submit">Criar conta</button>
      </form>
      <button id="showLogin" class="auth-link" type="button">Já tenho conta</button>
    `);
    document.querySelector('#signupForm').onsubmit = async e => {
      e.preventDefault();
      const email = document.querySelector('#signupEmail').value.trim();
      const password = document.querySelector('#signupPassword').value;
      const { data, error } = await supabase.auth.signUp({ email, password });
      if(error) return showSignup(error.message);
      if(!data.session) return showLogin('Conta criada. Confirma o email e depois entra.');
    };
    document.querySelector('#showLogin').onclick = () => showLogin();
  }

  function hasAccess(profile){
    if(profile?.is_admin) return true;
    if(profile?.manual_access){
      if(!profile.manual_access_until) return true;
      if(new Date(profile.manual_access_until).getTime() > Date.now()) return true;
    }
    return ['active','trialing'].includes(String(profile?.subscription_status || '').toLowerCase());
  }

  function showSubscription(){
    const profile = account?.profile || {};
    const status = profile.subscription_status && profile.subscription_status !== 'none' ? `<p class="auth-muted">Estado atual: <strong>${esc(profile.subscription_status)}</strong></p>` : '';
    showGate(`
      <h1>Ativar acesso</h1>
      <p class="auth-muted">A tua conta está criada, mas ainda não tem acesso à aplicação.</p>
      ${status}
      <div class="auth-plan">
        <strong>${esc(config.priceLabel || 'Plano mensal')}</strong>
        <span>Renovação automática pelo Stripe</span>
      </div>
      <button id="subscribeNow" class="auth-primary" type="button" ${config.billingConfigured ? '' : 'disabled'}>${config.billingConfigured ? 'Subscrever agora' : 'Pagamentos ainda não ativados'}</button>
      <button id="logoutGate" class="auth-link" type="button">Sair desta conta</button>
    `);
    document.querySelector('#subscribeNow').onclick = async () => {
      try {
        const result = await json('/api/billing/checkout', { method: 'POST', body: '{}' });
        window.location.href = result.url;
      } catch(err){ alert(err.message); }
    };
    document.querySelector('#logoutGate').onclick = () => supabase.auth.signOut();
  }

  async function refreshAccount(session){
    accessToken = session?.access_token || '';
    if(!session){ account = null; return showLogin(); }
    try {
      account = await json('/api/account');
      if(hasAccess(account.profile)) unlock(); else showSubscription();
    } catch(err){ showLogin(err.message); }
  }

  function closeAccountPanel(){ document.querySelector('#accountPanel').classList.add('hidden'); }

  async function openAccountPanel(){
    if(!account) return;
    const profile = account.profile || {};
    const panel = document.querySelector('#accountPanel');
    panel.classList.remove('hidden');
    document.querySelector('#accountPanelBody').innerHTML = `
      <div class="account-sheet">
        <button id="closeAccount" class="account-close" type="button">×</button>
        <h2>A minha conta</h2>
        <p>${esc(account.user?.email || '')}</p>
        <div class="account-status"><span>Acesso</span><strong>${profile.is_admin ? 'Administrador' : profile.manual_access ? 'Oferecido' : esc(profile.subscription_status || 'Ativo')}</strong></div>
        ${profile.current_period_end ? `<div class="account-status"><span>Próxima data</span><strong>${new Date(profile.current_period_end).toLocaleDateString('pt-PT')}</strong></div>` : ''}
        ${profile.stripe_customer_id ? '<button id="manageBilling" class="auth-secondary" type="button">Gerir subscrição</button>' : ''}
        ${profile.is_admin ? '<button id="manageUsers" class="auth-secondary" type="button">Gerir utilizadores</button>' : ''}
        <button id="logoutAccount" class="auth-link" type="button">Terminar sessão</button>
        <div id="adminUsers"></div>
      </div>`;
    document.querySelector('#closeAccount').onclick = closeAccountPanel;
    document.querySelector('#logoutAccount').onclick = () => supabase.auth.signOut();
    const billing = document.querySelector('#manageBilling');
    if(billing) billing.onclick = async () => {
      try { const result = await json('/api/billing/portal', { method:'POST', body:'{}' }); window.location.href = result.url; }
      catch(err){ alert(err.message); }
    };
    const users = document.querySelector('#manageUsers');
    if(users) users.onclick = renderAdminUsers;
  }

  async function renderAdminUsers(){
    const host = document.querySelector('#adminUsers');
    host.innerHTML = '<p class="auth-muted">A carregar utilizadores…</p>';
    try {
      const users = await json('/api/admin/users');
      host.innerHTML = `<h3 class="admin-title">Utilizadores</h3>${users.map(u => `
        <div class="admin-user" data-user-id="${u.id}">
          <div><strong>${esc(u.email || u.id)}</strong><small>${esc(u.subscription_status || 'none')}</small></div>
          <label class="admin-check"><input class="manualAccess" type="checkbox" ${u.manual_access ? 'checked' : ''}> Acesso grátis</label>
          <label class="admin-date">Até <input class="manualUntil" type="date" value="${u.manual_access_until ? String(u.manual_access_until).slice(0,10) : ''}"></label>
          <label class="admin-check"><input class="adminFlag" type="checkbox" ${u.is_admin ? 'checked' : ''}> Admin</label>
          <button class="saveAccess auth-secondary" type="button">Guardar</button>
        </div>`).join('') || '<p class="auth-muted">Sem utilizadores.</p>'}`;
      host.querySelectorAll('.saveAccess').forEach(btn => btn.onclick = async () => {
        const row = btn.closest('.admin-user');
        const id = row.dataset.userId;
        const body = {
          manual_access: row.querySelector('.manualAccess').checked,
          manual_access_until: row.querySelector('.manualUntil').value || null,
          is_admin: row.querySelector('.adminFlag').checked
        };
        try { await json(`/api/admin/users/${id}/access`, { method:'PUT', body:JSON.stringify(body) }); btn.textContent='Guardado'; setTimeout(()=>btn.textContent='Guardar',1200); }
        catch(err){ alert(err.message); }
      });
    } catch(err){ host.innerHTML = `<div class="auth-message">${esc(err.message)}</div>`; }
  }

  async function init(){
    mount();
    try { config = await nativeFetch('/api/auth/config').then(r => r.json()); }
    catch { config = { authConfigured:false, accessControlEnabled:false }; }

    if(!config.authConfigured || !config.accessControlEnabled){
      document.documentElement.classList.remove('auth-pending');
      return;
    }

    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm');
      supabase = mod.createClient(config.supabaseUrl, config.supabasePublishableKey);
      const { data } = await supabase.auth.getSession();
      await refreshAccount(data.session);
      supabase.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => refreshAccount(session), 0);
      });
    } catch(err){
      showGate(`<h1>Não foi possível iniciar</h1><div class="auth-message">${esc(err.message)}</div>`);
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
