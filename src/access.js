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

async function createWorkspaceForUser(user){
  const { data: workspace, error: workspaceError } = await supabaseAdmin
    .from('workspaces')
    .insert({ name: 'O meu negócio', owner_user_id: user.id })
    .select('id')
    .single();
  if(workspaceError) throw workspaceError;

  const { error: memberError } = await supabaseAdmin
    .from('workspace_members')
    .upsert({ workspace_id: workspace.id, user_id: user.id, role: 'owner' }, { onConflict: 'workspace_id,user_id' });
  if(memberError) throw memberError;

  return workspace.id;
}

export async function ensureProfile(user){
  if(!user || !supabaseAdmin) return null;
  const email = String(user.email || '').toLowerCase();
  const adminEmail = String(process.env.ADMIN_EMAIL || '').toLowerCase();
  const isBootstrapAdmin = Boolean(adminEmail && email === adminEmail);

  let { data: profile, error: readError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if(readError) throw readError;

  if(!profile){
    const workspaceId = await createWorkspaceForUser(user);
    const payload = {
      id: user.id,
      email: user.email || null,
      current_workspace_id: workspaceId,
      is_admin: isBootstrapAdmin,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabaseAdmin.from('profiles').insert(payload).select('*').single();
    if(error) throw error;
    profile = data;
  }else{
    const patch = { email: user.email || null, updated_at: new Date().toISOString() };
    if(isBootstrapAdmin) patch.is_admin = true;
    if(!profile.current_workspace_id) patch.current_workspace_id = await createWorkspaceForUser(user);
    const { data, error } = await supabaseAdmin.from('profiles').update(patch).eq('id', user.id).select('*').single();
    if(error) throw error;
    profile = data;
  }

  if(profile?.current_workspace_id){
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', profile.current_workspace_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if(membershipError) throw membershipError;
    if(!membership) throw new Error('O utilizador não pertence ao workspace selecionado.');
  }

  return profile;
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
    req.workspaceId = req.currentProfile?.current_workspace_id || null;
    next();
  }catch(err){ next(err); }
}

export function requireAuthenticated(req, res, next){
  if(!authConfigured) return res.status(503).json({ error: 'Autenticação ainda não está configurada' });
  if(!req.currentUser) return res.status(401).json({ error: 'Sessão necessária' });
  if(!req.workspaceId) return res.status(403).json({ error: 'Workspace não configurado' });
  next();
}

export function requirePaidAccess(req, res, next){
  if(!accessControlEnabled) return next();
  if(!req.currentUser) return res.status(401).json({ error: 'Sessão necessária' });
  if(!req.workspaceId) return res.status(403).json({ error: 'Workspace não configurado' });
  if(!profileHasAccess(req.currentProfile)) return res.status(402).json({ error: 'Subscrição necessária', code: 'subscription_required' });
  next();
}

export function requireWorkspace(req, res, next){
  if(!accessControlEnabled) return next();
  if(!req.workspaceId) return res.status(403).json({ error: 'Workspace não configurado' });
  next();
}

export function requireAdmin(req, res, next){
  if(!authConfigured) return res.status(503).json({ error: 'Autenticação ainda não está configurada' });
  if(!req.currentUser) return res.status(401).json({ error: 'Sessão necessária' });
  if(!req.currentProfile?.is_admin) return res.status(403).json({ error: 'Acesso de administrador necessário' });
  next();
}
