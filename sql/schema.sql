CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID,
  name TEXT NOT NULL,
  contact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingredients (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'g',
  stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  min_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  ideal_stock NUMERIC(14,3),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID,
  name TEXT NOT NULL,
  category TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  pricing_type TEXT NOT NULL DEFAULT 'unidade',
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS components (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID,
  name TEXT NOT NULL,
  component_group TEXT NOT NULL,
  reference_weight NUMERIC(14,3) NOT NULL DEFAULT 0,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS component_ingredients (
  workspace_id UUID,
  component_id BIGINT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(id),
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  PRIMARY KEY(component_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS sizes (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID,
  name TEXT NOT NULL,
  cake_weight NUMERIC(14,3) NOT NULL DEFAULT 0,
  cover_weight NUMERIC(14,3) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID,
  client_id BIGINT REFERENCES clients(id),
  pickup_date DATE NOT NULL,
  pickup_time TIME,
  status TEXT NOT NULL DEFAULT 'Registada',
  original_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'none',
  discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  final_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_applied BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  product_id BIGINT REFERENCES products(id),
  base_component_id BIGINT REFERENCES components(id),
  cover_component_id BIGINT REFERENCES components(id),
  size_id BIGINT REFERENCES sizes(id),
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS order_consumption (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(id),
  predicted_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  actual_qty NUMERIC(14,3),
  unit TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(id),
  movement_type TEXT NOT NULL,
  quantity NUMERIC(14,3) NOT NULL,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  order_id BIGINT REFERENCES orders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID,
  name TEXT NOT NULL,
  expense_type TEXT NOT NULL DEFAULT 'Pontual',
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE
);

-- Migração segura para bases já existentes. Os dados antigos ficam com workspace_id NULL
-- e deixam de aparecer quando o controlo multi-conta estiver ativo.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE components ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE component_ingredients ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE sizes ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE order_consumption ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS workspace_id UUID;

-- Nomes podem repetir em negócios diferentes.
ALTER TABLE ingredients DROP CONSTRAINT IF EXISTS ingredients_name_key;
ALTER TABLE sizes DROP CONSTRAINT IF EXISTS sizes_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS ingredients_workspace_name_uidx
  ON ingredients(workspace_id, lower(name)) WHERE workspace_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sizes_workspace_name_uidx
  ON sizes(workspace_id, lower(name)) WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_workspace_idx ON clients(workspace_id);
CREATE INDEX IF NOT EXISTS ingredients_workspace_idx ON ingredients(workspace_id);
CREATE INDEX IF NOT EXISTS products_workspace_idx ON products(workspace_id);
CREATE INDEX IF NOT EXISTS components_workspace_idx ON components(workspace_id);
CREATE INDEX IF NOT EXISTS component_ingredients_workspace_idx ON component_ingredients(workspace_id);
CREATE INDEX IF NOT EXISTS sizes_workspace_idx ON sizes(workspace_id);
CREATE INDEX IF NOT EXISTS orders_workspace_idx ON orders(workspace_id);
CREATE INDEX IF NOT EXISTS order_items_workspace_idx ON order_items(workspace_id);
CREATE INDEX IF NOT EXISTS order_consumption_workspace_idx ON order_consumption(workspace_id);
CREATE INDEX IF NOT EXISTS stock_movements_workspace_idx ON stock_movements(workspace_id);
CREATE INDEX IF NOT EXISTS expenses_workspace_idx ON expenses(workspace_id);
