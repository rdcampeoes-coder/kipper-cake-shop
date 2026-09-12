/* Kipper v4: recolhas rápidas, histórico limpo, ciclos financeiros, gráfico e dados demo. */
const KIPPER_V4_KEY='kipper_v4_round_20260912';
function v4Read(){try{return JSON.parse(localStorage.getItem(KIPPER_V4_KEY)||'{}')}catch{return {}}}
function v4Write(x){localStorage.setItem(KIPPER_V4_KEY,JSON.stringify(x))}
function v4Settings(){const x=v4Read();return {cycleDay:Math.min(31,Math.max(1,Number(x.cycleDay)||1)),demoSeeded:Boolean(x.demoSeeded)}}
function v4SetCycleDay(day){const x=v4Read();x.cycleDay=Math.min(31,Math.max(1,Number(day)||1));v4Write(x)}
function v4MarkDemoSeeded(){const x=v4Read();x.demoSeeded=true;v4Write(x)}
function v4Date(v){if(!v)return null;const d=new Date(String(v).slice(0,10)+'T12:00:00');return Number.isNaN(d.getTime())?null:d}
function v4DaysInMonth(y,m){return new Date(y,m+1,0).getDate()}
function v4CycleDate(y,m,day){return new Date(y,m,Math.min(day,v4DaysInMonth(y,m)),12,0,0,0)}
function v4CycleStartFor(date,day=v4Settings().cycleDay){const d=new Date(date),y=d.getFullYear(),m=d.getMonth(),candidate=v4CycleDate(y,m,day);return d>=candidate?candidate:v4CycleDate(y,m-1,day)}
function v4NextCycle(start,day=v4Settings().cycleDay){return v4CycleDate(start.getFullYear(),start.getMonth()+1,day)}
function v4DateShort(d){return new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'short'}).format(d)}
function v4CycleLabel(start,end){return `${v4DateShort(start)} – ${v4DateShort(new Date(end.getTime()-86400000))}`}
function v4InCycle(value,start,end){const d=v4Date(value);return Boolean(d&&d>=start&&d<end)}
function v4ExpenseIsStock(e){return String(e?.name||'').toLowerCase().startsWith('reposição de stock')}
function v4CycleSummary(start,day=v4Settings().cycleDay){
 const end=v4NextCycle(start,day);
 const revenue=data.orders.filter(o=>o.status==='Concluída'&&v4InCycle(o.completed_at||o.pickup_date,start,end)).reduce((s,o)=>s+Number(o.final_total||0),0);
 const stockMovements=(data.movements||[]).filter(m=>m.movement_type==='Entrada'&&v4InCycle(m.created_at,start,end));
 const stock=stockMovements.reduce((s,m)=>s+Number(m.cost||0),0);
 const expenseRows=(data.expenses||[]).filter(e=>!v4ExpenseIsStock(e)&&v4InCycle(e.expense_date,start,end));
 const other=expenseRows.reduce((s,e)=>s+Number(e.value||0),0);
 return {start,end,label:v4CycleLabel(start,end),revenue:round(revenue),stock:round(stock),other:round(other),expenses:round(stock+other),balance:round(revenue-stock-other),stockMovements,expenseRows};
}
function v4AllCycles(){
 const dates=[];
 data.orders.filter(o=>o.status==='Concluída').forEach(o=>{const d=v4Date(o.completed_at||o.pickup_date);if(d)dates.push(d)});
 (data.movements||[]).filter(m=>m.movement_type==='Entrada').forEach(m=>{const d=v4Date(m.created_at);if(d)dates.push(d)});
 (data.expenses||[]).forEach(e=>{const d=v4Date(e.expense_date);if(d)dates.push(d)});
 const day=v4Settings().cycleDay,now=new Date(),first=dates.length?new Date(Math.min(...dates.map(d=>d.getTime()))):now;
 let cur=v4CycleStartFor(first,day),last=v4CycleStartFor(now,day),out=[],guard=0;
 while(cur<=last&&guard++<120){out.push(v4CycleSummary(cur,day));cur=v4NextCycle(cur,day)}
 return out;
}
function v4OverallFinance(){
 const revenue=data.orders.filter(o=>o.status==='Concluída').reduce((s,o)=>s+Number(o.final_total||0),0);
 const stock=(data.movements||[]).filter(m=>m.movement_type==='Entrada').reduce((s,m)=>s+Number(m.cost||0),0);
 const other=(data.expenses||[]).filter(e=>!v4ExpenseIsStock(e)).reduce((s,e)=>s+Number(e.value||0),0);
 return {revenue:round(revenue),stock:round(stock),other:round(other),expenses:round(stock+other),balance:round(revenue-stock-other)};
}

function v4Dashboard(){
 const active=data.orders.filter(o=>!['Concluída','Cancelada'].includes(o.status)),low=data.ingredients.filter(i=>!i.stock_hidden&&Number(i.stock)>0&&Number(i.stock)<=Number(i.min_stock)),out=data.ingredients.filter(i=>!i.stock_hidden&&Number(i.stock)<=0),overall=v4OverallFinance();
 const upcoming=[...active].sort((a,b)=>`${a.pickup_date||''}${a.pickup_time||''}`.localeCompare(`${b.pickup_date||''}${b.pickup_time||''}`)).slice(0,6);
 return `<div class="grid cards-4"><div class="card stat"><div class="label">Encomendas agendadas</div><div class="value">${active.length}</div></div><div class="card stat low"><div class="label">Stock baixo</div><div class="value">${low.length}</div></div><div class="card stat out"><div class="label">Sem stock</div><div class="value">${out.length}</div></div><div class="card stat"><div class="label">Faturação concluída</div><div class="value">${money(overall.revenue)}</div></div></div>
 <div class="grid cards-2 section"><div class="card"><div class="section-head"><h2>Próximas recolhas</h2><button class="ghost" data-go="orders">Ver todas →</button></div>${upcoming.map(o=>`<div class="pickup-card"><button class="pickup-main" data-dash-order="${o.id}"><span class="datebox">${new Date(String(o.pickup_date).slice(0,10)+'T12:00:00').getDate()}<br>${new Intl.DateTimeFormat('pt-PT',{month:'short'}).format(new Date(String(o.pickup_date).slice(0,10)+'T12:00:00')).toUpperCase()}</span><span class="pickup-copy"><strong>${client(o.client_id)?.name||'Cliente'}</strong><span>${String(o.pickup_time||'').slice(0,5)} · ${(o.items||[]).length} item(ns)</span></span><span>${status(o.status)}</span></button><button class="secondary pickup-deliver" data-dash-deliver="${o.id}">Marcar entregue</button></div>`).join('')||'<div class="empty">Sem encomendas.</div>'}</div>
 <div class="card"><div class="section-head"><h2>Alertas de stock</h2><button class="ghost" data-go="stock">Abrir stock →</button></div>${[...out,...low].slice(0,7).map(i=>{const[s,c]=stockState(i);return `<div class="component-row movement-line"><div><strong>${i.name}</strong><div class="muted small">Atual ${stockDisplayText(i,i.stock)} · alerta ${stockDisplayText(i,i.min_stock)}</div></div><span class="pill ${c}">${s}</span></div>`}).join('')||'<div class="empty">Sem alertas.</div>'}</div></div>`;
}
dashboard=v4Dashboard;

async function v4MarkDelivered(id){
 const o=data.orders.find(x=>Number(x.id)===Number(id));if(!o)return;
 const extra=o.stock_applied?'':'\n\nAtenção: esta encomenda ainda não tem o stock marcado como descontado.';
 if(!confirm(`Marcar esta encomenda como entregue/recebida e enviá-la para o arquivo?${extra}`))return;
 try{if(databaseConnected)await api(`/api/orders/${id}/collect`,{method:'POST',body:'{}'});else setPrototypeOrderStatus(id,'Concluída');closeModal();await reload();toast('Encomenda concluída e arquivada.')}catch(e){alert(e.message)}
}

function v4ActualIngredientQty(order,item,r){
 const cons=order.consumption||[];if(!cons.length)return Number(r.quantity||0);
 const total=needs(order).find(x=>Number(x.ingredient_id)===Number(r.ingredient_id))?.quantity||0;
 const actual=cons.find(x=>Number(x.ingredient_id)===Number(r.ingredient_id))?.actual_qty;
 if(actual===undefined||!Number(total))return Number(r.quantity||0);
 return Number(r.quantity||0)*(Number(actual)/Number(total));
}
function v4ItemHistoryHtml(order,it){
 const pName=it.snapshot?.product||product(it.product_id)?.name||'Produto',ingredients=it.snapshot?.ingredients?.length?it.snapshot.ingredients:calcDraftNeeds(it),used=(order.consumption||[]).length>0;
 return `<div class="card order-detail-item"><div class="component-row"><div><strong>${pName}</strong><div class="muted small">Quantidade: ${round(it.quantity||1)}</div></div><strong>${money((Number(it.unit_price)||0)*(Number(it.quantity)||1))}</strong></div>${it.snapshot?.base?`<div class="kpi-row"><span class="kpi">Massa: ${it.snapshot.base}</span><span class="kpi">Cobertura: ${it.snapshot.cover||'—'}</span><span class="kpi">Tamanho: ${it.snapshot.size||'—'}</span></div>`:''}<div class="recipe-used-title">${used?'Ingredientes usados':'Ingredientes da receita'}</div><div class="ingredient-panel mini-panel">${ingredients.map(r=>`<div class="ingredient-line"><span>${ing(r.ingredient_id)?.name||'Ingrediente'}</span><strong>${unit(ing(r.ingredient_id),round(v4ActualIngredientQty(order,it,r)))}</strong></div>`).join('')||'<div class="empty">Sem ingredientes configurados.</div>'}</div></div>`;
}
viewOrder=function(id){
 const o=data.orders.find(x=>Number(x.id)===Number(id));if(!o)return;
 const discountLabel=o.discount_type==='percent'?`${o.discount_value}%`:o.discount_type==='fixed'?money(o.discount_value):o.discount_type==='final'?`Total definido: ${money(o.discount_value)}`:'Sem desconto';
 openModal(`<h2>Encomenda · ${client(o.client_id)?.name||''}</h2><div class="kpi-row"><span class="kpi">${dateFmt(o.pickup_date)} ${String(o.pickup_time||'').slice(0,5)}</span>${status(o.status)}<span class="kpi">${o.stock_applied?'Stock descontado':'Stock não descontado'}</span></div>${o.notes?`<div class="section note-box"><strong>Observações</strong><div>${esc(o.notes)}</div></div>`:''}<div class="section"><h3>Produtos</h3>${(o.items||[]).map(it=>v4ItemHistoryHtml(o,it)).join('')||'<div class="empty">Sem itens.</div>'}</div><div class="summary-box section"><div class="summary-row"><span>Preço original</span><strong>${money(o.original_total)}</strong></div><div class="summary-row"><span>Desconto</span><strong>${discountLabel}</strong></div><div class="summary-row total"><span>Total final</span><span>${money(o.final_total)}</span></div></div>${!['Concluída','Cancelada'].includes(o.status)?`<div class="modal-footer"><button class="primary" id="v4DeliverOrder">Marcar como entregue / recebido</button></div>`:''}`);
 $('#v4DeliverOrder')?.addEventListener('click',()=>v4MarkDelivered(o.id));
};

const v4OrderModalBase=orderModal;
orderModal=function(id=null){
 v4OrderModalBase(id);
 const syncDiscountLabel=()=>{const select=$('#oDiscType'),input=$('#oDisc');if(!select||!input)return;const label=input.closest('.form-field')?.querySelector('label');if(!label)return;label.textContent=select.value==='percent'?'Valor do desconto (%)':select.value==='fixed'?'Valor do desconto (€)':select.value==='final'?'Valor final da encomenda (€)':'Valor do desconto'};
 $('#oDiscType')?.addEventListener('change',syncDiscountLabel);syncDiscountLabel();
};

function v4PurchaseDetail(summary){
 const map={};for(const m of summary.stockMovements){const id=String(m.ingredient_id);if(!map[id])map[id]={ingredient:ing(m.ingredient_id),quantity:0,cost:0,count:0};map[id].quantity+=Number(m.quantity||0);map[id].cost+=Number(m.cost||0);map[id].count++}
 const rows=Object.values(map);
 openModal(`<h2>Compras de stock</h2><div class="muted">${summary.label}</div><div class="section">${rows.map(r=>`<div class="purchase-summary-row"><div><strong>${r.ingredient?.name||'Ingrediente'}</strong><div class="muted small">${r.count} compra(s) · ${stockDisplayText(r.ingredient,r.quantity)}</div></div><strong>${money(r.cost)}</strong></div>`).join('')||'<div class="empty">Sem compras de stock neste ciclo.</div>'}</div><div class="summary-box"><div class="summary-row total"><span>Total gasto em stock</span><span>${money(summary.stock)}</span></div></div>`);
}
function v4CycleDetail(summary){
 openModal(`<h2>Ciclo financeiro</h2><div class="muted">${summary.label}</div><div class="grid cards-2 section"><div class="card stat"><div class="label">Receitas</div><div class="value small-value">${money(summary.revenue)}</div></div><div class="card stat"><div class="label">Despesas</div><div class="value small-value">${money(summary.expenses)}</div></div></div><div class="summary-box"><div class="summary-row"><span>Compras de stock</span><strong>${money(summary.stock)}</strong></div><div class="summary-row"><span>Outras despesas</span><strong>${money(summary.other)}</strong></div><div class="summary-row total"><span>Balanço</span><span>${money(summary.balance)}</span></div></div><div class="modal-footer"><button class="secondary" id="v4CycleStock">Ver compras de stock</button></div>`);$('#v4CycleStock').onclick=()=>v4PurchaseDetail(summary);
}
function v4FinanceChart(){
 const cycles=v4AllCycles();if(!cycles.length)return toast('Ainda não há dados para o gráfico.');
 const W=760,H=360,P={l:56,r:24,t:34,b:64},vals=cycles.flatMap(c=>[c.revenue,c.expenses,c.balance]),min=Math.min(0,...vals),max=Math.max(1,...vals),range=max-min||1,x=i=>P.l+(cycles.length===1?0:(i*(W-P.l-P.r)/(cycles.length-1))),y=v=>P.t+(max-v)*(H-P.t-P.b)/range,points=key=>cycles.map((c,i)=>`${x(i)},${y(c[key])}`).join(' ');
 const grid=[0,.25,.5,.75,1].map(t=>{const yy=P.t+t*(H-P.t-P.b),val=max-t*range;return `<line x1="${P.l}" y1="${yy}" x2="${W-P.r}" y2="${yy}" class="chart-grid"/><text x="${P.l-8}" y="${yy+4}" text-anchor="end" class="chart-axis">${Math.round(val)}€</text>`}).join('');
 const labels=cycles.map((c,i)=>`<text x="${x(i)}" y="${H-P.b+24}" text-anchor="middle" class="chart-axis">${c.label.split('–')[0].trim()}</text>`).join('');
 openModal(`<h2>Evolução financeira</h2><div class="muted">Desde o primeiro ciclo registado. Balanço = receitas − despesas.</div><div class="chart-legend"><span class="legend revenue">Receitas</span><span class="legend expenses">Despesas</span><span class="legend balance">Balanço</span></div><div class="finance-chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico financeiro mensal">${grid}<polyline points="${points('revenue')}" class="finance-line revenue-line"/><polyline points="${points('expenses')}" class="finance-line expenses-line"/><polyline points="${points('balance')}" class="finance-line balance-line"/>${labels}</svg></div>`);
}
finance=function(){
 const overall=v4OverallFinance(),cycles=v4AllCycles(),current=cycles[cycles.length-1]||v4CycleSummary(v4CycleStartFor(new Date())),history=cycles.slice(0,-1).reverse();
 return `<div class="section-head"><div><h2>Finanças totais</h2><div class="muted small">Visão acumulada desde o início dos registos.</div></div><button class="secondary" data-fin-chart>Ver gráfico</button></div><div class="grid cards-4"><div class="card stat"><div class="label">Receitas</div><div class="value">${money(overall.revenue)}</div></div><div class="card stat"><div class="label">Compras de stock</div><div class="value">${money(overall.stock)}</div></div><div class="card stat"><div class="label">Outras despesas</div><div class="value">${money(overall.other)}</div></div><div class="card stat"><div class="label">Balanço</div><div class="value">${money(overall.balance)}</div></div></div>
 <div class="section card finance-cycle-card"><div class="section-head"><div><h2>Ciclo atual</h2><div class="muted small">${current.label}</div></div><div class="cycle-setting"><label>Dia do ciclo</label><input id="financeCycleDay" type="number" min="1" max="31" value="${v4Settings().cycleDay}"></div></div><div class="grid cards-4 cycle-grid"><button class="card stat finance-stat-button" data-fin-cycle-current><div class="label">Receitas</div><div class="value small-value">${money(current.revenue)}</div></button><button class="card stat finance-stat-button" data-fin-stock-current><div class="label">Compras de stock</div><div class="value small-value">${money(current.stock)}</div><div class="muted small">Ver detalhe</div></button><button class="card stat finance-stat-button" data-fin-cycle-current><div class="label">Despesas totais</div><div class="value small-value">${money(current.expenses)}</div></button><button class="card stat finance-stat-button" data-fin-cycle-current><div class="label">Balanço</div><div class="value small-value">${money(current.balance)}</div></button></div></div>
 <div class="section"><div class="section-head"><h2>Histórico financeiro</h2></div><div class="finance-history">${history.map((c,i)=>`<button class="history-order finance-history-row" data-fin-history="${i}"><div><strong>${c.label}</strong><div class="muted small">Receitas ${money(c.revenue)} · Despesas ${money(c.expenses)}</div></div><strong class="${c.balance<0?'negative':''}">${money(c.balance)}</strong></button>`).join('')||'<div class="empty">O primeiro ciclo ainda está em curso.</div>'}</div></div>
 <div class="section-head section"><h2>Despesas</h2><button class="primary" data-new-expense>+ Adicionar despesa</button></div><div class="table-wrap"><table><thead><tr><th>Nome</th><th>Tipo</th><th>Data</th><th>Valor</th><th></th></tr></thead><tbody>${data.expenses.filter(e=>!v4ExpenseIsStock(e)).map(e=>`<tr><td><strong>${e.name}</strong></td><td>${e.expense_type}</td><td>${dateFmt(e.expense_date)}</td><td>${money(e.value)}</td><td><div class="actions"><button class="secondary" data-exp-edit="${e.id}">Editar</button><button class="ghost" data-delete="expenses" data-id="${e.id}">🗑</button></div></td></tr>`).join('')}</tbody></table></div>`;
};

function v4DemoProduct(name,qty=1,baseName=null,coverName=null,sizeName='P'){
 const p=data.products.find(x=>x.name===name)||data.products[0],cake=isCakeProduct(p),it={item_type:cake?'customCake':'product',product_id:p?.id,quantity:qty,unit_price:Number(p?.price||0)};
 if(cake){it.base_component_id=(data.components.find(c=>c.name===(baseName||name)&&c.component_group==='Massa')||data.components.find(c=>c.component_group==='Massa'))?.id;it.cover_component_id=(data.components.find(c=>c.name===coverName)||data.components.find(c=>['Cobertura','Recheio'].includes(c.component_group)))?.id;it.size_id=(data.sizes.find(s=>s.name===sizeName)||data.sizes[0])?.id}
 it.snapshot={product:p?.name||name,base:cake?comp(it.base_component_id)?.name:null,cover:cake?comp(it.cover_component_id)?.name:null,size:cake?size(it.size_id)?.name:null};it.snapshot.ingredients=calcDraftNeeds(it);return it;
}
function v4DemoOrder(id,clientId,date,status,items,discount=0,notes=''){
 const original=items.reduce((s,it)=>s+Number(it.quantity||1)*Number(it.unit_price||0),0),final=round(original*(1-discount/100)),order={id,client_id:clientId,pickup_date:date,pickup_time:'16:00',status,original_total:round(original),discount_type:discount?'percent':'none',discount_value:discount,final_total:final,stock_applied:status==='Concluída',created_at:`${date}T10:00:00`,completed_at:status==='Concluída'?`${date}T18:00:00`:null,notes,items};
 if(status==='Concluída'){const n=needs(order);order.consumption=n.map((r,k)=>({ingredient_id:r.ingredient_id,predicted_qty:r.quantity,actual_qty:round(r.quantity*(k%2?1.02:.99)),unit:ing(r.ingredient_id)?.unit||''}))}
 return order;
}
function ensureV4DemoData(){
 if(databaseConnected||v4Settings().demoSeeded)return false;
 const store=readPrototypeStore(),ids=new Set(store.orders.map(o=>Number(o.id))),clientsToAdd=[{id:94001,name:'Ana Martins',contact:'913 820 441'},{id:94002,name:'Sofia Costa',contact:'965 114 780'},{id:94003,name:'Rita Almeida',contact:'927 306 519'}];
 for(const c of clientsToAdd)if(!data.clients.some(x=>String(x.contact)===c.contact)&&!store.clients.some(x=>String(x.contact)===c.contact))store.clients.push(c);
 const cid=n=>n===0?1:n===1?2:clientsToAdd[(n-2)%clientsToAdd.length].id;
 const specs=[
  ['2026-03-08',0,[v4DemoProduct('Bolo de Cenoura',1,'Bolo de Cenoura','Cobertura de Chocolate','P')],0],['2026-03-21',2,[v4DemoProduct('Brigadeiro Tradicional 20g',12)],0],['2026-03-29',3,[v4DemoProduct('Bolo de Chocolate',1,'Bolo de Chocolate','Brigadeiro Brûlée','M')],10],
  ['2026-04-05',1,[v4DemoProduct('Cupcakes',12)],0],['2026-04-12',4,[v4DemoProduct('Bolo de Baunilha',1,'Bolo de Baunilha','Nido com Nutella','P')],0],['2026-04-19',0,[v4DemoProduct('Bem Casado',20)],5],['2026-04-27',2,[v4DemoProduct('Bento Cake',1)],0],
  ['2026-05-03',3,[v4DemoProduct('Cheesecake',1)],0],['2026-05-16',4,[v4DemoProduct('Bolo de Chocolate',1,'Bolo de Chocolate','Doce de leite e paçoca','M')],8],['2026-05-30',1,[v4DemoProduct('Brigadeiro Festa 15g',50)],0],
  ['2026-06-06',0,[v4DemoProduct('Mini Cake',1),v4DemoProduct('Cupcakes',6)],0],['2026-06-14',2,[v4DemoProduct('Bolo de Baunilha',1,'Bolo de Baunilha','Pistácio e frutos vermelhos','M')],10],['2026-06-22',3,[v4DemoProduct('Pudim',1)],0],['2026-06-28',4,[v4DemoProduct('Brigadeiro Tradicional 20g',25)],0],
  ['2026-07-04',1,[v4DemoProduct('Bolo de Cenoura',1,'Bolo de Cenoura','Cobertura de Chocolate','M')],0],['2026-07-12',2,[v4DemoProduct('Cheesecake',1),v4DemoProduct('Brigadeiro Tradicional 20g',12)],5],['2026-07-18',3,[v4DemoProduct('Bento Cake',2)],0],['2026-07-25',0,[v4DemoProduct('Bolo de Chocolate',1,'Bolo de Chocolate','Nido com Nutella','P')],0],
  ['2026-08-02',4,[v4DemoProduct('Cupcakes',18)],0],['2026-08-09',1,[v4DemoProduct('Bolo de Baunilha',1,'Bolo de Baunilha','Doce de leite e paçoca','M')],5],['2026-08-17',2,[v4DemoProduct('Bem Casado',30)],0],['2026-08-29',3,[v4DemoProduct('Mini Cake',1),v4DemoProduct('Brigadeiro Festa 15g',50)],10],
  ['2026-09-03',0,[v4DemoProduct('Bolo de Cenoura',1,'Bolo de Cenoura','Cobertura de Chocolate','P')],0],['2026-09-07',4,[v4DemoProduct('Brigadeiro Tradicional 20g',12)],0]
 ];
 specs.forEach((s,n)=>{const id=95000+n;if(!ids.has(id))store.orders.push(v4DemoOrder(id,cid(s[1]),s[0],'Concluída',s[2],s[3],'Dados de demonstração'))});
 const activeSpecs=[['2026-09-14',2,[v4DemoProduct('Bolo de Chocolate',1,'Bolo de Chocolate','Brigadeiro Brûlée','M')]],['2026-09-16',3,[v4DemoProduct('Cupcakes',12),v4DemoProduct('Brigadeiro Tradicional 20g',12)]],['2026-09-19',4,[v4DemoProduct('Bolo de Baunilha',1,'Bolo de Baunilha','Pistácio e frutos vermelhos','P')]],['2026-09-22',1,[v4DemoProduct('Cheesecake',1)]]];
 activeSpecs.forEach((s,n)=>{const id=95100+n;if(!ids.has(id))store.orders.push(v4DemoOrder(id,cid(s[1]),s[0],'Registada',s[2],0,'Encomenda de demonstração'))});
 const purchasePlan=[['2026-03-02',1,7000,15.8],['2026-03-02',2,10000,12.4],['2026-03-02',3,900,8.4],['2026-04-02',4,2500,31.5],['2026-04-02',5,3160,13.6],['2026-04-02',11,2000,16.2],['2026-05-02',2,8000,10.2],['2026-05-02',1,6000,13.1],['2026-05-02',13,3000,9.8],['2026-06-02',3,1200,11.3],['2026-06-02',5,3950,16.9],['2026-06-02',4,3000,37.2],['2026-07-02',1,8000,17.4],['2026-07-02',2,12000,14.7],['2026-07-02',20,1000,18.8],['2026-08-02',5,4740,20.6],['2026-08-02',11,2500,19.5],['2026-08-02',21,1600,12.9],['2026-09-02',1,5000,11.2],['2026-09-02',2,8000,10.1],['2026-09-02',4,2000,25.4]];
 const movementIds=new Set(store.movements.map(m=>Number(m.id)));purchasePlan.forEach((r,n)=>{const id=96000+n;if(!movementIds.has(id))store.movements.push({id,ingredient_id:r[1],movement_type:'Entrada',quantity:r[2],cost:r[3],note:'Compra demo',created_at:`${r[0]}T11:00:00`})});
 const expensePlan=[['2026-03-05','Embalagens','Pontual',22],['2026-03-25','Eletricidade','Mensal',38],['2026-04-07','Publicidade','Pontual',25],['2026-04-25','Eletricidade','Mensal',41],['2026-05-08','Embalagens','Pontual',28],['2026-05-25','Eletricidade','Mensal',39],['2026-06-09','Material de decoração','Pontual',34],['2026-06-25','Eletricidade','Mensal',44],['2026-07-06','Embalagens','Pontual',31],['2026-07-25','Eletricidade','Mensal',46],['2026-08-10','Publicidade','Pontual',30],['2026-08-25','Eletricidade','Mensal',43],['2026-09-05','Embalagens','Pontual',24]];
 const expenseIds=new Set(store.expenses.map(e=>Number(e.id)));expensePlan.forEach((r,n)=>{const id=97000+n;if(!expenseIds.has(id))store.expenses.push({id,expense_date:r[0],name:r[1],expense_type:r[2],value:r[3]})});
 writePrototypeStore(store);v4MarkDemoSeeded();return true;
}

const v4BindBase=bind;
bind=function(){
 v4BindBase();
 $$('[data-dash-order]').forEach(b=>b.onclick=()=>viewOrder(b.dataset.dashOrder));
 $$('[data-dash-deliver]').forEach(b=>b.onclick=e=>{e.stopPropagation();v4MarkDelivered(b.dataset.dashDeliver)});
 $('[data-fin-chart]')?.addEventListener('click',v4FinanceChart);
 const cycles=v4AllCycles(),current=cycles[cycles.length-1];
 $('[data-fin-stock-current]')?.addEventListener('click',()=>current&&v4PurchaseDetail(current));
 $$('[data-fin-cycle-current]').forEach(b=>b.onclick=()=>current&&v4CycleDetail(current));
 $$('[data-fin-history]').forEach(b=>{const history=cycles.slice(0,-1).reverse();b.onclick=()=>v4CycleDetail(history[Number(b.dataset.finHistory)])});
 $('#financeCycleDay')?.addEventListener('change',e=>{const next=Math.min(31,Math.max(1,Number(e.target.value)||1)),old=v4Settings().cycleDay;if(next===old)return;if(!confirm(`Alterar o dia do ciclo financeiro de ${old} para ${next}? Os períodos apresentados serão recalculados.`)){e.target.value=old;return}v4SetCycleDay(next);render();toast('Dia do ciclo atualizado.')});
};

setTimeout(async()=>{try{await reload();const seeded=ensureV4DemoData();if(seeded)await reload();render()}catch(e){console.error('Kipper v4 init',e)}},80);
