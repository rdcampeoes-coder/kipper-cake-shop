import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, hasDatabase, initDatabase } from './db.js';
import { registerCoreRoutes } from './core-routes.js';
import { registerOrderRoutes } from './order-routes.js';
import { attachCurrentUser, requirePaidAccess } from './access.js';
import { registerBillingRoutes } from './billing-routes.js';

const app=express();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const publicDir=path.resolve(__dirname,'..','public');

// Stripe exige o corpo bruto para validar a assinatura do webhook.
app.use('/api/stripe/webhook',express.raw({type:'application/json'}));
app.use(express.json({limit:'1mb'}));
app.use(express.static(publicDir));

// Resolve a sessão Supabase antes das rotas de conta/faturação e das APIs protegidas.
app.use('/api',attachCurrentUser);
registerBillingRoutes(app);

// A partir daqui, toda a API de negócio exige acesso válido quando o controlo pago estiver ativo.
app.use('/api',requirePaidAccess);
registerCoreRoutes(app,pool,hasDatabase);
registerOrderRoutes(app,pool);

app.get('*',(req,res)=>res.sendFile(path.join(publicDir,'index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Erro interno',detail:process.env.NODE_ENV==='production'?undefined:err.message})});
const port=process.env.PORT||3000;
initDatabase().then(()=>app.listen(port,()=>console.log(`Kipper app em http://localhost:${port}`))).catch(err=>{console.error('DB init falhou',err);process.exit(1)});
