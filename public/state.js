let data={clients:[],ingredients:[],products:[],sizes:[],components:[],orders:[],expenses:[],movements:[],demoRecipes:false};
let currentView='dashboard', productTab='products', databaseConnected=false;
const PROTOTYPE_KEY='kipper_prototype_data_v1';
const $=(q,r=document)=>r.querySelector(q), $$=(q,r=document)=>[...r.querySelectorAll(q)];
const money=v=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(Number(v||0));
const dateFmt=d=>d?new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(String(d).slice(0,10)+'T12:00:00')):'—';
const round=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[m]));
const ing=id=>data.ingredients.find(x=>Number(x.id)===Number(id));
const comp=id=>data.components.find(x=>Number(x.id)===Number(id));
const size=id=>data.sizes.find(x=>Number(x.id)===Number(id));
const client=id=>data.clients.find(x=>Number(x.id)===Number(id));
const product=id=>data.products.find(x=>Number(x.id)===Number(id));

function readPrototypeStore(){
  try{
    const parsed=JSON.parse(localStorage.getItem(PROTOTYPE_KEY)||'{}');
    return {
      orders:Array.isArray(parsed.orders)?parsed.orders:[],
      clients:Array.isArray(parsed.clients)?parsed.clients:[],
      stockByIngredient:parsed.stockByIngredient&&typeof parsed.stockByIngredient==='object'?parsed.stockByIngredient:{},
      movements:Array.isArray(parsed.movements)?parsed.movements:[],
      expenses:Array.isArray(parsed.expenses)?parsed.expenses:[]
    };
  }catch{return {orders:[],clients:[],stockByIngredient:{},movements:[],expenses:[]}}
}
function writePrototypeStore(store){localStorage.setItem(PROTOTYPE_KEY,JSON.stringify(store))}
function nextPrototypeId(items=[]){return Math.max(Date.now(),...items.map(x=>Number(x.id)||0))+1}
function savePrototypeClient(body){
  const store=readPrototypeStore();
  const duplicate=store.clients.find(c=>body.contact&&c.contact===body.contact)||data.clients.find(c=>body.contact&&c.contact===body.contact);
  if(duplicate)throw new Error(`Já existe um cliente com este contacto: ${duplicate.name}`);
  const row={id:nextPrototypeId([...data.clients,...store.clients]),name:String(body.name||'').trim(),contact:String(body.contact||'').trim(),created_at:new Date().toISOString()};
  if(!row.name)throw new Error('Nome obrigatório');
  store.clients.push(row);writePrototypeStore(store);return row;
}
function savePrototypeOrder(body,id=null){
  const store=readPrototypeStore();
  let row;
  if(id){
    const idx=store.orders.findIndex(o=>Number(o.id)===Number(id));
    const old=idx>=0?store.orders[idx]:data.orders.find(o=>Number(o.id)===Number(id));
    if(!old)throw new Error('Encomenda não encontrada.');
    row={...old,...body,id:Number(id),items:body.items||old.items||[]};
    if(idx>=0)store.orders[idx]=row;else store.orders.unshift(row);
  }else{
    const newId=nextPrototypeId(store.orders);
    row={id:newId,...body,status:'Registada',stock_applied:false,created_at:new Date().toISOString(),items:body.items||[]};
    store.orders.unshift(row);
  }
  writePrototypeStore(store);return row;
}
function savePrototypeStockMovement(body){
  const store=readPrototypeStore();
  const ingredient=ing(body.ingredient_id);
  const qty=Math.abs(Number(body.quantity)||0);
  if(!ingredient||!qty)throw new Error('Movimento de stock inválido.');
  const sign=body.movement_type==='Entrada'?1:-1;
  const current=Number(ingredient.stock||0);
  store.stockByIngredient[String(ingredient.id)]=round(current+(sign*qty));
  const movement={id:nextPrototypeId(store.movements),ingredient_id:Number(ingredient.id),movement_type:body.movement_type,quantity:qty,cost:Number(body.cost||0),note:body.note||'',created_at:new Date().toISOString()};
  store.movements.unshift(movement);
  if(movement.cost>0){
    store.expenses.unshift({id:nextPrototypeId(store.expenses),name:`Reposição de stock — ${ingredient.name}`,expense_type:'Pontual',value:movement.cost,expense_date:new Date().toISOString().slice(0,10)});
  }
  writePrototypeStore(store);return movement;
}
function savePrototypePreparation(id,actual,applyStock=true){
  const store=readPrototypeStore();
  let idx=store.orders.findIndex(o=>Number(o.id)===Number(id));
  let order=idx>=0?store.orders[idx]:data.orders.find(o=>Number(o.id)===Number(id));
  if(!order)throw new Error('Encomenda não encontrada.');
  const consumption=(actual||[]).map(r=>({ingredient_id:Number(r.ingredient_id),predicted_qty:Number(r.predicted_qty??r.quantity||0),actual_qty:Number(r.quantity||0),unit:ing(r.ingredient_id)?.unit||''}));
  order={...order,status:'Aguarda recolha',stock_applied:Boolean(applyStock),consumption};
  if(idx>=0)store.orders[idx]=order;else store.orders.unshift(order);
  if(applyStock){
    for(const r of consumption){
      const ingredient=ing(r.ingredient_id);if(!ingredient)continue;
      store.stockByIngredient[String(ingredient.id)]=round(Number(ingredient.stock||0)-Number(r.actual_qty||0));
      store.movements.unshift({id:nextPrototypeId(store.movements),ingredient_id:Number(ingredient.id),movement_type:'Saída',quantity:Number(r.actual_qty||0),cost:0,note:`Encomenda ${id}`,order_id:Number(id),created_at:new Date().toISOString()});
    }
  }
  writePrototypeStore(store);return order;
}
function setPrototypeOrderStatus(id,status,restoreStock=false){
  const store=readPrototypeStore();
  let idx=store.orders.findIndex(o=>Number(o.id)===Number(id));
  let order=idx>=0?store.orders[idx]:data.orders.find(o=>Number(o.id)===Number(id));
  if(!order)throw new Error('Encomenda não encontrada.');
  if(restoreStock&&order.stock_applied){
    for(const r of order.consumption||[]){
      const ingredient=ing(r.ingredient_id);if(!ingredient)continue;
      store.stockByIngredient[String(ingredient.id)]=round(Number(ingredient.stock||0)+Number(r.actual_qty||0));
      store.movements.unshift({id:nextPrototypeId(store.movements),ingredient_id:Number(ingredient.id),movement_type:'Entrada',quantity:Number(r.actual_qty||0),cost:0,note:'Reposição por cancelamento',order_id:Number(id),created_at:new Date().toISOString()});
    }
  }
  order={...order,status};
  if(idx>=0)store.orders[idx]=order;else store.orders.unshift(order);
  writePrototypeStore(store);return order;
}
function mergePrototypeData(base){
  const store=readPrototypeStore();
  const clients=[...(base.clients||[])];
  for(const c of store.clients)if(!clients.some(x=>Number(x.id)===Number(c.id)))clients.push(c);
  const ingredients=(base.ingredients||[]).map(i=>({...i,stock:Object.prototype.hasOwnProperty.call(store.stockByIngredient,String(i.id))?store.stockByIngredient[String(i.id)]:i.stock}));
  return {...base,clients,ingredients,orders:[...store.orders],movements:[...store.movements,...(base.movements||[])],expenses:[...store.expenses,...(base.expenses||[])]};
}

async function api(url,opts={}){
  const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
  if(!r.ok){let j={};try{j=await r.json()}catch{};throw new Error(j.error||`Erro ${r.status}`)}
  return r.json();
}
async function reload(){
  const loaded=await api('/api/bootstrap');
  const h=await api('/api/health');
  databaseConnected=Boolean(h.database);
  if(!databaseConnected && !(loaded.products||[]).length && window.KIPPER_DEMO){data=mergePrototypeData(structuredClone(window.KIPPER_DEMO));}else data=loaded;
  $('#dbStatus').textContent=databaseConnected?'Base de dados ligada':'Modo protótipo · dados guardados neste dispositivo';
  $('#dbStatus').className='badge '+(databaseConnected?'':'demo');
  render();
}
function toast(t){const el=$('#toast');el.textContent=t;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),3200)}
function openModal(html){$('#modalBody').innerHTML=html;$('#modal').classList.remove('hidden')}
function closeModal(){$('#modal').classList.add('hidden');$('#modalBody').innerHTML=''}
document.addEventListener('click',e=>{if(e.target.matches('[data-close]')||e.target.id==='modal')closeModal()});
function unit(i,q){q=Number(q||0);if(!i)return String(q);return `${round(q)} ${i.unit}`}
function stockState(i){if(Number(i.stock)<=0)return ['Esgotado','red'];if(Number(i.stock)<=Number(i.min_stock))return ['Baixo','yellow'];return ['Normal','green']}
function status(s){let c='gray';if(['Aguarda recolha','Concluída'].includes(s))c='green';if(s==='Registada')c='gold';if(s==='Cancelada')c='red';return `<span class="pill ${c}">${s}</span>`}
function calcComponent(c,target){if(!c||!Number(c.reference_weight)||!c.recipe?.length)return [];const f=Number(target)/Number(c.reference_weight);return c.recipe.map(r=>({ingredient_id:Number(r.ingredient_id),quantity:Number(r.quantity)*f}))}
function merge(parts){const m={};parts.flat().forEach(r=>m[r.ingredient_id]=(m[r.ingredient_id]||0)+Number(r.quantity||0));return Object.entries(m).map(([ingredient_id,quantity])=>({ingredient_id:Number(ingredient_id),quantity:round(quantity)}))}
function needs(order){const parts=[];for(const it of order.items||[])if(it.item_type==='customCake'){const s=size(it.size_id),b=comp(it.base_component_id),c=comp(it.cover_component_id),q=Number(it.quantity||1);if(s&&b&&c)parts.push(calcComponent(b,Number(s.cake_weight)*q),calcComponent(c,Number(s.cover_weight)*q))}return merge(parts)}
function setView(v){currentView=v;$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));const meta={dashboard:['Início','Visão geral do negócio'],orders:['Encomendas','Registar, preparar e acompanhar pedidos'],clients:['Clientes','Ficha e histórico'],products:['Produtos & Componentes','Catálogo, receitas e tamanhos'],stock:['Stock','Ingredientes e movimentos'],finance:['Finanças','Receitas e despesas'],more:['Mais','Definições e ferramentas']}[v];$('#pageTitle').textContent=meta[0];$('#pageSubtitle').textContent=meta[1];render()}
$$('.nav-btn').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('#quickOrder').onclick=()=>orderModal();
