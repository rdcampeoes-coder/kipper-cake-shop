import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';
import { pool, hasDatabase, initDatabase } from './db.js';
import { registerCoreRoutes } from './core-routes.js';
import { registerOrderRoutes } from './order-routes.js';
import { registerBillingRoutes,registerStripeWebhook,authMiddleware,requirePaidAccess } from './auth-billing.js';
import { seedDemoRecipesForAllUsers } from './demo-recipes.js';

const app=express();
const stripe=process.env.STRIPE_SECRET_KEY?new Stripe(process.env.STRIPE_SECRET_KEY):null;
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const publicDir=path.resolve(__dirname,'..','public');

registerStripeWebhook(app,pool,stripe);
app.use(express.json({limit:'2mb'}));
app.use(express.static(publicDir));
registerBillingRoutes(app,pool,stripe);
app.use('/api',authMiddleware(pool),requirePaidAccess(pool));
registerCoreRoutes(app,pool,hasDatabase);
registerOrderRoutes(app,pool);
app.get('*',(req,res)=>res.sendFile(path.join(publicDir,'index.html')));
app.use((err,req,res,next)=>{
  console.error(err);
  const status=Number(err?.status)||500;
  res.status(status).json({
    error:status>=500?'Erro interno':(err?.message||'Pedido inválido'),
    detail:process.env.NODE_ENV==='production'?undefined:err?.message
  });
});
const port=process.env.PORT||3000;
initDatabase().then(async()=>{await seedDemoRecipesForAllUsers(pool);app.listen(port,()=>console.log(`Kipper app em http://localhost:${port}`))}).catch(err=>{console.error('DB init falhou',err);process.exit(1)});
