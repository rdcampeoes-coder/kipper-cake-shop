INSERT INTO app_meta(key,value) VALUES ('recipes_demo','true')
ON CONFLICT (key) DO UPDATE SET value='true';

INSERT INTO clients(name,contact) VALUES
('Maria Silva','912 345 678'),
('João Pereira','934 111 222'),
('Carla Santos','961 333 444')
ON CONFLICT DO NOTHING;

INSERT INTO ingredients(name,unit,stock,min_stock) VALUES
('Açúcar','g',5000,2000),
('Farinha de trigo','g',10000,5000),
('Ovos','g',1200,500),
('Chocolate meio amargo','g',2000,800),
('Leite condensado','g',2370,790),
('Creme de leite UHT','g',1200,300),
('Cenoura','g',4000,1000),
('Óleo vegetal','g',2500,700),
('Fermento em pó','g',500,100),
('Sal','g',1000,150),
('Manteiga','g',1500,500),
('Chocolate em pó','g',1200,600),
('Natas','ml',2000,600),
('Queijo creme','g',1500,500),
('Oreo','g',800,300),
('Leite','ml',4000,1000),
('Essência de baunilha','ml',250,80),
('Coco ralado','g',1000,300),
('Doce de leite','g',1500,500),
('Amendoim','g',1000,300),
('Leite em pó','g',1000,300),
('Creme de avelã','g',1200,400),
('Pistácio','g',700,250),
('Frutos vermelhos','g',1200,400),
('Morango','g',1500,500),
('Bolacha digestiva','g',1200,400)
ON CONFLICT (name) DO NOTHING;

INSERT INTO sizes(name,cake_weight,cover_weight) VALUES
('P',650,400),
('M',1100,600)
ON CONFLICT (name) DO NOTHING;

INSERT INTO products(name,category,price,pricing_type) VALUES
('Bolo Personalizado','Bolos festivos',28,'base'),
('Bolo de Chocolate','Bolos',30,'unidade'),
('Bolo de Baunilha','Bolos',30,'unidade'),
('Bolo de Cenoura','Bolos',28,'unidade'),
('Bento Cake','Bolos pequenos',20,'unidade'),
('Mini Cake','Bolos pequenos',32,'unidade'),
('Cupcakes','Cupcakes',3.5,'unidade'),
('Bem Casado','Doces',3,'unidade'),
('Brigadeiro Tradicional 20g','Brigadeiros',1.75,'unidade'),
('Brigadeiro Festa 15g','Brigadeiros',0.85,'unidade'),
('Cheesecake','Cheesecakes',28,'unidade'),
('Pudim','Pudins',20,'unidade')
ON CONFLICT DO NOTHING;
