export function registerOrderRoutes(app,pool){
  const needDb=res=>{if(!pool){res.status(503).json({error:'Base de dados não configurada'});return true}return false};
  const wid=req=>req.workspaceId;

  async function saveOrder(req,res,next,id=null){try{
    if(needDb(res))return;const w=wid(req),b=req.body,c=await pool.connect();
    try{
      await c.query('BEGIN');let row;
      const clientOk=await c.query('SELECT 1 FROM clients WHERE id=$1 AND workspace_id=$2',[b.client_id,w]);
      if(!clientOk.rows[0]){await c.query('ROLLBACK');return res.status(400).json({error:'Cliente inválido para este workspace'})}

      if(id){
        const old=await c.query('SELECT stock_applied FROM orders WHERE id=$1 AND workspace_id=$2 FOR UPDATE',[id,w]);
        if(!old.rows[0]){await c.query('ROLLBACK');return res.status(404).json({error:'Encomenda não encontrada'})}
        if(old.rows[0].stock_applied){await c.query('ROLLBACK');return res.status(409).json({error:'Encomenda já preparada: edições exigem reconciliação de stock.'})}
        row=(await c.query('UPDATE orders SET client_id=$1,pickup_date=$2,pickup_time=$3,original_total=$4,discount_type=$5,discount_value=$6,final_total=$7 WHERE id=$8 AND workspace_id=$9 RETURNING *',[b.client_id,b.pickup_date,b.pickup_time||null,b.original_total||0,b.discount_type||'none',b.discount_value||0,b.final_total||0,id,w])).rows[0];
        await c.query('DELETE FROM order_items WHERE order_id=$1 AND workspace_id=$2',[id,w]);
      }else{
        row=(await c.query("INSERT INTO orders(workspace_id,client_id,pickup_date,pickup_time,status,original_total,discount_type,discount_value,final_total,stock_applied) VALUES($1,$2,$3,$4,'Registada',$5,$6,$7,$8,FALSE) RETURNING *",[w,b.client_id,b.pickup_date,b.pickup_time||null,b.original_total||0,b.discount_type||'none',b.discount_value||0,b.final_total||0])).rows[0];
        id=row.id;
      }

      for(const it of b.items||[]){
        if(it.product_id){const own=await c.query('SELECT 1 FROM products WHERE id=$1 AND workspace_id=$2',[it.product_id,w]);if(!own.rows[0])throw new Error('Produto inválido para este workspace')}
        if(it.base_component_id){const own=await c.query('SELECT 1 FROM components WHERE id=$1 AND workspace_id=$2',[it.base_component_id,w]);if(!own.rows[0])throw new Error('Componente base inválido para este workspace')}
        if(it.cover_component_id){const own=await c.query('SELECT 1 FROM components WHERE id=$1 AND workspace_id=$2',[it.cover_component_id,w]);if(!own.rows[0])throw new Error('Cobertura inválida para este workspace')}
        if(it.size_id){const own=await c.query('SELECT 1 FROM sizes WHERE id=$1 AND workspace_id=$2',[it.size_id,w]);if(!own.rows[0])throw new Error('Tamanho inválido para este workspace')}
        await c.query('INSERT INTO order_items(workspace_id,order_id,item_type,product_id,base_component_id,cover_component_id,size_id,quantity,unit_price,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[w,id,it.item_type,it.product_id||null,it.base_component_id||null,it.cover_component_id||null,it.size_id||null,it.quantity||1,it.unit_price||0,JSON.stringify(it.snapshot||{})]);
      }
      await c.query('COMMIT');res.json(row);
    }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }catch(e){next(e)}}

  app.post('/api/orders',(req,res,next)=>saveOrder(req,res,next));
  app.put('/api/orders/:id',(req,res,next)=>saveOrder(req,res,next,+req.params.id));

  app.post('/api/orders/:id/prepare',async(req,res,next)=>{try{
    if(needDb(res))return;const w=wid(req),id=+req.params.id,actual=req.body.actual||[],apply=req.body.apply_stock!==false,c=await pool.connect();
    try{
      await c.query('BEGIN');
      const old=await c.query('SELECT stock_applied FROM orders WHERE id=$1 AND workspace_id=$2 FOR UPDATE',[id,w]);
      if(!old.rows[0]){await c.query('ROLLBACK');return res.status(404).json({error:'Encomenda não encontrada'})}
      if(old.rows[0].stock_applied){await c.query('ROLLBACK');return res.status(409).json({error:'O stock desta encomenda já foi aplicado.'})}
      await c.query('DELETE FROM order_consumption WHERE order_id=$1 AND workspace_id=$2',[id,w]);
      for(const r of actual){
        const ing=await c.query('SELECT unit FROM ingredients WHERE id=$1 AND workspace_id=$2',[r.ingredient_id,w]);
        if(!ing.rows[0])throw new Error('Ingrediente inválido para este workspace');
        await c.query('INSERT INTO order_consumption(workspace_id,order_id,ingredient_id,predicted_qty,actual_qty,unit) VALUES($1,$2,$3,$4,$5,$6)',[w,id,r.ingredient_id,r.predicted_qty??r.quantity,r.quantity,ing.rows[0].unit||'g']);
        if(apply){
          await c.query('UPDATE ingredients SET stock=stock-$1 WHERE id=$2 AND workspace_id=$3',[r.quantity,r.ingredient_id,w]);
          await c.query("INSERT INTO stock_movements(workspace_id,ingredient_id,movement_type,quantity,note,order_id) VALUES($1,$2,'Saída',$3,$4,$5)",[w,r.ingredient_id,r.quantity,`Encomenda ${id}`,id]);
        }
      }
      const {rows}=await c.query("UPDATE orders SET status='Aguarda recolha',stock_applied=$2 WHERE id=$1 AND workspace_id=$3 RETURNING *",[id,apply,w]);
      await c.query('COMMIT');res.json(rows[0]);
    }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }catch(e){next(e)}});

  app.post('/api/orders/:id/collect',async(req,res,next)=>{try{
    if(needDb(res))return;const w=wid(req),{rows}=await pool.query("UPDATE orders SET status='Concluída' WHERE id=$1 AND workspace_id=$2 RETURNING *",[+req.params.id,w]);
    if(!rows[0])return res.status(404).json({error:'Encomenda não encontrada'});res.json(rows[0]);
  }catch(e){next(e)}});

  app.post('/api/orders/:id/cancel',async(req,res,next)=>{try{
    if(needDb(res))return;const w=wid(req),id=+req.params.id,restore=!!req.body.restore_stock,c=await pool.connect();
    try{
      await c.query('BEGIN');
      const own=await c.query('SELECT 1 FROM orders WHERE id=$1 AND workspace_id=$2 FOR UPDATE',[id,w]);
      if(!own.rows[0]){await c.query('ROLLBACK');return res.status(404).json({error:'Encomenda não encontrada'})}
      if(restore){
        const cons=await c.query('SELECT ingredient_id,actual_qty FROM order_consumption WHERE order_id=$1 AND workspace_id=$2',[id,w]);
        for(const r of cons.rows){
          await c.query('UPDATE ingredients SET stock=stock+$1 WHERE id=$2 AND workspace_id=$3',[r.actual_qty,r.ingredient_id,w]);
          await c.query("INSERT INTO stock_movements(workspace_id,ingredient_id,movement_type,quantity,note,order_id) VALUES($1,$2,'Entrada',$3,'Reposição por cancelamento',$4)",[w,r.ingredient_id,r.actual_qty,id]);
        }
      }
      const {rows}=await c.query("UPDATE orders SET status='Cancelada' WHERE id=$1 AND workspace_id=$2 RETURNING *",[id,w]);
      await c.query('COMMIT');res.json(rows[0]);
    }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }catch(e){next(e)}});
}
