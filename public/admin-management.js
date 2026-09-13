(()=>{
  let installed=false,filter='active',payload={summary:{},accounts:[]};

  const style=`
  <style id="adminManagementCss">
    .admin-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}
    .admin-metric{background:#fff;border:1px solid #e5dfd4;border-radius:18px;padding:18px}
    .admin-metric span{display:block;color:#7b7368;font-size:13px;margin-bottom:7px}
    .admin-metric strong{font-size:28px}
    .admin-toolbar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:16px 0}
    .admin-toolbar .form-field{min-width:min(380px,100%);flex:1}
    .admin-toolbar input{width:100%;box-sizing:border-box}
    .admin-filters{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
    .admin-filter{border:1px solid #d9d2c7;background:#fff;border-radius:999px;padding:9px 13px;cursor:pointer;font-weight:700}
    .admin-filter.active{background:#1f1d1a;color:#fff;border-color:#1f1d1a}
    .admin-table{width:100%;border-collapse:collapse}
    .admin-table th,.admin-table td{padding:12px 10px;border-bottom:1px solid #eee8df;text-align:left;vertical-align:middle}
    .admin-table th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#7b7368}
    .admin-access{display:inline-flex;align-items:center;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800;background:#eee9e1}
    .admin-access.free{background:#e7f3ea;color:#2f6b42}
    .admin-access.paid{background:#f7efd8;color:#7a5d12}
    .admin-access.inactive{background:#f3e4e4;color:#8b3535}
    .admin-access.admin{background:#e8e4f6;color:#58478c}
    .admin-actions button{white-space:nowrap}
    .admin-empty{padding:28px;text-align:center;color:#7b7368}
    @media(max-width:800px){
      .admin-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
      .admin-table thead{display:none}
      .admin-table,.admin-table tbody,.admin-table tr,.admin-table td{display:block;width:100%}
      .admin-table tr{border:1px solid #e5dfd4;border-radius:16px;padding:10px;margin-bottom:10px;background:#fff;box-sizing:border-box}
      .admin-table td{border:0;padding:6px 4px}
      .admin-table td[data-label]:before{content:attr(data-label) ": ";font-weight:700;color:#7b7368}
    }
  </style>`;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate=v=>v?new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(v)):'—';

  function addStyle(){if(!document.getElementById('adminManagementCss'))document.head.insertAdjacentHTML('beforeend',style)}

  function addNav(){
    if(installed||document.querySelector('.nav-btn[data-view="management"]'))return;
    const more=document.querySelector('.nav-btn[data-view="more"]');
    if(!more)return;
    const btn=document.createElement('button');
    btn.className='nav-btn';
    btn.dataset.view='management';
    btn.innerHTML='⚙ <span>Gestão</span>';
    btn.onclick=showManagement;
    more.parentNode.insertBefore(btn,more);
    installed=true;
  }

  function accessInfo(a){
    if(a.isAdmin)return ['Management','admin'];
    if(a.freeAccess)return ['Acesso grátis','free'];
    if(a.paidAccess)return ['Subscrição ativa','paid'];
    return ['Sem acesso','inactive'];
  }

  function visibleAccounts(){
    const list=payload.accounts.filter(a=>!a.isAdmin);
    if(filter==='free')return list.filter(a=>a.freeAccess);
    if(filter==='all')return list;
    return list.filter(a=>a.hasAccess);
  }

  function renderTable(){
    const host=document.getElementById('adminAccountsTable');
    if(!host)return;
    const list=visibleAccounts();
    if(!list.length){host.innerHTML='<div class="admin-empty">Não há contas nesta categoria.</div>';return}
    host.innerHTML=`<div style="overflow:auto"><table class="admin-table"><thead><tr><th>Conta</th><th>Acesso</th><th>Stripe</th><th>Registo</th><th></th></tr></thead><tbody>${list.map(a=>{
      const [label,cls]=accessInfo(a);
      return `<tr>
        <td data-label="Conta"><strong>${esc(a.email)}</strong></td>
        <td data-label="Acesso"><span class="admin-access ${cls}">${label}</span>${a.paidAccess&&a.freeAccess?'<div class="muted small">Também tem subscrição paga</div>':''}</td>
        <td data-label="Stripe">${a.hasStripeSubscription?'Subscrição ligada':a.hasStripeCustomer?'Cliente Stripe':'—'}</td>
        <td data-label="Registo">${fmtDate(a.createdAt)}</td>
        <td class="admin-actions">${a.freeAccess?`<button class="secondary" data-revoke="${esc(a.email)}">Retirar acesso grátis</button>`:''}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
    host.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=()=>toggleFree(b.dataset.revoke,false));
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
        <div class="admin-metric"><span>Sem acesso</span><strong>${Number(s.inactive||0)}</strong></div>
      </div>
      <div class="card">
        <div class="section-head"><div><h2>Gestão de acessos</h2><div class="muted">Só a conta de management consegue ver e alterar esta área.</div></div></div>
        <div class="admin-toolbar">
          <div class="form-field"><label>Dar acesso grátis a uma conta</label><input id="adminFreeEmail" type="email" placeholder="email@exemplo.pt"></div>
          <button class="primary" id="adminGrantFree">Ativar acesso grátis</button>
        </div>
        <div id="adminMessage" class="muted small"></div>
        <div class="admin-filters">
          <button class="admin-filter ${filter==='active'?'active':''}" data-admin-filter="active">Contas ativas</button>
          <button class="admin-filter ${filter==='free'?'active':''}" data-admin-filter="free">Acessos grátis</button>
          <button class="admin-filter ${filter==='all'?'active':''}" data-admin-filter="all">Todas as contas</button>
        </div>
        <div id="adminAccountsTable"></div>
      </div>`;
    document.getElementById('adminGrantFree').onclick=()=>{
      const email=document.getElementById('adminFreeEmail').value.trim();
      if(!email)return setMessage('Indica o email da conta.');
      toggleFree(email,true);
    };
    view.querySelectorAll('[data-admin-filter]').forEach(b=>b.onclick=()=>{
      filter=b.dataset.adminFilter;
      view.querySelectorAll('[data-admin-filter]').forEach(x=>x.classList.toggle('active',x.dataset.adminFilter===filter));
      renderTable();
    });
    renderTable();
  }

  function setMessage(text,error=false){
    const el=document.getElementById('adminMessage');
    if(!el)return;
    el.textContent=text||'';
    el.style.color=error?'#8b3535':'';
  }

  async function loadAccounts(){
    payload=await window.KIPPER_AUTH.request('/api/admin/accounts');
    renderManagement();
  }

  async function toggleFree(email,enabled){
    try{
      setMessage(enabled?'A ativar acesso grátis…':'A retirar acesso grátis…');
      if(!enabled&&!confirm(`Retirar o acesso grátis de ${email}?`)){setMessage('');return}
      await window.KIPPER_AUTH.request('/api/admin/free-access',{
        method:'POST',
        body:JSON.stringify({email,enabled})
      });
      await loadAccounts();
      setMessage(enabled?`Acesso grátis ativado para ${email}.`:`Acesso grátis retirado de ${email}.`);
    }catch(e){setMessage(e.message||'Não foi possível alterar o acesso.',true)}
  }

  async function showManagement(){
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view==='management'));
    const title=document.getElementById('pageTitle'),sub=document.getElementById('pageSubtitle'),view=document.getElementById('view');
    if(title)title.textContent='Gestão';
    if(sub)sub.textContent='Contas, subscrições e acessos gratuitos';
    if(view)view.innerHTML='<div class="card">A carregar gestão de contas…</div>';
    try{await loadAccounts()}catch(e){
      if(view)view.innerHTML=`<div class="card"><h2>Gestão</h2><p>${esc(e.message||'Não foi possível carregar as contas.')}</p></div>`;
    }
  }

  async function installWhenReady(attempt=0){
    if(!window.KIPPER_AUTH?.request){if(attempt<40)setTimeout(()=>installWhenReady(attempt+1),250);return}
    try{
      const account=await window.KIPPER_AUTH.request('/api/account');
      if(account?.isAdmin){addStyle();addNav()}
    }catch{
      if(attempt<40)setTimeout(()=>installWhenReady(attempt+1),350);
    }
  }

  window.addEventListener('DOMContentLoaded',()=>installWhenReady());
})();