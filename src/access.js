import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const authConfigured = Boolean(supabaseUrl && publishableKey && secretKey);
export const billingConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
export const accessControlEnabled = authConfigured && process.env.ACCESS_CONTROL_ENABLED === 'true';

export const supabaseAdmin = authConfigured
  ? createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

export function publicAuthConfig(){
  return {
    enabled: authConfigured,
    accessControlEnabled,
    url: supabaseUrl || null,
    publishableKey: publishableKey || null
  };
}

export async function resolveUserFromRequest(req){
  if(!authConfigured) return null;
  const header = String(req.headers.authorization || '');
  if(!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if(!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if(error || !data?.user) return null;
  return data.user;
}

export async function ensureProfile(user){
  if(!user || !supabaseAdmin) return null;
  const email = String(user.email || '').toLowerCase();
  const adminEmail = String(process.env.ADMIN_EMAIL || '').toLowerCase();
  const isBootstrapAdmin = adminEmail && email === adminEmail;
  const payload = { id: user.id, email: user.email || null, updated_at: new Date().toISOString() };
  if(isBootstrapAdmin) payload.is_admin = true;
  const { error } = await supabaseAdmin.from('profiles').upsert(payload, { onConflict: 'id' });
  if(error) throw error;
  const { data, error: readError } = await supabaseAdmin.from('profiles').select('*').eq('id', user.id).single();
  if(readError) throw readError;
  return data;
}

export function hasManualAccess(profile){
  if(!profile?.manual_access) return false;
  if(!profile.manual_access_until) return true;
  return new Date(profile.manual_access_until).getTime() > Date.now();
}

export function hasPaidAccess(profile){
  return ['active', 'trialing'].includes(String(profile?.subscription_status || '').toLowerCase());
}

export function profileHasAccess(profile){
  return Boolean(profile?.is_admin || hasManualAccess(profile) || hasPaidAccess(profile));
}

export async function attachCurrentUser(req, res, next){
  try{
    const user = await resolveUserFromRequest(req);
    req.currentUser = user;
    req.currentProfile = user ? await ensureProfile(user) : null;
    next();
  }catch(err){ next(err); }
}

export function requireAuthenticated(req, res, next){
  if(!accessControlEnabled) return next();
  if(!req.currentUser) return res.status(401).json({ error: 'Sessão necessária' });
  next();
}

export function requirePaidAccess(req, res, next){
  if(!accessControlEnabled) return next();
  if(!req.currentUser) return res.status(401).json({ error: 'Sessão necessária' });
  if(!profileHasAccess(req.currentProfile)) return res.status(402).json({ error: 'Subscrição necessária', code: 'subscription_required' });
  next();
}

export function requireAdmin(req, res, next){
  if(!accessControlEnabled) return res.status(503).json({ error: 'Controlo de acesso ainda não está ativo' });
  if(!req.currentUser) return res.status(401).json({ error: 'Sessão necessária' });
  if(!req.currentProfile?.is_admin) return res.status(403).json({ error: 'Acesso de administrador necessário' });
  next();
}
