/* Corrige o fluxo de registo de encomendas e mantém os dados em modo protótipo. */
orderModal=function(id=null){
 const o=id?data.orders.find(x=>Number(x.id)===Number(id)):null,it=o?.items?.find(x=>x.item_type==='customCake')||{base_component_id:data.components.find(c=>c.component_group==='Massa')?.id,cover_component_id:data.components.find(c=>['Cobertura','Recheio'].includes(c.component_group))?.id,size_id:data.sizes[0]?.id,quantity:1,unit_price:28};
 openModal(`<h2>${id?'Editar':'Nova'} encomenda</h2><div class="form-grid"><div class="form-field full"><label>Cliente</label><div style="display:flex;gap:8px"><select id="oClient" style="flex:1">${data.clients.map(c=>`<option value="${c.id}">${c.name} — ${c.contact||''}</option>`).join('')}</select><button class="secondary" id="newClientInline" type="button">+ Cliente</button></div></div><div class="form-field"><label>Data de recolha</label><input id="oDate" type="date" value="${String(o?.pickup_date||new Date(Date.now()+86400000).toISOString().slice(0,10)).slice(0,10)}"></div><div class="form-field"><label>Hora</label><input id="oTime" type="time" value="${String(o?.pickup_time||'16:00').slice(0,5)}"></div><div class="form-field"><label>Base do bolo</label><select id="oBase">${data.components.filter(c=>c.component_group==='Massa').map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select></div><div class="form-field"><label>Cobertura / recheio</label><select id="oCover">${data.components.filter(c=>['Cobertura','Recheio'].includes(c.component_group)).map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select></div><div class="form-field"><label>Tamanho</label><select id="oSize">${data.sizes.map(s=>`<option value="${s.id}">${s.name} — ${s.cake_weight}g + ${s.cover_weight}g</option>`).join('')}</select></div><div class="form-field"><label>Quantidade</label><input id="oQty" type="number" min="1" value="${it.quantity||1}"></div><div class="form-field"><label>Preço base (€)</label><input id="oPrice" type="number" step=".01" value="${it.unit_price||28}"></div><div class="form-field"><label>Desconto</label><select id="oDiscType"><option value="none">Sem desconto</option><option value="percent">Percentagem</option><option value="fixed">Valor fixo</option><option value="final">Valor final</option></select></div><div class="form-field"><label>Valor</label><input id="oDisc" type="number" step=".01" value="${o?.discount_value||0}"></div></div><div id="calc" class="section"></div><div class="modal-footer"><button class="secondary" data-close>Cancelar</button><button class="primary" id="save">${id?'Guardar alterações':'Registar encomenda'}</button></div>`);
 if(o)$('#oClient').value=o.client_id;$('#oBase').value=it.base_component_id;$('#oCover').value=it.cover_component_id;$('#oSize').value=it.size_id;$('#oDiscType').value=o?.discount_type||'none';
 $('#newClientInline').onclick=async()=>{
   const name=prompt('Nome do novo cliente:');if(!name)return;const contact=prompt('Contacto do cliente:')||'';
   try{
     const body={name:name.trim(),contact:contact.trim()};
     const c=databaseConnected?await api('/api/clients',{method:'POST',body:JSON.stringify(body)}):savePrototypeClient(body);
     data.clients.push(c);const opt=document.createElement('option');opt.value=c.id;opt.textContent=`${c.name} — ${c.contact||''}`;$('#oClient').appendChild(opt);$('#oClient').value=c.id;toast('Cliente criado e selecionado.');
   }catch(e){alert(e.message)}
 };
 ['oBase','oCover','oSize','oQty','oPrice','oDiscType','oDisc'].forEach(k=>$('#'+k).oninput=orderCalc);orderCalc();
 $('#save').onclick=async()=>{
   if(!$('#oClient').value)return alert('Seleciona ou cria um cliente.');
   if(!confirm(id?'Deseja guardar as alterações desta encomenda?':'Deseja mesmo registar esta encomenda?'))return;
   const saveBtn=$('#save');saveBtn.disabled=true;saveBtn.textContent=id?'A guardar…':'A registar…';
   try{
     const qty=Number($('#oQty').value)||1,price=Number($('#oPrice').value)||0,original=qty*price,dt=$('#oDiscType').value,dv=Number($('#oDisc').value)||0;let total=original;if(dt==='percent')total*=1-dv/100;if(dt==='fixed')total-=dv;if(dt==='final')total=dv;
     const item={item_type:'customCake',base_component_id:Number($('#oBase').value),cover_component_id:Number($('#oCover').value),size_id:Number($('#oSize').value),quantity:qty,unit_price:price,snapshot:{base:comp($('#oBase').value)?.name,cover:comp($('#oCover').value)?.name,size:size($('#oSize').value)?.name}};
     const body={client_id:Number($('#oClient').value),pickup_date:$('#oDate').value,pickup_time:$('#oTime').value,original_total:round(original),discount_type:dt,discount_value:dv,final_total:round(Math.max(0,total)),items:[item]};
     if(databaseConnected)await api(id?`/api/orders/${id}`:'/api/orders',{method:id?'PUT':'POST',body:JSON.stringify(body)});else savePrototypeOrder(body,id);
     closeModal();await reload();setView('orders');toast(id?'Encomenda atualizada com sucesso.':'Encomenda registada com sucesso.');
   }catch(e){
     saveBtn.disabled=false;saveBtn.textContent=id?'Guardar alterações':'Registar encomenda';alert(`Não foi possível guardar a encomenda: ${e.message}`);
   }
 };
};
