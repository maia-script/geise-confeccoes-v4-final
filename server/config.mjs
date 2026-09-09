import path from 'node:path';
import process from 'node:process';

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

const env = process.env.NODE_ENV || 'development';
const root = process.cwd();
const defaultBaseUrl = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:8080';

export const config = Object.freeze({
  env,
  isProd: env === 'production',
  host: process.env.HOST || (env === 'production' ? '0.0.0.0' : '127.0.0.1'),
  port: numberEnv('PORT', 8080),
  dbPath: path.resolve(root, process.env.DATABASE_PATH || './runtime/geise-v4.sqlite'),
  databaseUrl: process.env.DATABASE_URL || '',
  databaseSsl: (process.env.DATABASE_SSL || 'true').toLowerCase() !== 'false',
  databasePoolMax: Math.max(1, Math.min(50, numberEnv('DATABASE_POOL_MAX', 10))),
  publicDir: path.resolve(root, 'public'),
  baseUrl: defaultBaseUrl.replace(/\/$/, ''),
  sessionTtlHours: Math.max(1, numberEnv('SESSION_TTL_HOURS', 168)),
  orderReservationMinutes: Math.max(5, Math.min(240, numberEnv('ORDER_RESERVATION_MINUTES', 30))),
  freeShippingThreshold: Math.max(0, numberEnv('FREE_SHIPPING_THRESHOLD', 200)),
  standardShippingPrice: Math.max(0, numberEnv('STANDARD_SHIPPING_PRICE', 10)),
  adminEmail: (process.env.ADMIN_EMAIL || (env === 'production' ? '' : 'admin@geise.local')).trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  paymentProvider: (process.env.PAYMENT_PROVIDER || 'manual').toLowerCase(),
  mercadoPagoToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '',
  mercadoPagoWebhookUrl: process.env.MERCADOPAGO_WEBHOOK_URL || `${defaultBaseUrl.replace(/\/$/, '')}/api/webhooks/payment/mercadopago`,
  mercadoPagoWebhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET || '',
  aiProvider: (process.env.AI_PROVIDER || 'local').toLowerCase(),
  aiBaseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
  aiKey: process.env.AI_API_KEY || '',
  aiModel: process.env.AI_MODEL || '',
  notificationWebhookUrl: process.env.NOTIFICATION_WEBHOOK_URL || '',
  whatsappNumber: (process.env.WHATSAPP_NUMBER || '5566996676270').replace(/\D/g, '')
});
