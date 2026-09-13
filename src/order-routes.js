export function registerOrderRoutes(app,pool){
  const needDb=res=>{if(!pool){res.status(503).json({error:'Base de dados não configurada'});return true}return false};
  const bad=(msg,status=400)=>Object.assign(new Error(msg),{status});

  async function assertOwnedOrderRefs(c,u,b){
    const client=await c.query('SELECT 1 FROM clients WHERE id=$1 AND user_id=$2',[b.client_id,u]);
    if(!client.rows[0])throw bad('Cliente inválido');

    for(const it of b.items||[]){
      if(it.product_id){
        const ok=await c.query('SELECT 1 FROM products WHERE id=$1 AND user_id=$2 AND active=TRUE',[it.product_id,u]);
        if(!ok.rows[0])throw bad('Produto inválido');
      }
      for(const componentId of [it.base_component_id,it.cover_component_id]){
        if(componentId){
          const ok=await c.query('SELECT 1 FROM components WHERE id=$1 AND user_id=$2 AND active=TRUE',[componentId,u]);
          if(!ok.rows[0])throw bad('Componente inválido');
        }
      }
      if(it.size_id){
        const ok=await c.query('SELECT 1 FROM sizes WHERE id=$1 AND user_id=$2 AND active=TRUE',[it.size_id,u]);
        if(!ok.rows[0])throw bad('Tamanho inválido');
      }
    }
  }

  async function saveOrder(req,res,next,id=null){try{
    if(needDb(res))return;
    const u=req.user.id,b=req.body,c=await pool.connect();
    try{
      await c.query('BEGIN');
      await assertOwnedOrderRefs(c,u,b);
      let row;
      if(id){
        const old=await c.query('SELECT stock_applied FROM orders WHERE id=$1 AND user_id=$2',[id,u]);
        if(!old.rows[0])throw bad('Encomenda não encontrada',404);
        if(old.rows[0].stock_applied)throw bad('Encomenda já preparada: edições exigem reconciliação de stock.',409);
        row=(await c.query('UPDATE orders SET client_id=$1,pickup_date=$2,pickup_time=$3,original_total=$4,discount_type=$5,discount_value=$6,final_total=$7 WHERE id=$8 AND user_id=$9 RETURNING *',[b.client_id,b.pickup_date,b.pickup_time||null,b.original_total||0,b.discount_type||'none',b.discount_value||0,b.final_total||0,id,u])).rows[0];
        await c.query('DELETE FROM order_items WHERE order_id=$1',[id]);
      }else{
        row=(await c.query("INSERT INTO orders(user_id,client_id,pickup_date,pickup_time,status,original_total,discount_type,discount_value,final_total,stock_applied) VALUES($1,$2,$3,$4,'Registada',$5,$6,$7,$8,FALSE) RETURNING *",[u,b.client_id,b.pickup_date,b.pickup_time||null,b.original_total||0,b.discount_type||'none',b.discount_value||0,b.final_total||0])).rows[0];
        id=row.id;
      }
      for(const it of b.items||[])await c.query('INSERT INTO order_items(order_id,item_type,product_id,base_component_id,cover_component_id,size_id,quantity,unit_price,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,it.item_type,it.product_id||null,it.base_component_id||null,it.cover_component_id||null,it.size_id||null,it.quantity||1,it.unit_price||0,JSON.stringify(it.snapshot||{})]);
      await c.query('COMMIT');
      res.json(row);
    }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }catch(e){next(e)}}

  app.post('/api/orders',(req,res,next)=>saveOrder(req,res,next));
  app.put('/api/orders/:id',(req,res,next)=>saveOrder(req,res,next,+req.params.id));

  app.post('/api/orders/:id/prepare',async(req,res,next)=>{try{if(needDb(res))return;const u=req.user.id,id=+req.params.id,actual=req.body.actual||[],apply=req.body.apply_stock!==false,c=await pool.connect();try{await c.query('BEGIN');const old=await c.query('SELECT stock_applied FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,u]);if(!old.rows[0])throw bad('Encomenda não encontrada',404);if(old.rows[0].stock_applied)throw bad('O stock desta encomenda já foi aplicado.',409);await c.query('DELETE FROM order_consumption WHERE order_id=$1',[id]);for(const r of actual){const ing=await c.query('SELECT unit FROM ingredients WHERE id=$1 AND user_id=$2',[r.ingredient_id,u]);if(!ing.rows[0])throw bad('Ingrediente inválido');const qty=Math.max(0,Number(r.quantity)||0);const predicted=Math.max(0,Number(r.predicted_qty??r.quantity)||0);await c.query('INSERT INTO order_consumption(order_id,ingredient_id,predicted_qty,actual_qty,unit) VALUES($1,$2,$3,$4,$5)',[id,r.ingredient_id,predicted,qty,ing.rows[0].unit||'g']);if(apply&&qty>0){await c.query('UPDATE ingredients SET stock=stock-$1 WHERE id=$2 AND user_id=$3',[qty,r.ingredient_id,u]);await c.query("INSERT INTO stock_movements(user_id,ingredient_id,movement_type,quantity,note,order_id) VALUES($1,$2,'Saída',$3,$4,$5)",[u,r.ingredient_id,qty,`Encomenda ${id}`,id])}}const {rows}=await c.query("UPDATE orders SET status='Aguarda recolha',stock_applied=$2 WHERE id=$1 AND user_id=$3 RETURNING *",[id,apply,u]);await c.query('COMMIT');res.json(rows[0])}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}catch(e){next(e)}});
  app.post('/api/orders/:id/collect',async(req,res,next)=>{try{if(needDb(res))return;const {rows}=await pool.query("UPDATE orders SET status='Concluída' WHERE id=$1 AND user_id=$2 RETURNING *",[+req.params.id,req.user.id]);if(!rows[0])return res.status(404).json({error:'Encomenda não encontrada'});res.json(rows[0])}catch(e){next(e)}});
  app.post('/api/orders/:id/cancel',async(req,res,next)=>{try{if(needDb(res))return;const u=req.user.id,id=+req.params.id,restore=!!req.body.restore_stock,c=await pool.connect();try{await c.query('BEGIN');const own=await c.query('SELECT 1 FROM orders WHERE id=$1 AND user_id=$2',[id,u]);if(!own.rows[0])throw bad('Encomenda não encontrada',404);if(restore){const cons=await c.query('SELECT ingredient_id,actual_qty FROM order_consumption WHERE order_id=$1',[id]);for(const r of cons.rows){const qty=Math.max(0,Number(r.actual_qty)||0);if(!qty)continue;await c.query('UPDATE ingredients SET stock=stock+$1 WHERE id=$2 AND user_id=$3',[qty,r.ingredient_id,u]);await c.query("INSERT INTO stock_movements(user_id,ingredient_id,movement_type,quantity,note,order_id) VALUES($1,$2,'Entrada',$3,'Reposição por cancelamento',$4)",[u,r.ingredient_id,qty,id])}}const {rows}=await c.query("UPDATE orders SET status='Cancelada' WHERE id=$1 AND user_id=$2 RETURNING *",[id,u]);await c.query('COMMIT');res.json(rows[0])}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}catch(e){next(e)}});
}
