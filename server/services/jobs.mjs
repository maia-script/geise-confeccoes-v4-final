import { nowIso } from '../lib/security.mjs';
import { expirePendingOrders } from './orders.mjs';
import { enqueueAbandonedCarts, processOutbox } from './notifications.mjs';

export async function runJobs(){
  const expired=await expirePendingOrders();
  const abandoned=await enqueueAbandonedCarts();
  const notifications=await processOutbox();
  return {expired,abandoned,notifications,at:nowIso()};
}
