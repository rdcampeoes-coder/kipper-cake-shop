import Stripe from 'stripe';
import { billingConfigured, authConfigured, accessControlEnabled, requireAuthenticated, requireAdmin, supabaseAdmin } from './access.js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const appUrl = () => String(process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');

async function updateProfileByCustomer(customerId, patch){
  if(!supabaseAdmin || !customerId) return;
  const { error } = await supabaseAdmin.from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('stripe_customer_id', customerId);
  if(error) throw error;
}

async function updateProfileForUser(userId, patch){
  if(!supabaseAdmin || !userId) return;
  const { error } = await supabaseAdmin.from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', userId);
  if(error) throw error;
}

async function getOrCreateCustomer(req){
  const profile = req.currentProfile;
  if(profile?.stripe_customer_id) return profile.stripe_customer_id;
  const customer = await stripe.customers.create({
    email: req.currentUser.email || undefined,
    metadata: { supabase_user_id: req.currentUser.id }
  });
  await updateProfileForUser(req.currentUser.id, { stripe_customer_id: customer.id });
  return customer.id;
}

export function registerBillingRoutes(app){
  app.get('/api/auth/config', (req, res) => {
    res.json({
      authConfigured,
      billingConfigured,
      accessControlEnabled,
      supabaseUrl: process.env.SUPABASE_URL || null,
      supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || null,
      priceLabel: process.env.STRIPE_PRICE_LABEL || 'Plano mensal'
    });
  });

  app.get('/api/account', requireAuthenticated, async (req, res) => {
    res.json({
      user: req.currentUser ? { id: req.currentUser.id, email: req.currentUser.email } : null,
      profile: req.currentProfile || null,
      billingConfigured,
      accessControlEnabled
    });
  });

  app.post('/api/billing/checkout', requireAuthenticated, async (req, res, next) => {
    try{
      if(!billingConfigured || !stripe) return res.status(503).json({ error: 'Stripe ainda não está configurado' });
      const customerId = await getOrCreateCustomer(req);
      const baseUrl = appUrl();
      if(!baseUrl) return res.status(503).json({ error: 'APP_URL não configurado' });
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: `${baseUrl}/?billing=success`,
        cancel_url: `${baseUrl}/?billing=cancelled`,
        subscription_data: { metadata: { supabase_user_id: req.currentUser.id } },
        allow_promotion_codes: true
      });
      res.json({ url: session.url });
    }catch(err){ next(err); }
  });

  app.post('/api/billing/portal', requireAuthenticated, async (req, res, next) => {
    try{
      if(!stripe || !req.currentProfile?.stripe_customer_id) return res.status(400).json({ error: 'Cliente Stripe ainda não criado' });
      const baseUrl = appUrl();
      if(!baseUrl) return res.status(503).json({ error: 'APP_URL não configurado' });
      const session = await stripe.billingPortal.sessions.create({
        customer: req.currentProfile.stripe_customer_id,
        return_url: baseUrl
      });
      res.json({ url: session.url });
    }catch(err){ next(err); }
  });

  app.get('/api/admin/users', requireAdmin, async (req, res, next) => {
    try{
      const { data, error } = await supabaseAdmin.from('profiles').select('*').order('created_at', { ascending: false });
      if(error) throw error;
      res.json(data || []);
    }catch(err){ next(err); }
  });

  app.put('/api/admin/users/:id/access', requireAdmin, async (req, res, next) => {
    try{
      const patch = {
        manual_access: Boolean(req.body.manual_access),
        manual_access_until: req.body.manual_access_until || null,
        updated_at: new Date().toISOString()
      };
      if(typeof req.body.is_admin === 'boolean') patch.is_admin = req.body.is_admin;
      const { data, error } = await supabaseAdmin.from('profiles').update(patch).eq('id', req.params.id).select('*').single();
      if(error) throw error;
      res.json(data);
    }catch(err){ next(err); }
  });

  app.post('/api/stripe/webhook', async (req, res, next) => {
    try{
      if(!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send('Webhook não configurado');
      const signature = req.headers['stripe-signature'];
      let event;
      try{
        event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
      }catch(err){ return res.status(400).send(`Webhook Error: ${err.message}`); }

      if(event.type === 'checkout.session.completed'){
        const session = event.data.object;
        const subscription = session.subscription ? await stripe.subscriptions.retrieve(session.subscription) : null;
        const userId = subscription?.metadata?.supabase_user_id || session.metadata?.supabase_user_id;
        if(userId) await updateProfileForUser(userId, {
          stripe_customer_id: String(session.customer || ''),
          stripe_subscription_id: subscription?.id || null,
          subscription_status: subscription?.status || 'active',
          plan: process.env.STRIPE_PRICE_LABEL || 'Mensal',
          current_period_end: subscription?.items?.data?.[0]?.current_period_end ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString() : null
        });
      }

      if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)){
        const subscription = event.data.object;
        await updateProfileByCustomer(String(subscription.customer || ''), {
          stripe_subscription_id: subscription.id,
          subscription_status: subscription.status,
          plan: process.env.STRIPE_PRICE_LABEL || 'Mensal',
          current_period_end: subscription.items?.data?.[0]?.current_period_end ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString() : null
        });
      }

      if(event.type === 'invoice.payment_failed'){
        const invoice = event.data.object;
        await updateProfileByCustomer(String(invoice.customer || ''), { subscription_status: 'past_due' });
      }

      res.json({ received: true });
    }catch(err){ next(err); }
  });
}
