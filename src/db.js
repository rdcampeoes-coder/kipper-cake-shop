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
  // O bolo de cenoura tem 1217 g teóricos. Os ovos são guardados como 4 unidades,
  // mas esse peso de referência já inclui a contribuição média de 200 g dos ovos.
  await createComponent('Bolo de Cenoura','Massa',1217,false,[
    ['Cenoura',250],['Ovos',4],['Óleo vegetal',180],['Açúcar',330],['Farinha de trigo',240],['Fermento em pó',14],['Sal',3]
  ]);
  await createComponent('Cobertura de Chocolate','Cobertura',695,false,[
    ['Leite condensado',395],['Creme de leite UHT',100],['Chocolate meio amargo',200]
  ]);
  await createComponent('Bolo de Chocolate','Massa',966,true,[
    ['Farinha de trigo',300],['Açúcar',280],['Ovos',4],['Chocolate em pó',70],['Manteiga',120],['Natas',180],['Fermento em pó',12]
  ]);
  await createComponent('Bolo de Baunilha','Massa',922,true,[
    ['Farinha de trigo',320],['Açúcar',260],['Ovos',4],['Manteiga',150],['Natas',180],['Fermento em pó',12]
  ]);
  await createComponent('Brigadeiro Brûlée','Cobertura',560,true,[
    ['Leite condensado',395],['Creme de leite UHT',100],['Manteiga',20],['Açúcar',45]
  ]);
  await createComponent('Nido com Nutella','Cobertura',635,true,[
    ['Leite condensado',395],['Creme de leite UHT',100],['Manteiga',20],['Chocolate meio amargo',120]
  ]);
}
