import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export const hasDatabase = Boolean(process.env.DATABASE_URL);
export const pool = hasDatabase ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : false
}) : null;

export async function initDatabase(){
  if(!pool) return false;
  const schema=fs.readFileSync(path.join(rootDir,'sql','schema.sql'),'utf8');
  await pool.query(schema);
  const {rows} = await pool.query("SELECT COUNT(*)::int AS n FROM products");
  if(rows[0].n===0){
    const seed=fs.readFileSync(path.join(rootDir,'sql','seed.sql'),'utf8');
    await pool.query(seed);
    await seedComponents();
  }
  return true;
}

async function idByName(table, name){
  const {rows}=await pool.query(`SELECT id FROM ${table} WHERE name=$1 LIMIT 1`,[name]);
  return rows[0]?.id;
}

async function createComponent(name, group, referenceWeight, isDemo, recipe){
  const existing=await pool.query("SELECT id FROM components WHERE name=$1 LIMIT 1",[name]);
  let id=existing.rows[0]?.id;
  if(!id){
    const r=await pool.query("INSERT INTO components(name,component_group,reference_weight,is_demo) VALUES($1,$2,$3,$4) RETURNING id",[name,group,referenceWeight,isDemo]);
    id=r.rows[0].id;
  }
  for(const [ingredientName, qty] of recipe){
    const ing=await idByName('ingredients',ingredientName);
    if(ing) await pool.query("INSERT INTO component_ingredients(component_id,ingredient_id,quantity) VALUES($1,$2,$3) ON CONFLICT(component_id,ingredient_id) DO UPDATE SET quantity=EXCLUDED.quantity",[id,ing,qty]);
  }
}

async function seedComponents(){
  // Receita real fornecida. Os ovos são guardados por peso (200 g) para o cálculo percentual.
  await createComponent('Bolo de Cenoura','Massa',1217,false,[
    ['Cenoura',250],['Ovos',200],['Óleo vegetal',180],['Açúcar',330],['Farinha de trigo',240],['Fermento em pó',14],['Sal',3]
  ]);
  await createComponent('Cobertura de Chocolate','Cobertura',695,false,[
    ['Leite condensado',395],['Creme de leite UHT',100],['Chocolate meio amargo',200]
  ]);

  // Valores provisórios para simulação. Podem ser editados ou limpos pelo reset de receitas.
  await createComponent('Bolo de Chocolate','Massa',1196,true,[
    ['Farinha de trigo',300],['Açúcar',280],['Ovos',200],['Chocolate em pó',70],['Manteiga',120],['Natas',180],['Fermento em pó',12],['Sal',4],['Essência de baunilha',30]
  ]);
  await createComponent('Bolo de Baunilha','Massa',1156,true,[
    ['Farinha de trigo',320],['Açúcar',260],['Ovos',200],['Manteiga',150],['Natas',180],['Fermento em pó',12],['Essência de baunilha',30],['Sal',4]
  ]);
  await createComponent('Bento Cake','Produto',550,true,[
    ['Farinha de trigo',150],['Açúcar',130],['Ovos',100],['Manteiga',70],['Leite',80],['Fermento em pó',8],['Essência de baunilha',8],['Sal',4]
  ]);
  await createComponent('Mini Cake','Produto',900,true,[
    ['Farinha de trigo',250],['Açúcar',220],['Ovos',150],['Manteiga',120],['Leite',130],['Fermento em pó',12],['Essência de baunilha',14],['Sal',4]
  ]);
  await createComponent('Cupcakes','Produto',720,true,[
    ['Farinha de trigo',200],['Açúcar',180],['Ovos',150],['Manteiga',100],['Leite',70],['Fermento em pó',10],['Essência de baunilha',8],['Sal',2]
  ]);
  await createComponent('Bem Casado','Produto',640,true,[
    ['Farinha de trigo',180],['Açúcar',160],['Ovos',150],['Manteiga',60],['Leite',70],['Fermento em pó',8],['Essência de baunilha',10],['Sal',2]
  ]);
  await createComponent('Brigadeiro Tradicional 20g','Produto',520,true,[
    ['Leite condensado',395],['Chocolate em pó',70],['Manteiga',20],['Creme de leite UHT',35]
  ]);
  await createComponent('Brigadeiro Festa 15g','Produto',510,true,[
    ['Leite condensado',395],['Chocolate em pó',60],['Manteiga',20],['Creme de leite UHT',35]
  ]);
  await createComponent('Cheesecake','Produto',1550,true,[
    ['Queijo creme',600],['Natas',300],['Açúcar',180],['Ovos',150],['Bolacha digestiva',200],['Manteiga',100],['Essência de baunilha',20]
  ]);
  await createComponent('Pudim','Produto',1295,true,[
    ['Leite condensado',395],['Leite',600],['Ovos',200],['Açúcar',100]
  ]);
  await createComponent('Brigadeiro Brûlée','Cobertura',560,true,[
    ['Leite condensado',395],['Creme de leite UHT',100],['Manteiga',20],['Açúcar',45]
  ]);
  await createComponent('Nido com Nutella','Cobertura',635,true,[
    ['Leite condensado',395],['Creme de leite UHT',100],['Manteiga',20],['Creme de avelã',120]
  ]);
  await createComponent('Doce de leite e paçoca','Cobertura',620,true,[
    ['Doce de leite',400],['Creme de leite UHT',100],['Amendoim',100],['Manteiga',20]
  ]);
  await createComponent('Pistácio e frutos vermelhos','Cobertura',650,true,[
    ['Creme de leite UHT',220],['Pistácio',130],['Frutos vermelhos',180],['Leite condensado',120]
  ]);
}
