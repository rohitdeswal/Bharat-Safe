import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export const DEMO_EMAIL='demo@bharatsafe.app';
export const DEMO_PASSWORD='RiyaWalks@2026';
export const validEmail=value=>typeof value==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=254;
export const validPhone=value=>typeof value==='string'&&/^\+?[0-9][0-9 ()-]{6,20}$/.test(value)&&value.replace(/\D/g,'').length>=7&&value.replace(/\D/g,'').length<=15;
export async function hashPassword(password){return bcrypt.hash(password,10)}
export async function checkPassword(password,hash){return typeof password==='string'&&typeof hash==='string'&&bcrypt.compare(password,hash)}
export function validateContacts(contacts){
 if(!Array.isArray(contacts)||contacts.length>3)return {ok:false,error:'Add between 0 and 3 emergency contacts'};
 const clean=[];const seen=new Set();
 for(const contact of contacts){const name=String(contact?.name||'').trim(),relationship=String(contact?.relationship||'').trim(),phone=String(contact?.phone||'').trim(),email=String(contact?.email||'').trim().toLowerCase(),key=phone.replace(/\D/g,'');if(!name||name.length>80||!relationship||relationship.length>40||!validPhone(phone))return {ok:false,error:'Each contact needs a name, relationship and valid phone number'};if(email&&!validEmail(email))return {ok:false,error:'Enter a valid emergency contact email'};if(seen.has(key))return {ok:false,error:'Emergency contacts must have different phone numbers'};seen.add(key);const saved={id:String(contact.id||crypto.randomUUID()),name,relationship,phone};if(email)saved.email=email;for(const field of ['telegramChatId','telegramLinkedAt','linkToken','linkTokenExpiresAt'])if(contact[field]!==undefined)saved[field]=contact[field];clean.push(saved)}
 return {ok:true,contacts:clean};
}
export function signSession(user,secret,now=Date.now()) {const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),payload=Buffer.from(JSON.stringify({sub:user.id,email:user.email,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+86400})).toString('base64url'),body=`${header}.${payload}`,sig=crypto.createHmac('sha256',secret).update(body).digest('base64url');return `${body}.${sig}`}
export function verifySession(token,secret,now=Date.now()) {try{const [head,payload,sig]=String(token).split('.');if(!head||!payload||!sig)return null;const body=`${head}.${payload}`,expected=crypto.createHmac('sha256',secret).update(body).digest(),actual=Buffer.from(sig,'base64url');if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;const claims=JSON.parse(Buffer.from(payload,'base64url').toString());return claims.exp*1000>now?claims:null}catch{return null}}
export const isAuthenticated=(cookie,secret,now=Date.now())=>Boolean(verifySession(cookie,secret,now));
