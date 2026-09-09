import { api } from './api.js';
import { state } from './store.js';
export async function resolvedCart(){if(!state.cart.length)return[];const response=await api('/api/catalog/products?limit=60');const variants=new Map();for(const p of response.items)for(const v of p.variants)variants.set(v.id,{...v,productId:p.id,productName:p.name,productSlug:p.slug,imageUrl:v.imageUrl||p.imageUrl});return state.cart.map(item=>({...variants.get(item.variantId),variantId:item.variantId,quantity:item.quantity})).filter(x=>x.productName);}
export async function quoteCurrent({couponCode='',zip='',shippingMethod='local'}={}){return api('/api/quote',{method:'POST',body:{items:state.cart.map(i=>({variantId:i.variantId,quantity:i.quantity})),couponCode,zip,shippingMethod}});}
