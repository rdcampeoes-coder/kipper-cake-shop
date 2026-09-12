let data={clients:[],ingredients:[],products:[],sizes:[],components:[],orders:[],expenses:[],movements:[],demoRecipes:false};
let currentView='dashboard', productTab='products', databaseConnected=false;
const $=(q,r=document)=>r.querySelector(q), $$=(q,r=document)=>[...r.querySelectorAll(q)];
const money=v=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(Number(v||0));
const dateFmt=d=>d?new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(String(d).slice(0,10)+'T12:00:00')):'—';
const round=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const ing=id=>data.ingredients.find(x=>Number(x.id)===Number(id));
const comp=id=>data.components.find(x=>Number(x.id)===Number(id));
const size=id=>data.sizes.find(x=>Number(x.id)===Number(id));
const client=id=>data.clients.find(x=>Number(x.id)===Number(id));
const product=id=>data.products.find(x=>Number(x.id)===Number(id));

// A Kipper nunca cria nem guarda dados de demonstração/localmente.
// Se a base de dados estiver indisponível, qualquer tentativa de escrita falha explicitamente.
function prototypeDisabled(){throw new Error('A base de dados está indisponível. Os dados não foram guardados.')}
function savePrototypeClient(){return prototypeDisabled()}
function savePrototypeOrder(){return prototypeDisabled()}
function savePrototypeStockMovement(){return prototypeDisabled()}
function savePrototypePreparation(){return prototypeDisabled()}
function setPrototypeOrderStatus(){return prototypeDisabled()}
function readPrototypeStore(){return {orders:[],clients:[],stockByIngredient:{},movements:[],expenses:[]}}
function writePrototypeStore(){return false}
function nextPrototypeId(){return Date.now()}
function mergePrototypeData(base){return base}

async function api(url,opts={}){
  const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
  if(!r.ok){let j={};try{j=await r.json()}catch{};throw new Error(j.error||`Erro ${r.status}`)}
  return r.json();
}
async function reload(){
  const [loaded,h]=await Promise.all([api('/api/bootstrap'),api('/api/health')]);
  databaseConnected=Boolean(h.database);
  data=loaded||{clients:[],ingredients:[],products:[],sizes:[],components:[],orders:[],expenses:[],movements:[],demoRecipes:false};
  $('#dbStatus').textContent=databaseConnected?'Base de dados ligada':'Base de dados indisponível';
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
