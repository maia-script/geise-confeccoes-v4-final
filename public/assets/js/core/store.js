import { api,setCsrf } from './api.js';
import { uid } from './utils.js';
const CART_KEY='geise:v3:guest-cart',FAV_KEY='geise:v3:guest-favorites',SESSION_KEY='geise:v3:analytics-session',ORDER_KEYS='geise:v3:order-access';
function read(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
function write(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
export const state={config:null,user:null,csrf:null,cart:read(CART_KEY,[]),favorites:read(FAV_KEY,[]),sessionKey:sessionStorage.getItem(SESSION_KEY)||uid()};
sessionStorage.setItem(SESSION_KEY,state.sessionKey);
export async function bootstrap(){const [config,me]=await Promise.all([api('/api/config'),api('/api/auth/me')]);state.config=config;state.user=me.user;state.csrf=me.csrfToken;setCsrf(me.csrfToken);if(state.user){await Promise.all([syncCartFromServer(),syncFavoritesFromServer()]);}emit();return state;}
export function emit(){document.dispatchEvent(new CustomEvent('geise:state'));}
export function cartCount(){return state.cart.reduce((n,i)=>n+i.quantity,0)}
export function saveGuest(){if(!state.user){write(CART_KEY,state.cart);write(FAV_KEY,state.favorites);}emit();}
export async function setSession(payload){state.user=payload.user;state.csrf=payload.csrfToken;setCsrf(payload.csrfToken);if(state.user){await mergeGuestCart();await syncFavoritesToServer();await syncCartFromServer();await syncFavoritesFromServer();}emit();}
export async function logout(){await api('/api/auth/logout',{method:'POST'});state.user=null;state.csrf=null;setCsrf(null);state.cart=[];state.favorites=[];write(CART_KEY,[]);write(FAV_KEY,[]);emit();}
export function addGuestItem(variantId,quantity=1){const found=state.cart.find(i=>i.variantId===variantId);if(found)found.quantity=Math.min(20,found.quantity+quantity);else state.cart.push({variantId,quantity});saveGuest();}
export function updateGuestItem(variantId,quantity){const item=state.cart.find(i=>i.variantId===variantId);if(!item)return;if(quantity<=0)state.cart=state.cart.filter(i=>i.variantId!==variantId);else item.quantity=Math.min(20,quantity);saveGuest();}
export async function persistCart(){if(state.user){await api('/api/cart',{method:'PUT',body:{items:state.cart}});await syncCartFromServer();}else saveGuest();}
async function syncCartFromServer(){const server=await api('/api/cart');state.cart=server.items.map(i=>({variantId:i.variantId,quantity:i.quantity,...i}));write(CART_KEY,[]);}
async function mergeGuestCart(){const guest=read(CART_KEY,[]);if(!guest.length)return;const current=await api('/api/cart');const map=new Map(current.items.map(i=>[i.variantId,i.quantity]));guest.forEach(i=>map.set(i.variantId,Math.min(20,(map.get(i.variantId)||0)+i.quantity)));await api('/api/cart',{method:'PUT',body:{items:[...map].map(([variantId,quantity])=>({variantId,quantity}))}});write(CART_KEY,[]);}
export async function toggleFavorite(productId){const active=state.favorites.includes(productId);if(state.user){if(active)await api(`/api/favorites/${encodeURIComponent(productId)}`,{method:'DELETE'});else await api('/api/favorites',{method:'POST',body:{productId}});await syncFavoritesFromServer();}else{state.favorites=active?state.favorites.filter(x=>x!==productId):[...state.favorites,productId];saveGuest();}return !active;}
async function syncFavoritesFromServer(){const r=await api('/api/favorites');state.favorites=r.items.map(x=>x.id);write(FAV_KEY,[]);emit();}
async function syncFavoritesToServer(){const guest=read(FAV_KEY,[]);for(const productId of guest){try{await api('/api/favorites',{method:'POST',body:{productId}})}catch{}}write(FAV_KEY,[]);}
export function rememberOrderToken(orderNumber,token){const map=read(ORDER_KEYS,{});map[orderNumber]=token;write(ORDER_KEYS,map);}
export function orderToken(orderNumber){return read(ORDER_KEYS,{})[orderNumber]||'';}
export async function clearCart(){state.cart=[];if(state.user){await api('/api/cart',{method:'PUT',body:{items:[]}});}else{write(CART_KEY,[]);}emit();}
