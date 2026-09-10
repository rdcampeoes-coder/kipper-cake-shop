/* Kipper v3: stock detail, clients, editable recipes and multi-product orders. */
const KIPPER_V3_KEY='kipper_v3_settings';
function v3Read(){
  try{
    const x=JSON.parse(localStorage.getItem(KIPPER_V3_KEY)||'{}');
    return {clientOverrides:x.clientOverrides||{},clientNotes:x.clientNotes||{},ingredientSettings:x.ingredientSettings||{},productOverrides:x.productOverrides||{},componentOverrides:x.componentOverrides||{},newProducts:Array.isArray(x.newProducts)?x.newProducts:[],newComponents:Array.isArray(x.newComponents)?x.newComponents:[]};
  }catch{return {clientOverrides:{},clientNotes:{},ingredientSettings:{},productOverrides:{},componentOverrides:{},newProducts:[],newComponents:[]}}
}
function v3Write(x){localStorage.setItem(KIPPER_V3_KEY,JSON.stringify(x))}
function v3Next(items=[]){return Math.max(Date.now(),...items.map(x=>Number(x.id)||0))+1}
function defaultStockUnit(i){if(i?.name==='Ovos')return 'un';if(['Natas','Leite','Essência de baunilha'].includes(i?.name))return 'L';return 'kg'}
function defaultStockFactor(i,u=defaultStockUnit(i)){if(u==='kg'||u==='L')return 1000;if(u==='un'&&i?.name==='Ovos')return 50;return 1}
function applyV3Data(){
  const s=v3Read();
  for(const c of data.clients||[]){const o=s.clientOverrides[String(c.id)];if(o)Object.assign(c,o)}
  for(const i of data.ingredients||[]){const x=s.ingredientSettings[String(i.id)]||{};i.stock_unit=x.stock_unit||defaultStockUnit(i);i.stock_factor=Number(x.stock_factor)||defaultStockFactor(i,i.stock_unit);if(x.min_stock!==undefined)i.min_stock=Number(x.min_stock);i.stock_hidden=Boolean(x.hidden)}
  for(const p of data.products||[]){const o=s.productOverrides[String(p.id)];if(o)Object.assign(p,o)}
  for(const c of data.components||[]){const o=s.componentOverrides[String(c.id)];if(o)Object.assign(c,o)}
  for(const p of s.newProducts)if(!data.products.some(x=>Number(x.id)===Number(p.id)))data.products.push(structuredClone(p));
  for(const c of s.newComponents)if(!data.components.some(x=>Number(x.id)===Number(c.id)))data.components.push(structuredClone(c));
}
const _renderV3Base=render;
render=function(){applyV3Data();_renderV3Base()};

stockDisplayUnit=function(i){return i?.stock_unit||defaultStockUnit(i)};
stockFactor=function(i){return Number(i?.stock_factor)||defaultStockFactor(i,stockDisplayUnit(i))};
stockDisplayQty=function(i,internal){return round(Number(internal||0)/stockFactor(i))};
stockInternalQty=function(i,display){return Number(display||0)*stockFactor(i)};
stockDisplayText=function(i,internal){return `${stockDisplayQty(i,internal)} ${stockDisplayUnit(i)}`};

stock=function(){
 const visible=data.ingredients.filter(i=>!i.stock_hidden);
 return `<div class="section-head"><div><h2>Ingredientes</h2><div class="muted small">Carrega num ingrediente para gerir stock, unidade e alerta.</div></div><button class="primary compact-action" data-replenish>Repor stock</button></div>
 <div class="table-wrap"><table><thead><tr><th>Ingrediente</th><th>Unidade</th><th>Quantidade</th><th>Alerta</th><th>Estado</th></tr></thead><tbody>${visible.map(i=>{const[s,c]=stockState(i);return `<tr class="click-row" data-ing-open="${i.id}"><td><button class="link-name" data-ing-open="${i.id}">${i.name}</button></td><td>${stockDisplayUnit(i)}</td><td>${stockDisplayQty(i,i.stock)}</td><td>${stockDisplayQty(i,i.min_stock)}</td><td><span class="pill ${c}">${s}</span></td></tr>`}).join('')}</tbody></table></div>
 <div class="section card"><div class="section-head"><h2>Movimentos recentes</h2></div>${(data.movements||[]).slice(0,12).map(m=>{const i=ing(m.ingredient_id);return `<div class="component-row movement-line"><div><strong>${m.movement_type}</strong> · ${i?.name||''}<div class="muted small">${dateFmt(m.created_at)} · ${m.note||''}</div></div><strong>${m.movement_type==='Entrada'?'+':'−'}${i?stockDisplayText(i,m.quantity):m.quantity}</strong></div>`}).join('')||'<div class="empty">Sem movimentos.</div>'}</div>`;
};
function saveIngredientSettings(i,{stock_unit,stock_factor,min_display,hidden}){
 const s=v3Read(),key=String(i.id),factor=Number(stock_factor)||defaultStockFactor(i,stock_unit);
 s.ingredientSettings[key]={...(s.ingredientSettings[key]||{}),stock_unit,stock_factor:factor,min_stock:stockInternalQty({...i,stock_factor:factor},Number(min_display)||0),hidden:Boolean(hidden)};
 v3Write(s);
}
function ingredientDetail(id){
 const i=ing(id);if(!i)return;const units=['kg','g','L','ml','un','pacote'];
 openModal(`<h2>${i.name}</h2><div class="stock-hero"><div><span>Stock atual</span><strong>${stockDisplayQty(i,i.stock)} ${stockDisplayUnit(i)}</strong></div><div><span>Zona de alerta</span><strong>${stockDisplayQty(i,i.min_stock)} ${stockDisplayUnit(i)}</strong></div></div>
 <div class="form-grid section"><div class="form-field"><label>Unidade de stock</label><select id="idUnit">${units.map(u=>`<option ${u===stockDisplayUnit(i)?'selected':''}>${u}</option>`).join('')}</select></div><div class="form-field"><label>Equivalência interna por unidade</label><input id="idFactor" type="number" min="0.0001" step="0.01" value="${stockFactor(i)}"></div><div class="form-field"><label>Avisar quando chegar a</label><input id="idMin" type="number" min="0" step="0.01" value="${stockDisplayQty(i,i.min_stock)}"></div></div>
 <div class="muted small">A equivalência mantém os cálculos das receitas coerentes. Ex.: ovos podem usar 50 g por unidade para o cálculo da receita.</div>
 <div class="actions section"><button class="primary" id="idAdd">+ Adicionar stock</button><button class="secondary" id="idRemove">− Retirar stock</button></div>
 <div class="section"><h3 style="font-family:Georgia,serif">Movimentos deste ingrediente</h3>${(data.movements||[]).filter(m=>Number(m.ingredient_id)===Number(i.id)).slice(0,10).map(m=>`<div class="component-row movement-line"><span>${m.movement_type} · ${dateFmt(m.created_at)}</span><strong>${m.movement_type==='Entrada'?'+':'−'}${stockDisplayText(i,m.quantity)}</strong></div>`).join('')||'<div class="empty">Sem movimentos.</div>'}</div>
 <div class="modal-footer spread"><button class="danger ghost-danger" id="idDelete">Remover do stock</button><div><button class="secondary" data-close>Fechar</button><button class="primary" id="idSave">Guardar</button></div></div>`);
 $('#idUnit').onchange=()=>{const u=$('#idUnit').value;$('#idFactor').value=defaultStockFactor(i,u)};
 $('#idSave').onclick=async()=>{if(!confirm('Guardar alterações deste ingrediente?'))return;saveIngredientSettings(i,{stock_unit:$('#idUnit').value,stock_factor:Number($('#idFactor').value),min_display:Number($('#idMin').value),hidden:false});closeModal();await reload();setView('stock');toast('Ingrediente atualizado.')};
 $('#idAdd').onclick=()=>singleStockMovementModal('Entrada',i.id);
 $('#idRemove').onclick=()=>singleStockMovementModal('Saída',i.id);
 $('#idDelete').onclick=async()=>{if(!confirm(`Remover ${i.name} da lista de stock? As receitas históricas não serão apagadas.`))return;saveIngredientSettings(i,{stock_unit:stockDisplayUnit(i),stock_factor:stockFactor(i),min_display:stockDisplayQty(i,i.min_stock),hidden:true});closeModal();await reload();setView('stock');toast('Ingrediente removido da lista de stock.')};
}
function singleStockMovementModal(type,id){
 const i=ing(id);if(!i)return;
 openModal(`<h2>${type==='Entrada'?'Adicionar':'Retirar'} stock · ${i.name}</h2><div class="stock-hero"><div><span>Atual</span><strong>${stockDisplayQty(i,i.stock)} ${stockDisplayUnit(i)}</strong></div></div><div class="form-grid section"><div class="form-field"><label>Quantidade (${stockDisplayUnit(i)})</label><input id="ssQty" type="number" min="0" step="0.01"></div>${type==='Entrada'?'<div class="form-field"><label>Custo (€)</label><input id="ssCost" type="number" min="0" step="0.01" value="0"></div>':''}<div class="form-field full"><label>Nota</label><input id="ssNote" placeholder="Ex.: compra no fornecedor"></div></div><div class="modal-footer"><button class="secondary" data-close>Cancelar</button><button class="primary" id="ssSave">Confirmar</button></div>`);
 $('#ssSave').onclick=async()=>{const shown=Number($('#ssQty').value);if(!shown)return toast('Indica uma quantidade.');if(!confirm(`Confirmar ${type.toLowerCase()} de ${shown} ${stockDisplayUnit(i)}?`))return;const body={ingredient_id:i.id,movement_type:type,quantity:stockInternalQty(i,shown),cost:Number($('#ssCost')?.value||0),note:$('#ssNote').value};try{if(databaseConnected)await api('/api/stock-movements',{method:'POST',body:JSON.stringify(body)});else savePrototypeStockMovement(body);closeModal();await reload();setView('stock');toast('Stock atualizado.')}catch(e){alert(e.message)}};
}
function replenishStockModal(){
 const rows=[{ingredient_id:data.ingredients.find(i=>!i.stock_hidden)?.id,qty:'',cost:0}];
 const html=()=>rows.map((r,n)=>`<div class="purchase-row" data-purchase="${n}"><div class="form-field"><label>Ingrediente</label><select class="rpIng">${data.ingredients.filter(i=>!i.stock_hidden).map(i=>`<option value="${i.id}" ${Number(i.id)===Number(r.ingredient_id)?'selected':''}>${i.name} (${stockDisplayUnit(i)})</option>`).join('')}</select></div><div class="form-field"><label>Quantidade</label><input class="rpQty" type="number" min="0" step="0.01" value="${r.qty}"></div><div class="form-field"><label>Custo (€)</label><input class="rpCost" type="number" min="0" step="0.01" value="${r.cost||0}"></div><button class="ghost mini-remove" data-rp-remove="${n}" type="button">✕</button></div>`).join('');
 openModal(`<h2>Repor stock</h2><p class="muted">Regista os ingredientes comprados numa única reposição.</p><div id="rpRows">${html()}</div><button class="secondary" id="rpAdd" type="button">+ Adicionar ingrediente</button><div class="modal-footer"><button class="secondary" data-close>Cancelar</button><button class="primary" id="rpSave">Confirmar reposição</button></div>`);
 const renderRows=()=>{$('#rpRows').innerHTML=html();$$('[data-rp-remove]').forEach(b=>b.onclick=()=>{if(rows.length===1)return;rows.splice(Number(b.dataset.rpRemove),1);renderRows()});$$('.purchase-row').forEach((rowEl,idx)=>{rowEl.querySelector('.rpIng').onchange=e=>rows[idx].ingredient_id=Number(e.target.value);rowEl.querySelector('.rpQty').oninput=e=>rows[idx].qty=e.target.value;rowEl.querySelector('.rpCost').oninput=e=>rows[idx].cost=Number(e.target.value)||0})};
 $('#rpAdd').onclick=()=>{rows.push({ingredient_id:data.ingredients.find(i=>!i.stock_hidden)?.id,qty:'',cost:0});renderRows()};
 renderRows();
 $('#rpSave').onclick=async()=>{const valid=rows.filter(r=>Number(r.qty)>0);if(!valid.length)return toast('Adiciona pelo menos uma quantidade.');if(!confirm('Confirmar esta reposição de stock?'))return;try{for(const r of valid){const i=ing(r.ingredient_id),body={ingredient_id:i.id,movement_type:'Entrada',quantity:stockInternalQty(i,Number(r.qty)),cost:Number(r.cost||0),note:'Reposição de stock'};if(databaseConnected)await api('/api/stock-movements',{method:'POST',body:JSON.stringify(body)});else savePrototypeStockMovement(body)}closeModal();await reload();setView('stock');toast('Reposição registada com sucesso.')}catch(e){alert(e.message)}};
}
