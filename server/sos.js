import crypto from 'node:crypto';
export const createSosEvent=({user,journeyId,routeIndex,time,now=Date.now(),location=null,locationStatus='unavailable',activeDurationMs=900000})=>{
  const hasLocation=validSosLocation(location,{sosStartedAt:now,now});
  const positions=hasLocation?[{coordinates:[location.lat,location.lng],accuracy:location.accuracy,fixedAt:location.fixedAt,at:now}]:[];
  return {token:crypto.randomBytes(18).toString('hex'),userId:user.id,name:user.name,journeyId,routeIndex,time,voiceLanguage:user.alarmSettings?.voiceLanguage==='hi'?'hi':'en',status:'active',createdAt:now,activeUntil:now+activeDurationMs,expiresAt:now+86400000,positions,contacts:user.contacts.map(contact=>({id:contact.id,name:contact.name,relationship:contact.relationship,phone:contact.phone,email:contact.email,telegramChatId:contact.telegramChatId,telegramLinkedAt:contact.telegramLinkedAt})),deliveries:[],locationStatus:hasLocation?getLocationStatus(positions,now):'unavailable',awaitingLocation:!hasLocation&&locationStatus==='pending',clearedAt:null,expiredAt:null};
};
export const isExpired=(event,now=Date.now())=>!event||event.expiresAt<=now;
export const sosActiveUntil=event=>Number(event?.activeUntil??(Number(event?.createdAt)+900000));
export function validSosLocation(location,{sosStartedAt=-Infinity,now=Date.now()}={}){
  if(!location||!Number.isFinite(location.lat)||location.lat < -90||location.lat>90||!Number.isFinite(location.lng)||location.lng < -180||location.lng>180||!Number.isFinite(location.accuracy)||location.accuracy<0||location.accuracy>100000||!Number.isFinite(location.fixedAt))return false;
  return location.fixedAt>=sosStartedAt-120000&&location.fixedAt<=now+60000;
}
export function getLocationStatus(positions=[],now=Date.now()){
  const latest=positions.at(-1);if(!latest||!Array.isArray(latest.coordinates)||!Number.isFinite(latest.accuracy)||!Number.isFinite(latest.fixedAt))return 'unavailable';return now-latest.fixedAt<60000?'live':'last-known';
}
export function appendSosLocation(event,location,now=Date.now()){
  if(!event||event.status!=='active'||isExpired(event,now)||!validSosLocation(location,{sosStartedAt:event.createdAt,now}))return false;
  event.positions.push({coordinates:[location.lat,location.lng],accuracy:location.accuracy,fixedAt:location.fixedAt,at:now});
  if(event.positions.length>500)event.positions.splice(0,event.positions.length-500);
  event.locationStatus=getLocationStatus(event.positions,now);event.awaitingLocation=false;return true;
}
export function appendPosition(event,coordinates,now=Date.now()){if(!event||isExpired(event,now)||event.status!=='active'||!Array.isArray(coordinates)||coordinates.length!==2||!coordinates.every(Number.isFinite)||Math.abs(coordinates[0])>180||Math.abs(coordinates[1])>180)return false;return appendSosLocation(event,{lat:coordinates[0],lng:coordinates[1],accuracy:0,fixedAt:now},now)}
export function clearSos(event,now=Date.now()){if(isExpired(event,now)||event.status!=='active'||sosActiveUntil(event)<=now)return false;event.status='cleared';event.clearedAt=now;return true}
export function expireSos(event,now=Date.now()){if(!event||event.status!=='active'||sosActiveUntil(event)>now)return false;event.status='expired';event.expiredAt=now;return true}
export const validPosition=value=>Array.isArray(value)&&value.length===2&&value.every(n=>Number.isFinite(n)&&Math.abs(n)<=180);
