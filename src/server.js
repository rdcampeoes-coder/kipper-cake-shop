import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, hasDatabase, initDatabase } from './db.js';
import { registerCoreRoutes } from './core-routes.js';
import { registerOrderRoutes } from './order-routes.js';

const app=express();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const publicDir=path.resolve(__dirname,'..','public');
app.use(express.json({limit:'1mb'}));
app.use(express.static(publicDir));
registerCoreRoutes(app,pool,hasDatabase);
registerOrderRoutes(app,pool);
app.get('*',(req,res)=>res.sendFile(path.join(publicDir,'index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Erro interno',detail:process.env.NODE_ENV==='production'?undefined:err.message})});
const port=process.env.PORT||3000;
initDatabase().then(()=>app.listen(port,()=>console.log(`Kipper app em http://localhost:${port}`))).catch(err=>{console.error('DB init falhou',err);process.exit(1)});
