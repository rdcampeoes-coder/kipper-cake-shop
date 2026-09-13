(()=>{
  let installed=false,filter='active',payload={summary:{},accounts:[]},financePayload=null;

  const style=`
  <style id="adminManagementCss">
    .admin-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}
    .admin-metric{background:#fff;border:1px solid #e5dfd4;border-radius:18px;padding:18px}
    .admin-metric span{display:block;color:#7b7368;font-size:13px;margin-bottom:7px}
    .admin-metric strong{font-size:28px}
    .admin-filters{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
    .admin-filter{border:1px solid #d9d2c7;background:#fff;border-radius:999px;padding:9px 13px;cursor:pointer;font-weight:700}
    .admin-filter.active{background:#1f1d1a;color:#fff;border-color:#1f1d1a}
    .admin-table{width:100%;border-collapse:collapse}
    .admin-table th,.admin-table td{padding:12px 10px;border-bottom:1px solid #eee8df;text-align:left;vertical-align:middle}
    .admin-table th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#7b7368}
    .admin-account-row{cursor:pointer}
    .admin-account-row:hover{background:#faf7f1}
    .admin-access{display:inline-flex;align-items:center;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800;background:#eee9e1}
    .admin-access.free{background:#e7f3ea;color:#2f6b42}
    .admin-access.paid{background:#f7efd8;color:#7a5d12}
    .admin-access.inactive{background:#f3e4e4;color:#8b3535}
    .admin-access.blocked{background:#2a2421;color:#fff}
    .admin-access.admin{background:#e8e4f6;color:#58478c}
    .admin-empty{padding:28px;text-align:center;color:#7b7368}
    .admin-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}
    .admin-detail{border:1px solid var(--line);border-radius:14px;padding:12px;background:#fbfaf8}
    .admin-detail span{display:block;color:var(--muted);font-size:12px;margin-bottom:5px}
    .admin-code{font:800 22px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em}
    .admin-modal-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
    .admin-ref-list{display:grid;gap:8px;margin-top:10px}
    .admin-ref-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}
    .admin-nav-label{padding:7px 12px 3px;font-size:9px;font-weight:900;letter-spacing:.16em;color:#9a9186}
    .admin-nav-divider{height:1px;background:var(--line);margin:8px 8px}
    .admin-finance-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}
    .admin-finance-table{width:100%;border-collapse:collapse}
    .admin-finance-table th,.admin-finance-table td{padding:11px 10px;border-bottom:1px solid var(--line);text-align:left}
    @media(max-width:800px){
      .admin-metrics,.admin-finance-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .admin-table thead{display:none}
      .admin-table,.admin-table tbody,.admin-table tr,.admin-table td{display:block;width:100%}
      .admin-table tr{border:1px solid #e5dfd4;border-radius:16px;padding:10px;margin-bottom:10px;background:#fff;box-sizing:border-box}
      .admin-table td{border:0;padding:6px 4px}
      .admin-table td[data-label]:before{content:attr(data-label) ": ";font-weight:700;color:#7b7368}
      .admin-detail-grid{grid-template-columns:1fr}
      .admin-nav-label{display:none}
      .admin-nav-divider{flex:0 0 1px;width:1px;height:34px;margin:4px 6px;align-self:center}
    }
  </style>`;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate=v=>v?new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(v)):'—';
  const money=v=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(Number(v||0));

  function addStyle(){if(!document.getElementById('adminManagementCss'))document.head.insertAdjacentHTML('beforeend',style)}

  function addNav(){
    if(installed||document.querySelector('.nav-btn[data-view="management"]'))return;
    const nav=document.querySelector('.sidebar nav');
    if(!nav)return;
    const label=document.createElement('div');
    label.className='admin-nav-label';
    label.textContent='STARTA · ADMINISTRAÇÃO';

    const management=document.createElement('button');
    management.className='nav-btn';
    management.dataset.view='management';
    management.innerHTML='⚙ <span>Gestão</span>';
    management.onclick=showManagement;

    const finance=document.createElement('button');
    finance.className='nav-btn';
    finance.dataset.view='adminFinance';
    finance.innerHTML='◈ <span>Finanças Starta</span>';
    finance.onclick=showAdminFinance;

    const divider=document.createElement('div');
    divider.className='admin-nav-divider';
    divider.setAttribute('aria-hidden','true');

    nav.prepend(divider);
    nav.prepend(finance);
    nav.prepend(management);
    nav.prepend(label);
    installed=true;
  }

  function accessInfo(a){
    if(a.isAdmin)return ['Management','admin'];
    if(a.blocked)return ['Bloqueada','blocked'];
    if(a.freeAccess&&a.paidAccess)return ['Paga + grátis','paid'];
    if(a.freeAccess)return ['Acesso grátis','free'];
    if(a.paidAccess)return ['Subscrição ativa','paid'];
    return ['Sem acesso','inactive'];
  }

  function visibleAccounts(){
    const list=payload.accounts.filter(a=>!a.isAdmin);
    if(filter==='free')return list.filter(a=>a.freeAccess);
    if(filter==='paid')return list.filter(a=>a.paidAccess);
    if(filter==='archive')return list.filter(a=>a.archived);
    if(filter==='all')return list;
    return list.filter(a=>a.hasAccess);
  }

  function renderTable(){
    const host=document.getElementById('adminAccountsTable');
    if(!host)return;
    const list=visibleAccounts();
    if(!list.length){host.innerHTML='<div class="admin-empty">Não há contas nesta categoria.</div>';return}
    host.innerHTML=`<div style="overflow:auto"><table class="admin-table"><thead><tr><th>Conta</th><th>Plano</th><th>Acesso</th><th>Referências</th><th>Registo</th></tr></thead><tbody>${list.map(a=>{
      const [label,cls]=accessInfo(a);
      return `<tr class="admin-account-row" data-account="${esc(a.userId)}" tabindex="0">
        <td data-label="Conta"><strong>${esc(a.email)}</strong>${a.referredByEmail?`<div class="muted small">Veio por ${esc(a.referredByEmail)}</div>`:''}</td>
        <td data-label="Plano">${esc(a.planName||'Premium')}</td>
        <td data-label="Acesso"><span class="admin-access ${cls}">${label}</span></td>
        <td data-label="Referências">${Number(a.referredCount||0)}</td>
        <td data-label="Registo">${fmtDate(a.createdAt)}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
    host.querySelectorAll('[data-account]').forEach(row=>{
      const open=()=>openAccount(row.dataset.account);
      row.onclick=open;
      row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}};
    });
  }

  function renderManagement(){
    const s=payload.summary||{};
    const view=document.getElementById('view');
    if(!view)return;
    view.innerHTML=`
      <div class="admin-metrics">
        <div class="admin-metric"><span>Contas ativas</span><strong>${Number(s.active||0)}</strong></div>
        <div class="admin-metric"><span>Subscrições pagas</span><strong>${Number(s.paid||0)}</strong></div>
        <div class="admin-metric"><span>Acessos grátis</span><strong>${Number(s.free||0)}</strong></div>
        <div class="admin-metric"><span>Arquivo</span><strong>${Number(s.archived||0)}</strong></div>
      </div>
      <div class="card">
        <div class="section-head"><div><h2>Gestão de acessos</h2><div class="muted">Carrega numa conta para gerir acesso, bloqueio, plano e código de referência.</div></div></div>
        <div id="adminMessage" class="muted small"></div>
        <div class="admin-filters">
          <button class="admin-filter ${filter==='active'?'active':''}" data-admin-filter="active">Contas ativas</button>
          <button class="admin-filter ${filter==='paid'?'active':''}" data-admin-filter="paid">Subscrições pagas</button>
          <button class="admin-filter ${filter==='free'?'active':''}" data-admin-filter="free">Acessos grátis</button>
          <button class="admin-filter ${filter==='archive'?'active':''}" data-admin-filter="archive">Arquivo</button>
          <button class="admin-filter ${filter==='all'?'active':''}" data-admin-filter="all">Todas</button>
        </div>
        <div id="adminAccountsTable"></div>
      </div>`;
    view.querySelectorAll('[data-admin-filter]').forEach(b=>b.onclick=()=>{
      filter=b.dataset.adminFilter;
      view.querySelectorAll('[data-admin-filter]').forEach(x=>x.classList.toggle('active',x.dataset.adminFilter===filter));
      renderTable();
    });
    renderTable();
  }

  async function loadAccounts(render=true){
    payload=await window.KIPPER_AUTH.request('/api/admin/accounts');
    if(render)renderManagement();
    return payload;
  }

  function modalOpen(html){
    const body=document.getElementById('modalBody'),modal=document.getElementById('modal');
    if(!body||!modal)return;
    body.innerHTML=html;
    modal.classList.remove('hidden');
  }

  function openAccount(userId){
    const a=payload.accounts.find(x=>x.userId===userId);
    if(!a)return;
    const [label,cls]=accessInfo(a);
    const referrals=(a.referredAccounts||[]);
    modalOpen(`
      <h2>${esc(a.email)}</h2>
      <div class="admin-detail-grid">
        <div class="admin-detail"><span>Estado do acesso</span><span class="admin-access ${cls}">${label}</span></div>
        <div class="admin-detail"><span>Plano</span><strong>${esc(a.planName||'Premium')}</strong></div>
        <div class="admin-detail"><span>Primeiro acesso</span><strong>${fmtDate(a.accessFirstAt)}</strong></div>
        <div class="admin-detail"><span>Fim do último acesso</span><strong>${fmtDate(a.accessEndedAt)}</strong></div>
        <div class="admin-detail"><span>Último tipo de acesso</span><strong>${esc(a.lastAccessType||label)}</strong></div>
        <div class="admin-detail"><span>Stripe</span><strong>${a.hasStripeSubscription?'Subscrição ligada':a.hasStripeCustomer?'Cliente Stripe':'Sem ligação'}</strong></div>
        <div class="admin-detail"><span>Registo</span><strong>${fmtDate(a.createdAt)}</strong></div>
        <div class="admin-detail" style="grid-column:1/-1"><span>Código de referência</span><div class="admin-code">${esc(a.referralCode||'—')}</div><button class="secondary tiny" id="copyReferral">Copiar código</button></div>
        <div class="admin-detail" style="grid-column:1/-1"><span>Origem desta conta</span><strong>${a.referredByEmail?`${esc(a.referredByEmail)} · ${esc(a.referredByCode||'')}`:'Sem código de referência associado'}</strong></div>
      </div>
      <div class="admin-modal-actions">
        <button class="${a.freeAccess?'secondary':'primary'}" id="toggleFree">${a.freeAccess?'Retirar acesso grátis':'Dar acesso grátis'}</button>
        <button class="${a.blocked?'secondary':'danger'}" id="toggleBlock">${a.blocked?'Desbloquear conta':'Bloquear conta'}</button>
      </div>
      <p class="muted small">Bloquear impede o acesso à aplicação, mesmo que exista uma subscrição paga. Não cancela automaticamente a cobrança no Stripe.</p>
      <div class="section" style="margin-top:18px">
        <div class="section-head"><h3>Subscrições indicadas por este código</h3><strong>${Number(a.referredCount||0)}</strong></div>
        ${referrals.length?`<div class="admin-ref-list">${referrals.map(r=>`<div class="admin-ref-row"><span>${esc(r.email)}</span><span>${esc(r.planName||'Premium')} · ${fmtDate(r.createdAt)}</span></div>`).join('')}</div>`:'<div class="muted small">Ainda não há contas associadas a este código.</div>'}
      </div>
    `);
    const copy=document.getElementById('copyReferral');
    if(copy)copy.onclick=async()=>{
      const code=a.referralCode||'';
      if(!code)return;
      try{await navigator.clipboard.writeText(code);copy.textContent='Copiado';setTimeout(()=>copy.textContent='Copiar código',1200)}
      catch{prompt('Copia o código:',code)}
    };
    document.getElementById('toggleFree').onclick=()=>toggleFree(a.userId,!a.freeAccess);
    document.getElementById('toggleBlock').onclick=()=>toggleBlock(a.userId,!a.blocked);
  }

  async function refreshAccountModal(userId){
    await loadAccounts(false);
    renderManagement();
    openAccount(userId);
  }

  async function toggleFree(userId,enabled){
    const a=payload.accounts.find(x=>x.userId===userId);
    if(!a)return;
    try{
      if(!enabled&&!confirm(`Retirar o acesso grátis de ${a.email}?`))return;
      await window.KIPPER_AUTH.request('/api/admin/free-access',{method:'POST',body:JSON.stringify({userId,enabled})});
      await refreshAccountModal(userId);
    }catch(e){alert(e.message||'Não foi possível alterar o acesso.')}
  }

  async function toggleBlock(userId,blocked){
    const a=payload.accounts.find(x=>x.userId===userId);
    if(!a)return;
    try{
      if(blocked&&!confirm(`Bloquear o acesso de ${a.email}?`))return;
      await window.KIPPER_AUTH.request('/api/admin/block-access',{method:'POST',body:JSON.stringify({userId,blocked})});
      await refreshAccountModal(userId);
    }catch(e){alert(e.message||'Não foi possível alterar o bloqueio.')}
  }

  function activateAdminNav(viewName){
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===viewName));
  }

  async function showManagement(){
    activateAdminNav('management');
    const title=document.getElementById('pageTitle'),sub=document.getElementById('pageSubtitle'),view=document.getElementById('view');
    if(title)title.textContent='Gestão';
    if(sub)sub.textContent='Contas, planos, referências, bloqueios e arquivo';
    if(view)view.innerHTML='<div class="card">A carregar gestão de contas…</div>';
    try{await loadAccounts()}catch(e){
      if(view)view.innerHTML=`<div class="card"><h2>Gestão</h2><p>${esc(e.message||'Não foi possível carregar as contas.')}</p></div>`;
    }
  }

  function renderFinance(){
    const view=document.getElementById('view');
    if(!view)return;
    const p=financePayload||{summary:{},payments:[],byMonth:[],byPlan:[]};
    const s=p.summary||{};
    view.innerHTML=`
      <div class="admin-finance-grid">
        <div class="admin-metric"><span>Total recebido</span><strong>${money(s.totalReceived)}</strong></div>
        <div class="admin-metric"><span>Este mês</span><strong>${money(s.thisMonth)}</strong></div>
        <div class="admin-metric"><span>Este ano</span><strong>${money(s.thisYear)}</strong></div>
        <div class="admin-metric"><span>Subscrições pagas ativas</span><strong>${Number(s.paidActive||0)}</strong></div>
      </div>
      <div class="grid cards-2">
        <div class="card">
          <div class="section-head"><h2>Receita por plano</h2></div>
          ${(p.byPlan||[]).length?(p.byPlan||[]).map(x=>`<div class="component-row"><strong>${esc(x.plan)}</strong><span>${money(x.total)}</span></div>`).join(''):'<div class="muted">Ainda não há pagamentos registados.</div>'}
        </div>
        <div class="card">
          <div class="section-head"><h2>Últimos meses</h2></div>
          ${(p.byMonth||[]).length?(p.byMonth||[]).slice(0,12).map(x=>`<div class="component-row"><strong>${esc(x.month)}</strong><span>${money(x.total)}</span></div>`).join(''):'<div class="muted">Ainda não há pagamentos registados.</div>'}
        </div>
      </div>
      <div class="card section">
        <div class="section-head"><div><h2>Pagamentos da aplicação</h2><div class="muted">Receita de subscrições registada através do Stripe.</div></div></div>
        ${(p.payments||[]).length?`<div style="overflow:auto"><table class="admin-finance-table"><thead><tr><th>Data</th><th>Conta</th><th>Plano</th><th>Valor</th></tr></thead><tbody>${p.payments.map(x=>`<tr><td>${fmtDate(x.paidAt)}</td><td>${esc(x.email)}</td><td>${esc(x.planName||'Premium')}</td><td><strong>${money(x.amount)}</strong></td></tr>`).join('')}</tbody></table></div>`:'<div class="admin-empty">Ainda não existem pagamentos registados.</div>'}
      </div>
      ${p.stripeConfigured?'':'<div class="warning-box section">O Stripe não está configurado neste ambiente, por isso não é possível sincronizar pagamentos.</div>'}
    `;
  }

  async function showAdminFinance(){
    activateAdminNav('adminFinance');
    const title=document.getElementById('pageTitle'),sub=document.getElementById('pageSubtitle'),view=document.getElementById('view');
    if(title)title.textContent='Finanças Starta';
    if(sub)sub.textContent='Receita gerada pelas subscrições da Kipper App';
    if(view)view.innerHTML='<div class="card">A carregar finanças da aplicação…</div>';
    try{
      financePayload=await window.KIPPER_AUTH.request('/api/admin/finance');
      renderFinance();
    }catch(e){
      if(view)view.innerHTML=`<div class="card"><h2>Finanças Starta</h2><p>${esc(e.message||'Não foi possível carregar as finanças.')}</p></div>`;
    }
  }

  async function installWhenReady(attempt=0){
    if(!window.KIPPER_AUTH?.request){if(attempt<60)setTimeout(()=>installWhenReady(attempt+1),250);return}
    try{
      const account=await window.KIPPER_AUTH.request('/api/account');
      if(account?.isAdmin){
        addStyle();
        addNav();
        setTimeout(()=>showManagement(),0);
      }
    }catch{
      if(attempt<60)setTimeout(()=>installWhenReady(attempt+1),350);
    }
  }

  window.KIPPER_ADMIN={showManagement,showAdminFinance};
  window.addEventListener('DOMContentLoaded',()=>installWhenReady());
})();
