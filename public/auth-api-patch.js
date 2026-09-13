/* Adds the current Supabase session to every Kipper API request. */
(()=>{
  const oldReload=reload;
  api=async function(url,opts={}){
    const token=window.KIPPER_AUTH?.getToken?.()||'';
    if(!token)throw new Error('Sessão necessária');
    const r=await fetch(url,{...opts,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(opts.headers||{})}});
    if(!r.ok){let j={};try{j=await r.json()}catch{};if(r.status===402||j.code==='SUBSCRIPTION_REQUIRED')window.KIPPER_AUTH?.showPaywall?.();const e=new Error(j.error||`Erro ${r.status}`);e.status=r.status;e.body=j;throw e}
    return r.json();
  };
  reload=async function(){if(!window.KIPPER_AUTH?.getToken?.())return;return oldReload()};
  window.reload=reload;
})();
