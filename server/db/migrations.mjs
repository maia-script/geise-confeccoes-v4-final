import { databaseEngine, dbAll, dbExec } from './index.mjs';

async function hasColumn(table, column) {
  if (databaseEngine === 'sqlite') {
    const rows = await dbAll(`PRAGMA table_info(${table})`);
    return rows.some(row => row.name === column);
  }
  const rows = await dbAll(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=?`, [table]);
  return rows.some(row => row.column_name === column);
}

async function addColumn(table, column, sqlType) {
  if (!(await hasColumn(table, column))) await dbExec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType};`);
}

export async function migrateDatabase() {
  await addColumn('users', 'permissions_json', `TEXT NOT NULL DEFAULT '[]'`);
  await addColumn('products', 'product_code', 'TEXT');
  await addColumn('products', 'badges_json', `TEXT NOT NULL DEFAULT '[]'`);
  await addColumn('products', 'show_when_out_of_stock', 'INTEGER NOT NULL DEFAULT 1');
  await addColumn('orders', 'customer_cpf', 'TEXT');
  await addColumn('orders', 'payment_method', 'TEXT');

  await dbExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL AND phone<>'';`);
  await dbExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_products_code_unique ON products(product_code) WHERE product_code IS NOT NULL AND product_code<>'';`);
  await dbExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_redemptions_order_unique ON coupon_redemptions(order_id);`);
  await dbExec(`CREATE TABLE IF NOT EXISTS badge_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    label TEXT NOT NULL,
    background TEXT NOT NULL DEFAULT '#7a294c',
    foreground TEXT NOT NULL DEFAULT '#ffffff',
    border_color TEXT,
    icon TEXT,
    animation TEXT NOT NULL DEFAULT 'none',
    position TEXT NOT NULL DEFAULT 'top-left',
    priority INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`);
}
