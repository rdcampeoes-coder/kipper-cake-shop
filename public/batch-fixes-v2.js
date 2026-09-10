/* Batch de correções: unidades de stock, persistência em protótipo e detalhe do histórico. */
function stockDisplayUnit(i){
  if(!i)return '';
  if(i.name==='Ovos')return 'un';
  if(['Natas','Leite','Essência de baunilha'].includes(i.name))return 'L';
  return 'kg';
}
function stockFactor(i){
  if(!i)return 1;
  if(i.name==='Ovos')return 50; // referência média: 1 ovo = 50 g na ficha técnica
  if(['Natas','Leite','Essência de baunilha'].includes(i.name))return 1000;
  return 1000;
}
function stockDisplayQty(i,internal){return round(Number(internal||0)/stockFactor(i))}
function stockInternalQty(i,display){return Number(display||0)*stockFactor(i)}
function stockDisplayText(i,internal){return `${stockDisplayQty(i,internal)} ${stockDisplayUnit(i)}`}

stock=function(){
 return `<div class="section-head"><h2>Ingredientes</h2><div class="actions"><button class="primary" data-stock="Entrada">+ Adicionar stock</button><button class="secondary" data-stock="Saída">− Retirar stock</button></div></div>
 <div class="table-wrap"><table><thead><tr><th>Ingrediente</th><th>Unidade</th><th>Quantidade</th><th>Mínimo</th><th>Estado</th><th></th></tr></thead><tbody>${data.ingredients.map(i=>{const[s,c]=stockState(i);return `<tr><td><strong>${i.name}</strong></td><td>${stockDisplayUnit(i)}</td><td>${stockDisplayQty(i,i.stock)}</td><td>${stockDisplayQty(i,i.min_stock)}</td><td><span class="pill ${c}">${s}</span></td><td><button class="secondary" data-ing-edit="${i.id}">Editar</button></td></tr>`}).join('')}</tbody></table></div>
 <div class="section card"><div class="section-head"><h2>Movimentos recentes</h2></div>${(data.movements||[]).slice(0,12).map(m=>{const i=ing(m.ingredient_id);return `<div class="component-row" style="padding:9px 0;border-bottom:1px solid var(--line)"><div><strong>${m.movement_type}</strong> · ${i?.name||''}<div class="muted small">${dateFmt(m.created_at)} · ${m.note||''}</div></div><strong>${m.movement_type==='Entrada'?'+':'−'}${stockDisplayText(i,m.quantity)}</strong></div>`}).join('')||'<div class="empty">Sem movimentos.</div>'}</div>`;
};

stockModal=function(type){
 openModal(`<h2>${type==='Entrada'?'Adicionar':'Retirar'} stock</h2><div class="form-grid">
 <div class="form-field full"><label>Ingrediente</label><select id="smIng">${data.ingredients.map(i=>`<option value="${i.id}">${i.name} — ${stockDisplayUnit(i)}</option>`).join('')}</select></div>
 <div class="form-field"><label>Quantidade</label><input id="smQty" type="number" min="0" step=".01"></div>
 <div class="form-field"><label>Unidade</label><input id="smUnit" disabled></div>
 ${type==='Entrada'?'<div class="form-field"><label>Custo da reposição (€)</label><input id="smCost" type="number" step=".01" value="0"></div>':''}
 <div class="form-field full"><label>Nota</label><input id="smNote" placeholder="Ex.: Compra no fornecedor"></div></div>
 <div class="modal-footer"><button class="secondary" data-close>Cancelar</button><button class="primary" id="save">Confirmar</button></div>`);
 const syncUnit=()=>{$('#smUnit').value=stockDisplayUnit(ing($('#smIng').value))};$('#smIng').onchange=syncUnit;syncUnit();
 $('#save').onclick=async()=>{
   const i=ing($('#smIng').value),shown=Number($('#smQty').value);if(!shown)return toast('Indica uma quantidade.');
   if(!confirm(`Confirmar ${type.toLowerCase()} de ${shown} ${stockDisplayUnit(i)} de ${i.name}?`))return;
   const body={ingredient_id:i.id,movement_type:type,quantity:stockInternalQty(i,shown),cost:Number($('#smCost')?.value||0),note:$('#smNote').value};
   try{if(databaseConnected)await api('/api/stock-movements',{method:'POST',body:JSON.stringify(body)});else savePrototypeStockMovement(body);closeModal();await reload();setView('stock');toast('Stock atualizado com sucesso.')}catch(e){alert(e.message)}
 };
};

function orderItemSummary(o){
 const items=o.items||[];
 if(!items.length)return '<div class="empty">Sem itens registados.</div>';
 return items.map(it=>{
   const s=size(it.size_id),b=comp(it.base_component_id),c=comp(it.cover_component_id);
   return `<div class="card" style="box-shadow:none;margin-top:10px"><div class="component-row"><div><strong>${it.snapshot?.product||'Bolo personalizado'}</strong><div class="muted small">Quantidade: ${round(it.quantity||1)}</div></div><strong>${money((Number(it.unit_price)||0)*(Number(it.quantity)||1))}</strong></div><div class="kpi-row"><span class="kpi">Massa: ${it.snapshot?.base||b?.name||'—'}</span><span class="kpi">Cobertura: ${it.snapshot?.cover||c?.name||'—'}</span><span class="kpi">Tamanho: ${it.snapshot?.size||s?.name||'—'}</span></div></div>`;
 }).join('');
}
function consumptionRows(o){
 const rows=(o.consumption||[]);
 if(rows.length)return rows.map(r=>{const i=ing(r.ingredient_id);return `<div class="ingredient-line"><span>${i?.name||'Ingrediente'}</span><strong>prev. ${unit(i,r.predicted_qty)} · real ${unit(i,r.actual_qty)}</strong></div>`}).join('');
 const n=needs(o);return n.map(r=>`<div class="ingredient-line"><span>${ing(r.ingredient_id)?.name||'Ingrediente'}</span><strong>${unit(ing(r.ingredient_id),r.quantity)}</strong></div>`).join('')||'<div class="empty">Sem cálculo disponível.</div>';
}
viewOrder=function(id){
 const o=data.orders.find(x=>Number(x.id)===Number(id));if(!o)return;
 const discountLabel=o.discount_type==='percent'?`${o.discount_value}%`:o.discount_type==='fixed'?money(o.discount_value):o.discount_type==='final'?`Total definido: ${money(o.discount_value)}`:'Sem desconto';
 openModal(`<h2>Encomenda · ${client(o.client_id)?.name||''}</h2>
 <div class="kpi-row"><span class="kpi">${dateFmt(o.pickup_date)} ${String(o.pickup_time||'').slice(0,5)}</span>${status(o.status)}<span class="kpi">${o.stock_applied?'Stock descontado':'Stock não descontado'}</span></div>
 <div class="section"><h3 style="font-family:Georgia,serif">Itens</h3>${orderItemSummary(o)}</div>
 <div class="section"><h3 style="font-family:Georgia,serif">Valores</h3><div class="summary-box"><div class="summary-row"><span>Preço original</span><strong>${money(o.original_total)}</strong></div><div class="summary-row"><span>Desconto</span><strong>${discountLabel}</strong></div><div class="summary-row total"><span>Total final</span><span>${money(o.final_total)}</span></div></div></div>
 <div class="section"><h3 style="font-family:Georgia,serif">Ingredientes e quantidades</h3><div class="ingredient-panel">${consumptionRows(o)}</div></div>`);
};

clientHistory=function(id){
 const c=client(id),os=data.orders.filter(o=>Number(o.client_id)===Number(id)).sort((a,b)=>String(b.pickup_date).localeCompare(String(a.pickup_date)));
 openModal(`<h2>${c.name}</h2><div class="muted">${c.contact||''}</div><div class="section"><h3 style="font-family:Georgia,serif">Histórico</h3>${os.map(o=>`<button class="history-order" data-history-order="${o.id}" style="width:100%;border:0;background:transparent;padding:0;text-align:left"><div class="component-row" style="padding:12px 0;border-bottom:1px solid var(--line)"><div><strong>${dateFmt(o.pickup_date)}</strong><div class="muted small">${(o.items||[]).map(it=>it.snapshot?.base||'Encomenda').join(', ')}</div></div><div>${status(o.status)} <strong style="margin-left:8px">${money(o.final_total)}</strong></div></div></button>`).join('')||'<div class="empty">Sem encomendas.</div>'}</div>`);
 $$('[data-history-order]').forEach(b=>b.onclick=()=>viewOrder(b.dataset.historyOrder));
};

prepareModal=function(id){
 const o=data.orders.find(x=>Number(x.id)===Number(id)),n=needs(o);openModal(`<h2>Preparar encomenda</h2><div class="warning-box">Confirma ou ajusta as quantidades reais antes de concluir a preparação.</div><div class="card" style="box-shadow:none;margin-top:14px">${n.map(r=>`<div class="component-row" style="padding:7px 0"><label style="flex:1">${ing(r.ingredient_id)?.name} (${ing(r.ingredient_id)?.unit})</label><input class="aq" data-i="${r.ingredient_id}" data-p="${r.quantity}" type="number" step=".01" value="${round(r.quantity)}" style="width:160px"></div>`).join('')||'<div class="empty">Esta encomenda não tem quantidades configuradas.</div>'}</div><label style="display:flex;gap:8px;align-items:center;margin-top:14px"><input id="applyStock" type="checkbox" checked style="width:auto"> Descontar estas quantidades do stock</label><div class="modal-footer"><button class="secondary" data-close>Cancelar</button><button class="primary" id="save">Confirmar preparação</button></div>`);
 $('#save').onclick=async()=>{if(!confirm('Confirmar a preparação desta encomenda?'))return;const actual=$$('.aq').map(x=>({ingredient_id:Number(x.dataset.i),predicted_qty:Number(x.dataset.p),quantity:Number(x.value)||0}));try{if(databaseConnected)await api(`/api/orders/${id}/prepare`,{method:'POST',body:JSON.stringify({actual,apply_stock:$('#applyStock').checked})});else savePrototypePreparation(id,actual,$('#applyStock').checked);closeModal();await reload();setView('orders');toast('Encomenda preparada.')}catch(e){alert(e.message)}};
};
collect=async function(id){if(!confirm('Confirmar que a encomenda foi recolhida e arquivá-la?'))return;try{if(databaseConnected)await api(`/api/orders/${id}/collect`,{method:'POST',body:'{}'});else setPrototypeOrderStatus(id,'Concluída');await reload();setView('orders');toast('Encomenda arquivada.')}catch(e){alert(e.message)}};
cancelOrder=function(id){const o=data.orders.find(x=>Number(x.id)===Number(id));openModal(`<h2>Cancelar encomenda</h2><div class="danger-box">Tem a certeza de que pretende cancelar esta encomenda?</div>${o.stock_applied?'<label style="display:flex;gap:8px;align-items:center;margin-top:14px"><input id="restore" type="checkbox" checked style="width:auto"> Repor no stock as quantidades descontadas</label>':''}<div class="modal-footer"><button class="secondary" data-close>Voltar</button><button class="danger" id="yes">Confirmar cancelamento</button></div>`);$('#yes').onclick=async()=>{if(!confirm('Confirma novamente o cancelamento?'))return;try{if(databaseConnected)await api(`/api/orders/${id}/cancel`,{method:'POST',body:JSON.stringify({restore_stock:Boolean($('#restore')?.checked)})});else setPrototypeOrderStatus(id,'Cancelada',Boolean($('#restore')?.checked));closeModal();await reload();setView('orders');toast('Encomenda cancelada.')}catch(e){alert(e.message)}}};
