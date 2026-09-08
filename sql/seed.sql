INSERT INTO app_meta(key,value) VALUES ('recipes_demo','true')
ON CONFLICT (key) DO NOTHING;

INSERT INTO clients(name,contact) VALUES
('Maria Silva','912 345 678'),
('João Pereira','934 111 222'),
('Carla Santos','961 333 444')
ON CONFLICT DO NOTHING;

INSERT INTO ingredients(name,unit,stock,min_stock) VALUES
('Açúcar','g',5000,2000),
('Farinha de trigo','g',10000,5000),
('Ovos','un',24,10),
('Chocolate meio amargo','g',2000,800),
('Leite condensado','g',0,1185),
('Creme de leite UHT','g',600,300),
('Cenoura','g',4000,1000),
('Óleo vegetal','g',2500,700),
('Fermento em pó','g',0,100),
('Sal','g',1000,150),
('Manteiga','g',700,500),
('Chocolate em pó','g',450,600),
('Natas','ml',1200,600),
('Queijo creme','g',1300,500),
('Oreo','g',800,300)
ON CONFLICT (name) DO NOTHING;

INSERT INTO sizes(name,cake_weight,cover_weight) VALUES
('P',650,400),
('M',1100,600)
ON CONFLICT (name) DO NOTHING;

INSERT INTO products(name,category,price,pricing_type) VALUES
('Bolo Personalizado','Bolos festivos',28,'base'),
('Bolo de Cenoura','Bolos',28,'unidade'),
('Bolo de Chocolate','Bolos',30,'unidade'),
('Bento Cake','Bolos pequenos',20,'unidade'),
('Mini Cake','Bolos pequenos',32,'unidade'),
('Cupcakes','Cupcakes',3.5,'unidade'),
('Bem Casado','Doces',3,'unidade'),
('Brigadeiro Tradicional 20g','Brigadeiros',1.75,'unidade'),
('Brigadeiro Festa 15g','Brigadeiros',0.85,'unidade')
ON CONFLICT DO NOTHING;
