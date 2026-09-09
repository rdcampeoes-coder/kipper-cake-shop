function productRecipeComponent(p){
  return data.components.find(c=>c.name===p.name && Array.isArray(c.recipe) && c.recipe.length);
}

prodList=function(){
  return `<div class="section-head"><div><h2>Produtos</h2><div class="muted small">O catálogo vem pré-preenchido. As fichas marcadas como provisórias servem para simulação e podem ser editadas ou resetadas.</div></div><button class="primary" data-new-product>+ Novo produto</button></div><div class="product-grid">${data.products.map(p=>{
    const c=productRecipeComponent(p);
    const custom=p.name==='Bolo Personalizado';
    const recipe=c?c.recipe:[];
    const preview=recipe.slice(0,4).map(r=>{const i=ing(r.ingredient_id);return `<span>${i?.name||'Ingrediente'}: <strong>${unit(i,r.quantity)}</strong></span>`}).join('');
    return `<div class="card product-card"><div class="kind">${p.category||'Produto'}</div><h3>${p.name}</h3><div class="meta">${money(p.price)} · ${p.pricing_type}</div>${custom?`<div class="recipe-preview"><strong>Receita configurável</strong><p>As quantidades são calculadas a partir da massa/base, cobertura/recheio e tamanho escolhidos.</p></div>`:c?`<div class="recipe-preview"><div class="recipe-head"><strong>Ficha técnica</strong><span>${round(c.reference_weight)} g ref.</span></div><div class="recipe-lines">${preview}${recipe.length>4?`<span>+ ${recipe.length-4} ingrediente(s)</span>`:''}</div></div>${c.is_demo?'<div class="demo-note">Valores provisórios — apenas para simulação.</div>':'<div class="real-note">Receita real fornecida.</div>'}`:`<div class="demo-note">Ficha técnica ainda sem quantidades.</div>`}<div class="actions"><button class="secondary" data-product-edit="${p.id}">Editar</button><button class="ghost" data-delete="products" data-id="${p.id}">🗑 Remover</button></div></div>`;
  }).join('')}</div>`;
};
