const empty={clients:[],ingredients:[],products:[],sizes:[],components:[],orders:[],expenses:[],movements:[],demoRecipes:false};

export function registerCoreRoutes(app,pool,hasDatabase){
  app.get('/api/health',(req,res)=>res.json({ok:true,database:hasDatabase}));

  const needDb=res=>{if(!pool){res.status(503).json({error:'Base de dados não configurada'});return true}return false};
  const wid=req=>req.workspaceId;

  app.get('/api/bootstrap',async(req,res,next)=>{try{
    if(!pool)return res.json(empty);
    const w=wid(req);
    if(!w)return res.json(empty);
    const [clients,ingredients,products,sizes,components,orders,items,expenses,movements,recipes]=await Promise.all([
      pool.query('SELECT * FROM clients WHERE workspace_id=$1 ORDER BY name',[w]),
      pool.query('SELECT * FROM ingredients WHERE workspace_id=$1 AND active=TRUE ORDER BY name',[w]),
      pool.query('SELECT * FROM products WHERE workspace_id=$1 AND active=TRUE ORDER BY category,name',[w]),
      pool.query('SELECT * FROM sizes WHERE workspace_id=$1 AND active=TRUE ORDER BY id',[w]),
      pool.query('SELECT * FROM components WHERE workspace_id=$1 AND active=TRUE ORDER BY component_group,name',[w]),
      pool.query('SELECT * FROM orders WHERE workspace_id=$1 ORDER BY pickup_date,pickup_time',[w]),
      pool.query('SELECT * FROM order_items WHERE workspace_id=$1 ORDER BY id',[w]),
      pool.query('SELECT * FROM expenses WHERE workspace_id=$1 ORDER BY expense_date DESC,id DESC',[w]),
      pool.query('SELECT * FROM stock_movements WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100',[w]),
      pool.query('SELECT * FROM component_ingredients WHERE workspace_id=$1 ORDER BY component_id,ingredient_id',[w])
    ]);
    const comps=components.rows.map(c=>({...c,recipe:recipes.rows.filter(r=>Number(r.component_id)===Number(c.id))}));
    const ords=orders.rows.map(o=>({...o,items:items.rows.filter(i=>Number(i.order_id)===Number(o.id))}));
    res.json({clients:clients.rows,ingredients:ingredients.rows,products:products.rows,sizes:sizes.rows,components:comps,orders:ords,expenses:expenses.rows,movements:movements.rows,demoRecipes:false});
  }catch(e){next(e)}});

  app.post('/api/clients',async(req,res,next)=>{try{
    if(needDb(res))return;const w=wid(req),name=String(req.body.name||'').trim(),contact=String(req.body.contact||'').trim();
    if(!name)return res.status(400).json({error:'Nome obrigatório'});
    if(contact){const d=await pool.query('SELECT name FROM clients WHERE workspace_id=$1 AND contact=$2 LIMIT 1',[w,contact]);if(d.rows[0])return res.status(409).json({error:`Já existe um cliente com este contacto: ${d.rows[0].name}`})}
    const {rows}=await pool.query('INSERT INTO clients(workspace_id,name,contact) VALUES($1,$2,$3) RETURNING *',[w,name,contact||null]);res.json(rows[0]);
  }catch(e){next(e)}});

  app.put('/api/clients/:id',async(req,res,next)=>{try{
    if(needDb(res))return;const w=wid(req),id=+req.params.id,name=String(req.body.name||'').trim(),contact=String(req.body.contact||'').trim();
    if(contact){const d=await pool.query('SELECT name FROM clients WHERE workspace_id=$1 AND contact=$2 AND id<>$3 LIMIT 1',[w,contact,id]);if(d.rows[0])return res.status(409).json({error:`Já existe um cliente com este contacto: ${d.rows[0].name}`})}
    const {rows}=await pool.query('UPDATE clients SET name=$1,contact=$2 WHERE id=$3 AND workspace_id=$4 RETURNING *',[name,contact||null,id,w]);
    if(!rows[0])return res.status(404).json({error:'Cliente não encontrado'});res.json(rows[0]);
  }catch(e){next(e)}});

  app.post('/api/products',async(req,res,next)=>{try{if(needDb(res))return;const w=wid(req),b=req.body,{rows}=await pool.query('INSERT INTO products(workspace_id,name,category,price,pricing_type) VALUES($1,$2,$3,$4,$5) RETURNING *',[w,b.name,b.category||null,b.price||0,b.pricing_type||'unidade']);res.json(rows[0])}catch(e){next(e)}});
  app.put('/api/products/:id',async(req,res,next)=>{try{if(needDb(res))return;const w=wid(req),b=req.body,{rows}=await pool.query('UPDATE products SET name=$1,category=$2,price=$3,pricing_type=$4 WHERE id=$5 AND workspace_id=$6 RETURNING *',[b.name,b.category||null,b.price||0,b.pricing_type||'unidade',+req.params.id,w]);if(!rows[0])return res.status(404).json({error:'Produto não encontrado'});res.json(rows[0])}catch(e){next(e)}});

  app.post('/api/sizes',async(req,res,next)=>{try{if(needDb(res))return;const w=wid(req),b=req.body,{rows}=await pool.query('INSERT INTO sizes(workspace_id,name,cake_weight,cover_weight) VALUES($1,$2,$3,$4) RETURNING *',[w,b.name,b.cake_weight||0,b.cover_weight||0]);res.json(rows[0])}catch(e){next(e)}});
  app.put('/api/sizes/:id',async(req,res,next)=>{try{if(needDb(res))return;const w=wid(req),b=req.body,{rows}=await pool.query('UPDATE sizes SET name=$1,cake_weight=$2,cover_weight=$3 WHERE id=$4 AND workspace_id=$5 RETURNING *',[b.name,b.cake_weight||0,b.cover_weight||0,+req.params.id,w]);if(!rows[0])return res.status(404).json({error:'Tamanho não encontrado'});res.json(rows[0])}catch(e){next(e)}});

  app.post('/api/ingredients',async(req,res,next)=>{try{if(needDb(res))return;const w=wid(req),b=req.body,{rows}=await pool.query('INSERT INTO ingredients(workspace_id,name,unit,stock,min_stock,ideal_stock) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[w,b.name,b.unit||'g',b.stock||0,b.min_stock||0,b.ideal_stock||null]);res.json(rows[0])}catch(e){next(e)}});
  app.put('/api/ingredients/:id',async(req,res,next)=>{try{if(needDb(res))return;const w=wid(req),b=req.body,{rows}=await pool.query('UPDATE ingredients SET name=$1,unit=$2,min_stock=$3,ideal_stock=$4 WHERE id=$5 AND workspace_id=$6 RETURNING *',[b.name,b.unit||'g',b.min_stock||0,b.ideal_stock||null,+req.params.id,w]);if(!rows[0])return res.status(404).json({error:'Ingrediente não encontrado'});res.json(rows[0])}catch(e){next(e)}});

  async function saveComponent(req,res,next,id=null){try{
    if(needDb(res))return;const w=wid(req),b=req.body,c=await pool.connect();
    try{
      await c.query('BEGIN');let row;
      if(id){row=(await c.query('UPDATE components SET name=$1,component_group=$2,reference_weight=$3,is_demo=FALSE WHERE id=$4 AND workspace_id=$5 RETURNING *',[b.name,b.component_group,b.reference_weight||0,id,w])).rows[0];if(!row){await c.query('ROLLBACK');return res.status(404).json({error:'Componente não encontrado'})}}
      else{row=(await c.query('INSERT INTO components(workspace_id,name,component_group,reference_weight,is_demo) VALUES($1,$2,$3,$4,FALSE) RETURNING *',[w,b.name,b.component_group,b.reference_weight||0])).rows[0];id=row.id}
      await c.query('DELETE FROM component_ingredients WHERE component_id=$1 AND workspace_id=$2',[id,w]);
      for(const r of b.recipe||[]){const own=await c.query('SELECT 1 FROM ingredients WHERE id=$1 AND workspace_id=$2',[r.ingredient_id,w]);if(!own.rows[0])throw new Error('Ingrediente inválido para este workspace');await c.query('INSERT INTO component_ingredients(workspace_id,component_id,ingredient_id,quantity) VALUES($1,$2,$3,$4)',[w,id,r.ingredient_id,r.quantity||0])}
      await c.query('COMMIT');res.json({...row,recipe:b.recipe||[]});
    }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }catch(e){next(e)}}
  app.post('/api/components',(req,res,next)=>saveComponent(req,res,next));
  app.put('/api/components/:id',(req,res,next)=>saveComponent(req,res,next,+req.params.id));

  app.post('/api/stock-movements',async(req,res,next)=>{try{
    if(needDb(res))return;const w=wid(req),b=req.body,id=+b.ingredient_id,type=b.movement_type||'Entrada',qty=Math.abs(+b.quantity||0),cost=+b.cost||0;
    if(!qty)return res.status(400).json({error:'Quantidade inválida'});
    const c=await pool.connect();try{
      await c.query('BEGIN');
      const own=await c.query('SELECT name FROM ingredients WHERE id=$1 AND workspace_id=$2 FOR UPDATE',[id,w]);if(!own.rows[0]){await c.query('ROLLBACK');return res.status(404).json({error:'Ingrediente não encontrado'})}
      await c.query(`UPDATE ingredients SET stock=stock ${type==='Entrada'?'+':'-'} $1 WHERE id=$2 AND workspace_id=$3`,[qty,id,w]);
      const {rows}=await c.query('INSERT INTO stock_movements(workspace_id,ingredient_id,movement_type,quantity,cost,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[w,id,type,qty,cost,b.note||null]);
      if(cost>0)await c.query("INSERT INTO expenses(workspace_id,name,expense_type,value,expense_date) VALUES($1,$2,'Pontual',$3,CURRENT_DATE)",[w,`Reposição de stock — ${own.rows[0].name}`,cost]);
      await c.query('COMMIT');res.json(rows[0]);
    }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }catch(e){next(e)}});

  app.post('/api/expenses',async(req,res,next)=>{try{if(needDb(res))return;const w=wid(req),b=req.body,{rows}=await pool.query('INSERT INTO expenses(workspace_id,name,expense_type,value,expense_date) VALUES($1,$2,$3,$4,$5) RETURNING *',[w,b.name,b.expense_type,b.value,b.expense_date]);res.json(rows[0])}catch(e){next(e)}});
  app.put('/api/expenses/:id',async(req,res,next)=>{try{if(needDb(res))return;const w=wid(req),b=req.body,{rows}=await pool.query('UPDATE expenses SET name=$1,expense_type=$2,value=$3,expense_date=$4 WHERE id=$5 AND workspace_id=$6 RETURNING *',[b.name,b.expense_type,b.value,b.expense_date,+req.params.id,w]);if(!rows[0])return res.status(404).json({error:'Despesa não encontrada'});res.json(rows[0])}catch(e){next(e)}});

  app.delete('/api/:type/:id',async(req,res,next)=>{try{
    if(needDb(res))return;const w=wid(req),id=+req.params.id,type=req.params.type,cfg={products:['products',1],components:['components',1],sizes:['sizes',1],expenses:['expenses',0],clients:['clients',0]}[type];
    if(!cfg)return res.status(404).json({error:'Tipo inválido'});
    if(type==='clients'){const used=await pool.query('SELECT 1 FROM orders WHERE client_id=$1 AND workspace_id=$2 LIMIT 1',[id,w]);if(used.rows[0])return res.status(409).json({error:'Este cliente tem histórico de encomendas e não pode ser apagado.'})}
    const q=cfg[1]?`UPDATE ${cfg[0]} SET active=FALSE WHERE id=$1 AND workspace_id=$2 RETURNING id`:`DELETE FROM ${cfg[0]} WHERE id=$1 AND workspace_id=$2 RETURNING id`;
    const {rows}=await pool.query(q,[id,w]);if(!rows[0])return res.status(404).json({error:'Registo não encontrado'});res.json({ok:true});
  }catch(e){next(e)}});

  app.post('/api/admin/reset-recipes',async(req,res,next)=>{try{
    if(needDb(res))return;const w=wid(req),c=await pool.connect();try{
      await c.query('BEGIN');
      await c.query('DELETE FROM component_ingredients WHERE workspace_id=$1',[w]);
      await c.query('UPDATE components SET reference_weight=0,is_demo=FALSE WHERE workspace_id=$1',[w]);
      await c.query('COMMIT');res.json({ok:true});
    }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }catch(e){next(e)}});
}
