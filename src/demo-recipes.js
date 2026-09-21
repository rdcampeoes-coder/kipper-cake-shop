const DEMO_INGREDIENTS = [
  ['Açúcar','g',5000,2000],['Farinha de trigo','g',10000,5000],['Ovos','g',1200,500],
  ['Chocolate meio amargo','g',2000,800],['Leite condensado','g',2370,790],['Creme de leite UHT','g',1200,300],
  ['Cenoura','g',4000,1000],['Óleo vegetal','g',2500,700],['Fermento em pó','g',500,100],['Sal','g',1000,150],
  ['Manteiga','g',1500,500],['Chocolate em pó','g',1200,600],['Natas','ml',2000,600],['Queijo creme','g',1500,500],
  ['Leite','ml',4000,1000],['Essência de baunilha','ml',250,80],['Doce de leite','g',1500,500],['Amendoim','g',1000,300],
  ['Creme de avelã','g',1200,400],['Pistácio','g',700,250],['Frutos vermelhos','g',1200,400],['Bolacha digestiva','g',1200,400]
];

const DEMO_PRODUCTS = [
  ['Bolo Personalizado','Bolos festivos',28,'base'],
  ['Bolo de Chocolate','Bolos',30,'unidade'],['Bolo de Baunilha','Bolos',30,'unidade'],['Bolo de Cenoura','Bolos',28,'unidade'],
  ['Bento Cake','Bolos pequenos',20,'unidade'],['Mini Cake','Bolos pequenos',32,'unidade'],['Cupcakes','Cupcakes',3.5,'unidade'],
  ['Bem Casado','Doces',3,'unidade'],['Brigadeiro Tradicional 20g','Brigadeiros',1.75,'unidade'],
  ['Brigadeiro Festa 15g','Brigadeiros',0.85,'unidade'],['Cheesecake','Cheesecakes',28,'unidade'],['Pudim','Pudins',20,'unidade']
];

const DEMO_SIZES = [['P',650,400],['M',1100,600]];

const DEMO_COMPONENTS = [
  {name:'Bolo de Chocolate',group:'Massa',weight:1196,recipe:[['Farinha de trigo',300],['Açúcar',280],['Ovos',200],['Chocolate em pó',70],['Manteiga',120],['Natas',180],['Fermento em pó',12],['Sal',4],['Essência de baunilha',30]]},
  {name:'Bolo de Baunilha',group:'Massa',weight:1156,recipe:[['Farinha de trigo',320],['Açúcar',260],['Ovos',200],['Manteiga',150],['Natas',180],['Fermento em pó',12],['Essência de baunilha',30],['Sal',4]]},
  {name:'Bento Cake',group:'Produto',weight:550,recipe:[['Farinha de trigo',150],['Açúcar',130],['Ovos',100],['Manteiga',70],['Leite',80],['Fermento em pó',8],['Essência de baunilha',8],['Sal',4]]},
  {name:'Mini Cake',group:'Produto',weight:900,recipe:[['Farinha de trigo',250],['Açúcar',220],['Ovos',150],['Manteiga',120],['Leite',130],['Fermento em pó',12],['Essência de baunilha',14],['Sal',4]]},
  {name:'Cupcakes',group:'Produto',weight:720,recipe:[['Farinha de trigo',200],['Açúcar',180],['Ovos',150],['Manteiga',100],['Leite',70],['Fermento em pó',10],['Essência de baunilha',8],['Sal',2]]},
  {name:'Bem Casado',group:'Produto',weight:640,recipe:[['Farinha de trigo',180],['Açúcar',160],['Ovos',150],['Manteiga',60],['Leite',70],['Fermento em pó',8],['Essência de baunilha',10],['Sal',2]]},
  {name:'Brigadeiro Tradicional 20g',group:'Produto',weight:520,recipe:[['Leite condensado',395],['Chocolate em pó',70],['Manteiga',20],['Creme de leite UHT',35]]},
  {name:'Brigadeiro Festa 15g',group:'Produto',weight:510,recipe:[['Leite condensado',395],['Chocolate em pó',60],['Manteiga',20],['Creme de leite UHT',35]]},
  {name:'Cheesecake',group:'Produto',weight:1550,recipe:[['Queijo creme',600],['Natas',300],['Açúcar',180],['Ovos',150],['Bolacha digestiva',200],['Manteiga',100],['Essência de baunilha',20]]},
  {name:'Pudim',group:'Produto',weight:1295,recipe:[['Leite condensado',395],['Leite',600],['Ovos',200],['Açúcar',100]]},
  {name:'Brigadeiro Brûlée',group:'Cobertura',weight:560,recipe:[['Leite condensado',395],['Creme de leite UHT',100],['Manteiga',20],['Açúcar',45]]},
  {name:'Nido com Nutella',group:'Cobertura',weight:635,recipe:[['Leite condensado',395],['Creme de leite UHT',100],['Manteiga',20],['Creme de avelã',120]]},
  {name:'Doce de leite e paçoca',group:'Cobertura',weight:620,recipe:[['Doce de leite',400],['Creme de leite UHT',100],['Amendoim',100],['Manteiga',20]]},
  {name:'Pistácio e frutos vermelhos',group:'Cobertura',weight:650,recipe:[['Creme de leite UHT',220],['Pistácio',130],['Frutos vermelhos',180],['Leite condensado',120]]}
];

async function firstOrInsert(c, selectSql, selectArgs, insertSql, insertArgs){
  const found = await c.query(selectSql, selectArgs);
  if(found.rows[0]) return found.rows[0];
  const inserted = await c.query(insertSql, insertArgs);
  return inserted.rows[0];
}

export async function ensureDemoRecipesForUser(pool,userId,{force=false}={}){
  if(!pool||!userId) return {seeded:false};
  const c=await pool.connect();
  try{
    await c.query('BEGIN');

    const ingredientIds=new Map();
    for(const [name,unit,stock,minStock] of DEMO_INGREDIENTS){
      const row=await firstOrInsert(
        c,
        'SELECT id,name FROM ingredients WHERE user_id=$1 AND name=$2 ORDER BY id LIMIT 1',
        [userId,name],
        'INSERT INTO ingredients(user_id,name,unit,stock,min_stock,active) VALUES($1,$2,$3,$4,$5,TRUE) RETURNING id,name',
        [userId,name,unit,stock,minStock]
      );
      ingredientIds.set(name,Number(row.id));
    }

    for(const [name,category,price,pricingType] of DEMO_PRODUCTS){
      await firstOrInsert(
        c,
        'SELECT id FROM products WHERE user_id=$1 AND name=$2 ORDER BY id LIMIT 1',
        [userId,name],
        'INSERT INTO products(user_id,name,category,price,pricing_type,active) VALUES($1,$2,$3,$4,$5,TRUE) RETURNING id',
        [userId,name,category,price,pricingType]
      );
    }

    for(const [name,cakeWeight,coverWeight] of DEMO_SIZES){
      await firstOrInsert(
        c,
        'SELECT id FROM sizes WHERE user_id=$1 AND name=$2 ORDER BY id LIMIT 1',
        [userId,name],
        'INSERT INTO sizes(user_id,name,cake_weight,cover_weight,active) VALUES($1,$2,$3,$4,TRUE) RETURNING id',
        [userId,name,cakeWeight,coverWeight]
      );
    }

    let seeded=0;
    for(const demo of DEMO_COMPONENTS){
      const found=await c.query(
        'SELECT id,is_demo,active FROM components WHERE user_id=$1 AND name=$2 ORDER BY active DESC,id LIMIT 1',
        [userId,demo.name]
      );
      let component=found.rows[0];
      let created=false;
      if(!component){
        component=(await c.query(
          'INSERT INTO components(user_id,name,component_group,reference_weight,is_demo,active) VALUES($1,$2,$3,$4,TRUE,TRUE) RETURNING id,is_demo,active',
          [userId,demo.name,demo.group,demo.weight]
        )).rows[0];
        created=true;
      }

      const recipeCount=await c.query('SELECT COUNT(*)::int AS n FROM component_ingredients WHERE component_id=$1',[component.id]);
      const hasRecipe=Number(recipeCount.rows[0]?.n||0)>0;

      if(!force && !created && hasRecipe) continue;
      if(!force && !created && component.is_demo===false) continue;

      await c.query(
        'UPDATE components SET component_group=$1,reference_weight=$2,is_demo=TRUE,active=TRUE WHERE id=$3 AND user_id=$4',
        [demo.group,demo.weight,component.id,userId]
      );
      await c.query('DELETE FROM component_ingredients WHERE component_id=$1',[component.id]);
      for(const [ingredientName,quantity] of demo.recipe){
        const ingredientId=ingredientIds.get(ingredientName);
        if(ingredientId) await c.query(
          'INSERT INTO component_ingredients(component_id,ingredient_id,quantity) VALUES($1,$2,$3)',
          [component.id,ingredientId,quantity]
        );
      }
      seeded++;
    }

    await c.query('COMMIT');
    return {seeded:true,updated:seeded};
  }catch(e){
    await c.query('ROLLBACK');
    throw e;
  }finally{
    c.release();
  }
}

export async function seedDemoRecipesForAllUsers(pool){
  if(!pool) return {users:0};
  const {rows}=await pool.query('SELECT user_id FROM app_users');
  let users=0;
  for(const row of rows){
    await ensureDemoRecipesForUser(pool,row.user_id,{force:false});
    users++;
  }
  return {users};
}
