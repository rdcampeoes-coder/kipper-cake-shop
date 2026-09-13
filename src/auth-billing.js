import express from 'express';
import { randomBytes } from 'crypto';

const activeStatuses=new Set(['active','trialing']);
const referralAlphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const isAdminEmail=email=>Boolean(process.env.ADMIN_EMAIL&&String(email||'').toLowerCase()===process.env.ADMIN_EMAIL.toLowerCase());

function makeReferralCode(){
  const bytes=randomBytes(5);
  let tail='';
  for(const b of bytes)tail+=referralAlphabet[b%referralAlphabet.length];
  return `KIP${tail}`;
}

async function ensureReferralCode(pool,userId){
  if(!pool||!userId)return null;
  const current=await pool.query('SELECT referral_code FROM app_users WHERE user_id=$1',[userId]);
  if(current.rows[0]?.referral_code)return current.rows[0].referral_code;
  for(let i=0;i<12;i++){
    const code=makeReferralCode();
    try{
      const {rows}=await pool.query(
        'UPDATE app_users SET referral_code=$1 WHERE user_id=$2 AND referral_code IS NULL RETURNING referral_code',
        [code,userId]
      );
      if(rows[0]?.referral_code)return rows[0].referral_code;
      const again=await pool.query('SELECT referral_code FROM app_users WHERE user_id=$1',[userId]);
      if(again.rows[0]?.referral_code)return again.rows[0].referral_code;
    }catch(e){
      if(e?.code!=='23505')throw e;
    }
  }
  throw new Error('Não foi possível gerar um código de referência único');
}

async function attachReferral(pool,userId,code){
  code=String(code||'').trim().toUpperCase();
  if(!pool||!userId||!/^KIP[A-Z0-9]{5}$/.test(code))return;
  await pool.query(`
    UPDATE app_users AS target
    SET referred_by_user_id=source.user_id,updated_at=NOW()
    FROM app_users AS source
    WHERE target.user_id=$1
      AND target.referred_by_user_id IS NULL
      AND source.user_id<>target.user_id
      AND upper(source.referral_code)=$2
  `,[userId,code]);
}

async function syncAccessHistory(pool,userId){
  if(!pool||!userId)return;
  const {rows}=await pool.query(`
    SELECT free_access,subscription_status,blocked,ever_had_access,access_ended_at,last_access_type
    FROM app_users WHERE user_id=$1
  `,[userId]);
  const row=rows[0];
  if(!row)return;
  const effective=!row.blocked&&(row.free_access||activeStatuses.has(row.subscription_status));
  if(effective){
    await pool.query(`
      UPDATE app_users
      SET ever_had_access=TRUE,
          last_access_type=CASE
            WHEN free_access AND subscription_status IN ('active','trialing') THEN 'Subscrição paga + grátis'
            WHEN free_access THEN 'Acesso grátis'
            ELSE 'Subscrição paga'
          END,
          access_first_at=COALESCE(access_first_at,NOW()),
          access_last_started_at=CASE
            WHEN ever_had_access=FALSE OR access_ended_at IS NOT NULL
              THEN NOW()
            ELSE COALESCE(access_last_started_at,access_first_at,NOW())
          END,
          access_ended_at=NULL,
          updated_at=NOW()
      WHERE user_id=$1
    `,[userId]);
  }else if(row.ever_had_access&&!row.access_ended_at){
    await pool.query('UPDATE app_users SET access_ended_at=NOW(),updated_at=NOW() WHERE user_id=$1',[userId]);
  }
}

async function recordInvoice(pool,invoice){
  if(!pool||!invoice?.id||invoice.status!=='paid'||Number(invoice.amount_paid||0)<=0)return;
  const customerId=typeof invoice.customer==='string'?invoice.customer:invoice.customer?.id;
  if(!customerId)return;
  const {rows}=await pool.query(
    'SELECT user_id,plan_name FROM app_users WHERE stripe_customer_id=$1 LIMIT 1',
    [customerId]
  );
  const owner=rows[0];
  if(!owner)return;
  const paidAt=invoice.status_transitions?.paid_at
    ?new Date(invoice.status_transitions.paid_at*1000)
    :new Date((invoice.created||Math.floor(Date.now()/1000))*1000);
  await pool.query(`
    INSERT INTO app_payments(invoice_id,stripe_customer_id,user_id,amount,currency,plan_name,paid_at)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(invoice_id) DO UPDATE SET
      stripe_customer_id=EXCLUDED.stripe_customer_id,
      user_id=EXCLUDED.user_id,
      amount=EXCLUDED.amount,
      currency=EXCLUDED.currency,
      plan_name=EXCLUDED.plan_name,
      paid_at=EXCLUDED.paid_at
  `,[
    invoice.id,
    customerId,
    owner.user_id,
    Number(invoice.amount_paid||0)/100,
    String(invoice.currency||'eur').toUpperCase(),
    owner.plan_name||'Premium',
    paidAt
  ]);
}

async function syncPaidInvoices(pool,stripe){
  if(!pool||!stripe)return;
  for await (const invoice of stripe.invoices.list({status:'paid',limit:100})){
    await recordInvoice(pool,invoice);
  }
}

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
      req.user={id:user.id,email:user.email||'',metadata:user.user_metadata||{}};
      if(pool){
        await pool.query(`INSERT INTO app_users(user_id,email) VALUES($1,$2)
          ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,updated_at=NOW()`,[user.id,user.email||'']);
        await ensureReferralCode(pool,user.id);
        await attachReferral(pool,user.id,user.user_metadata?.referral_code);
      }
      next();
    }catch(e){next(e)}
  };
}

export function requirePaidAccess(pool){
  return async(req,res,next)=>{
    try{
      if(isAdminEmail(req.user?.email))return next();
      if(!pool)return res.status(503).json({error:'Base de dados não configurada'});
      const {rows}=await pool.query(
        'SELECT subscription_status,free_access,blocked FROM app_users WHERE user_id=$1',
        [req.user.id]
      );
      const row=rows[0];
      if(row?.blocked)return res.status(403).json({error:'Conta bloqueada pelo administrador',code:'ACCOUNT_BLOCKED'});
      if(row&&(row.free_access||activeStatuses.has(row.subscription_status)))return next();
      return res.status(402).json({error:'Subscrição necessária',code:'SUBSCRIPTION_REQUIRED'});
    }catch(e){next(e)}
  };
}

export function registerBillingRoutes(app,pool,stripe){
  const auth=authMiddleware(pool);
  const requireAdmin=(req,res)=>{
    if(isAdminEmail(req.user?.email))return true;
    res.status(403).json({error:'Sem permissão'});
    return false;
  };

  app.get('/api/auth/config',(req,res)=>res.json({
    supabaseUrl:process.env.SUPABASE_URL||'',
    supabasePublishableKey:process.env.SUPABASE_PUBLISHABLE_KEY||'',
    priceLabel:process.env.STRIPE_PRICE_LABEL||'15 €/mês',
    planName:'Premium'
  }));

  app.get('/api/account',auth,async(req,res,next)=>{try{
    const {rows}=await pool.query(`
      SELECT email,subscription_status,free_access,blocked,plan_name,referral_code,
             stripe_customer_id,stripe_subscription_id
      FROM app_users WHERE user_id=$1
    `,[req.user.id]);
    const a=rows[0]||{};
    const isAdmin=isAdminEmail(req.user.email);
    const blocked=Boolean(a.blocked)&&!isAdmin;
    res.json({
      email:req.user.email,
      status:a.subscription_status||'inactive',
      freeAccess:!!a.free_access,
      blocked,
      planName:a.plan_name||'Premium',
      referralCode:a.referral_code||null,
      hasAccess:isAdmin||(!blocked&&(!!a.free_access||activeStatuses.has(a.subscription_status))),
      hasStripeCustomer:!!a.stripe_customer_id,
      isAdmin
    });
  }catch(e){next(e)}});

  app.post('/api/billing/checkout',auth,async(req,res,next)=>{try{
    if(!stripe)return res.status(503).json({error:'Stripe não configurado'});
    const {rows:accountRows}=await pool.query('SELECT blocked FROM app_users WHERE user_id=$1',[req.user.id]);
    if(accountRows[0]?.blocked)return res.status(403).json({error:'Conta bloqueada pelo administrador',code:'ACCOUNT_BLOCKED'});
    const price=process.env.STRIPE_PRICE_ID;
    if(!price)return res.status(500).json({error:'STRIPE_PRICE_ID não configurado'});
    let {rows}=await pool.query('SELECT stripe_customer_id FROM app_users WHERE user_id=$1',[req.user.id]);
    let customerId=rows[0]?.stripe_customer_id;
    if(!customerId){
      const customer=await stripe.customers.create({email:req.user.email||undefined,metadata:{user_id:req.user.id}});
      customerId=customer.id;
      await pool.query('UPDATE app_users SET stripe_customer_id=$1,plan_name=$2,updated_at=NOW() WHERE user_id=$3',[customerId,'Premium',req.user.id]);
    }
    const origin=`${req.protocol}://${req.get('host')}`;
    const session=await stripe.checkout.sessions.create({
      mode:'subscription',customer:customerId,client_reference_id:req.user.id,
      line_items:[{price,quantity:1}],
      success_url:`${origin}/?billing=success`,cancel_url:`${origin}/?billing=cancel`,
      metadata:{user_id:req.user.id,plan_name:'Premium'},
      subscription_data:{metadata:{user_id:req.user.id,plan_name:'Premium'}},
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

  app.get('/api/admin/accounts',auth,async(req,res,next)=>{try{
    if(!requireAdmin(req,res))return;
    const missing=await pool.query('SELECT user_id FROM app_users WHERE referral_code IS NULL');
    for(const row of missing.rows)await ensureReferralCode(pool,row.user_id);

    const {rows}=await pool.query(`
      SELECT u.user_id,u.email,u.subscription_status,u.free_access,u.blocked,u.plan_name,u.referral_code,
             u.referred_by_user_id,u.ever_had_access,u.access_first_at,u.access_last_started_at,u.access_ended_at,u.last_access_type,
             u.stripe_customer_id,u.stripe_subscription_id,u.created_at,u.updated_at,
             ref.email AS referred_by_email,ref.referral_code AS referred_by_code,
             (SELECT COUNT(*)::int FROM app_users r WHERE r.referred_by_user_id=u.user_id) AS referred_count,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'email',r.email,
                 'status',r.subscription_status,
                 'planName',r.plan_name,
                 'createdAt',r.created_at
               ) ORDER BY r.created_at DESC)
               FROM app_users r WHERE r.referred_by_user_id=u.user_id
             ),'[]'::json) AS referred_accounts
      FROM app_users u
      LEFT JOIN app_users ref ON ref.user_id=u.referred_by_user_id
      ORDER BY u.created_at DESC
    `);

    const accounts=rows.map(row=>{
      const admin=isAdminEmail(row.email);
      const paid=activeStatuses.has(row.subscription_status);
      const free=Boolean(row.free_access);
      const blocked=Boolean(row.blocked)&&!admin;
      const hasAccess=admin||(!blocked&&(free||paid));
      const archived=!admin&&Boolean(row.ever_had_access)&&!hasAccess;
      return {
        userId:row.user_id,
        email:row.email,
        status:row.subscription_status||'inactive',
        freeAccess:free,
        paidAccess:paid,
        blocked,
        hasAccess,
        archived,
        everHadAccess:Boolean(row.ever_had_access),
        isAdmin:admin,
        planName:row.plan_name||'Premium',
        referralCode:row.referral_code,
        referredByEmail:row.referred_by_email||null,
        referredByCode:row.referred_by_code||null,
        referredCount:Number(row.referred_count||0),
        referredAccounts:Array.isArray(row.referred_accounts)?row.referred_accounts:[],
        hasStripeCustomer:Boolean(row.stripe_customer_id),
        hasStripeSubscription:Boolean(row.stripe_subscription_id),
        accessFirstAt:row.access_first_at,
        accessLastStartedAt:row.access_last_started_at,
        accessEndedAt:row.access_ended_at,
        lastAccessType:row.last_access_type||null,
        createdAt:row.created_at,
        updatedAt:row.updated_at
      };
    });
    const customers=accounts.filter(a=>!a.isAdmin);
    res.json({
      summary:{
        total:customers.length,
        active:customers.filter(a=>a.hasAccess).length,
        paid:customers.filter(a=>a.paidAccess).length,
        free:customers.filter(a=>a.freeAccess).length,
        archived:customers.filter(a=>a.archived).length,
        blocked:customers.filter(a=>a.blocked).length
      },
      accounts
    });
  }catch(e){next(e)}});

  app.post('/api/admin/free-access',auth,async(req,res,next)=>{try{
    if(!requireAdmin(req,res))return;
    const userId=String(req.body.userId||'').trim();
    const email=String(req.body.email||'').trim().toLowerCase();
    const enabled=req.body.enabled!==false;
    if(!userId&&!email)return res.status(400).json({error:'Conta obrigatória'});
    const finder=userId
      ?await pool.query('SELECT user_id,email FROM app_users WHERE user_id=$1',[userId])
      :await pool.query('SELECT user_id,email FROM app_users WHERE lower(email)=$1',[email]);
    const target=finder.rows[0];
    if(!target)return res.status(404).json({error:'Conta não encontrada'});
    if(isAdminEmail(target.email)&&!enabled)return res.status(400).json({error:'A conta de gestão mantém sempre acesso administrativo'});
    const {rows}=await pool.query(
      'UPDATE app_users SET free_access=$1,plan_name=$2,updated_at=NOW() WHERE user_id=$3 RETURNING email,free_access,subscription_status',
      [enabled,'Premium',target.user_id]
    );
    await syncAccessHistory(pool,target.user_id);
    res.json(rows[0]);
  }catch(e){next(e)}});

  app.post('/api/admin/block-access',auth,async(req,res,next)=>{try{
    if(!requireAdmin(req,res))return;
    const userId=String(req.body.userId||'').trim();
    const blocked=req.body.blocked!==false;
    if(!userId)return res.status(400).json({error:'Conta obrigatória'});
    const finder=await pool.query('SELECT user_id,email FROM app_users WHERE user_id=$1',[userId]);
    const target=finder.rows[0];
    if(!target)return res.status(404).json({error:'Conta não encontrada'});
    if(isAdminEmail(target.email))return res.status(400).json({error:'A conta de gestão não pode ser bloqueada'});
    await pool.query('UPDATE app_users SET blocked=$1,updated_at=NOW() WHERE user_id=$2',[blocked,userId]);
    await syncAccessHistory(pool,userId);
    res.json({userId,email:target.email,blocked});
  }catch(e){next(e)}});

  app.get('/api/admin/finance',auth,async(req,res,next)=>{try{
    if(!requireAdmin(req,res))return;
    if(stripe){
      try{await syncPaidInvoices(pool,stripe)}catch(e){console.error('Stripe finance sync',e)}
    }
    const {rows}=await pool.query(`
      SELECT p.invoice_id,p.amount,p.currency,p.plan_name,p.paid_at,u.email
      FROM app_payments p
      LEFT JOIN app_users u ON u.user_id=p.user_id
      ORDER BY p.paid_at DESC
    `);
    const now=new Date();
    const monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
    const yearStart=new Date(Date.UTC(now.getUTCFullYear(),0,1));
    const payments=rows.map(r=>({
      invoiceId:r.invoice_id,
      email:r.email||'Conta não identificada',
      amount:Number(r.amount||0),
      currency:r.currency||'EUR',
      planName:r.plan_name||'Premium',
      paidAt:r.paid_at
    }));
    const sum=list=>list.reduce((acc,p)=>acc+p.amount,0);
    const byMonth={};
    const byPlan={};
    for(const p of payments){
      const d=new Date(p.paidAt);
      const key=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
      byMonth[key]=(byMonth[key]||0)+p.amount;
      byPlan[p.planName]=(byPlan[p.planName]||0)+p.amount;
    }
    const access=await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE subscription_status IN ('active','trialing'))::int AS paid_active,
        COUNT(*) FILTER (WHERE free_access=TRUE)::int AS free_active,
        COUNT(*) FILTER (WHERE blocked=TRUE)::int AS blocked
      FROM app_users
      WHERE lower(email)<>lower($1)
    `,[process.env.ADMIN_EMAIL||'']);
    res.json({
      stripeConfigured:Boolean(stripe),
      summary:{
        totalReceived:sum(payments),
        thisMonth:sum(payments.filter(p=>new Date(p.paidAt)>=monthStart)),
        thisYear:sum(payments.filter(p=>new Date(p.paidAt)>=yearStart)),
        paidActive:Number(access.rows[0]?.paid_active||0),
        freeActive:Number(access.rows[0]?.free_active||0),
        blocked:Number(access.rows[0]?.blocked||0)
      },
      byMonth:Object.entries(byMonth).sort(([a],[b])=>b.localeCompare(a)).map(([month,total])=>({month,total})),
      byPlan:Object.entries(byPlan).sort((a,b)=>b[1]-a[1]).map(([plan,total])=>({plan,total})),
      payments:payments.slice(0,200)
    });
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
        if(userId){
          await pool.query(`
            UPDATE app_users
            SET stripe_customer_id=COALESCE($1,stripe_customer_id),
                stripe_subscription_id=COALESCE($2,stripe_subscription_id),
                plan_name=COALESCE(NULLIF($3,''),plan_name),
                updated_at=NOW()
            WHERE user_id=$4
          `,[obj.customer||null,obj.subscription||null,obj.metadata?.plan_name||'Premium',userId]);
        }
      }
      if(event.type.startsWith('customer.subscription.')){
        const userId=obj.metadata?.user_id;
        const planName=obj.metadata?.plan_name||'Premium';
        const params=[obj.status||'inactive',obj.customer||null,obj.id||null,planName];
        let affectedUserId=userId||null;
        if(userId){
          await pool.query(`
            UPDATE app_users
            SET subscription_status=$1,
                stripe_customer_id=COALESCE($2,stripe_customer_id),
                stripe_subscription_id=COALESCE($3,stripe_subscription_id),
                plan_name=$4,
                updated_at=NOW()
            WHERE user_id=$5
          `,[...params,userId]);
        }else if(obj.customer){
          const result=await pool.query(`
            UPDATE app_users
            SET subscription_status=$1,
                stripe_subscription_id=COALESCE($3,stripe_subscription_id),
                plan_name=$4,
                updated_at=NOW()
            WHERE stripe_customer_id=$2
            RETURNING user_id
          `,params);
          affectedUserId=result.rows[0]?.user_id||null;
        }
        if(affectedUserId)await syncAccessHistory(pool,affectedUserId);
      }
      if(event.type==='invoice.paid'){
        await recordInvoice(pool,obj);
      }
      if(event.type==='invoice.payment_failed'&&obj.customer){
        const result=await pool.query(
          "UPDATE app_users SET subscription_status='past_due',updated_at=NOW() WHERE stripe_customer_id=$1 RETURNING user_id",
          [obj.customer]
        );
        if(result.rows[0]?.user_id)await syncAccessHistory(pool,result.rows[0].user_id);
      }
      res.json({received:true});
    }catch(e){console.error('Stripe webhook',e);res.status(400).send(`Webhook Error: ${e.message}`)}
  });
}
