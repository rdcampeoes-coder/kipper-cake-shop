import express from 'express';

const activeStatuses=new Set(['active','trialing']);

async function fetchSupabaseUser(token){
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) throw new Error('Supabase não configurado');
  const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${token}`}});
  if(!r.ok)return null;
  return r.json();
}

export function authMiddleware(pool){
  return async(req,res,next)=>{
    try{
      const header=req.headers.authorization||'';
      const token=header.startsWith('Bearer ')?header.slice(7):'';
      if(!token)return res.status(401).json({error:'Sessão necessária'});
      const user=await fetchSupabaseUser(token);
      if(!user?.id)return res.status(401).json({error:'Sessão inválida ou expirada'});
      req.user={id:user.id,email:user.email||''};
      if(pool){
        await pool.query(`INSERT INTO app_users(user_id,email) VALUES($1,$2)
          ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,updated_at=NOW()`,[user.id,user.email||'']);
      }
      next();
    }catch(e){next(e)}
  };
}

export function requirePaidAccess(pool){
  return async(req,res,next)=>{
    try{
      if(!pool)return res.status(503).json({error:'Base de dados não configurada'});
      const {rows}=await pool.query('SELECT subscription_status,free_access FROM app_users WHERE user_id=$1',[req.user.id]);
      const row=rows[0];
      if(row&&(row.free_access||activeStatuses.has(row.subscription_status)))return next();
      return res.status(402).json({error:'Subscrição necessária',code:'SUBSCRIPTION_REQUIRED'});
    }catch(e){next(e)}
  };
}

export function registerBillingRoutes(app,pool,stripe){
  const auth=authMiddleware(pool);

  app.get('/api/auth/config',(req,res)=>res.json({
    supabaseUrl:process.env.SUPABASE_URL||'',
    supabasePublishableKey:process.env.SUPABASE_PUBLISHABLE_KEY||'',
    priceLabel:process.env.STRIPE_PRICE_LABEL||'15 €/mês'
  }));

  app.get('/api/account',auth,async(req,res,next)=>{try{
    const {rows}=await pool.query('SELECT email,subscription_status,free_access,stripe_customer_id,stripe_subscription_id FROM app_users WHERE user_id=$1',[req.user.id]);
    const a=rows[0]||{};
    res.json({email:req.user.email,status:a.subscription_status||'inactive',freeAccess:!!a.free_access,hasAccess:!!a.free_access||activeStatuses.has(a.subscription_status),hasStripeCustomer:!!a.stripe_customer_id});
  }catch(e){next(e)}});

  app.post('/api/billing/checkout',auth,async(req,res,next)=>{try{
    if(!stripe)return res.status(503).json({error:'Stripe não configurado'});
    const price=process.env.STRIPE_PRICE_ID;
    if(!price)return res.status(500).json({error:'STRIPE_PRICE_ID não configurado'});
    let {rows}=await pool.query('SELECT stripe_customer_id FROM app_users WHERE user_id=$1',[req.user.id]);
    let customerId=rows[0]?.stripe_customer_id;
    if(!customerId){
      const customer=await stripe.customers.create({email:req.user.email||undefined,metadata:{user_id:req.user.id}});
      customerId=customer.id;
      await pool.query('UPDATE app_users SET stripe_customer_id=$1,updated_at=NOW() WHERE user_id=$2',[customerId,req.user.id]);
    }
    const origin=`${req.protocol}://${req.get('host')}`;
    const session=await stripe.checkout.sessions.create({
      mode:'subscription',customer:customerId,client_reference_id:req.user.id,
      line_items:[{price,quantity:1}],
      success_url:`${origin}/?billing=success`,cancel_url:`${origin}/?billing=cancel`,
      metadata:{user_id:req.user.id},subscription_data:{metadata:{user_id:req.user.id}},
      allow_promotion_codes:true
    });
    res.json({url:session.url});
  }catch(e){next(e)}});

  app.post('/api/billing/portal',auth,async(req,res,next)=>{try{
    if(!stripe)return res.status(503).json({error:'Stripe não configurado'});
    const {rows}=await pool.query('SELECT stripe_customer_id FROM app_users WHERE user_id=$1',[req.user.id]);
    const customer=rows[0]?.stripe_customer_id;
    if(!customer)return res.status(400).json({error:'Ainda não existe uma subscrição Stripe para esta conta'});
    const origin=`${req.protocol}://${req.get('host')}`;
    const session=await stripe.billingPortal.sessions.create({customer,return_url:origin});
    res.json({url:session.url});
  }catch(e){next(e)}});

  app.post('/api/admin/free-access',auth,async(req,res,next)=>{try{
    if(!process.env.ADMIN_EMAIL||req.user.email.toLowerCase()!==process.env.ADMIN_EMAIL.toLowerCase())return res.status(403).json({error:'Sem permissão'});
    const email=String(req.body.email||'').trim().toLowerCase();
    const enabled=req.body.enabled!==false;
    if(!email)return res.status(400).json({error:'Email obrigatório'});
    const {rows}=await pool.query('UPDATE app_users SET free_access=$1,updated_at=NOW() WHERE lower(email)=$2 RETURNING email,free_access',[enabled,email]);
    if(!rows[0])return res.status(404).json({error:'Utilizador ainda não criou conta'});
    res.json(rows[0]);
  }catch(e){next(e)}});
}

export function registerStripeWebhook(app,pool,stripe){
  app.post('/api/stripe/webhook',express.raw({type:'application/json'}),async(req,res)=>{
    try{
      if(!stripe||!process.env.STRIPE_WEBHOOK_SECRET)return res.status(503).send('Stripe webhook não configurado');
      const event=stripe.webhooks.constructEvent(req.body,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET);
      const obj=event.data.object;
      if(event.type==='checkout.session.completed'){
        const userId=obj.client_reference_id||obj.metadata?.user_id;
        if(userId)await pool.query('UPDATE app_users SET stripe_customer_id=COALESCE($1,stripe_customer_id),stripe_subscription_id=COALESCE($2,stripe_subscription_id),updated_at=NOW() WHERE user_id=$3',[obj.customer||null,obj.subscription||null,userId]);
      }
      if(event.type.startsWith('customer.subscription.')){
        const userId=obj.metadata?.user_id;
        const params=[obj.status||'inactive',obj.customer||null,obj.id||null];
        if(userId)await pool.query('UPDATE app_users SET subscription_status=$1,stripe_customer_id=COALESCE($2,stripe_customer_id),stripe_subscription_id=COALESCE($3,stripe_subscription_id),updated_at=NOW() WHERE user_id=$4',[...params,userId]);
        else if(obj.customer)await pool.query('UPDATE app_users SET subscription_status=$1,stripe_subscription_id=COALESCE($3,stripe_subscription_id),updated_at=NOW() WHERE stripe_customer_id=$2',params);
      }
      if(event.type==='invoice.payment_failed'&&obj.customer){
        await pool.query("UPDATE app_users SET subscription_status='past_due',updated_at=NOW() WHERE stripe_customer_id=$1",[obj.customer]);
      }
      res.json({received:true});
    }catch(e){console.error('Stripe webhook',e);res.status(400).send(`Webhook Error: ${e.message}`)}
  });
}
