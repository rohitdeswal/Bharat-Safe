export const initialAlarm=()=>({status:'idle',nextCheckAt:null,countdownEndsAt:null,quietPending:false,sosToken:null});
export function startAlarm(state,now,intervalSeconds,atQuietStart=false){return {...state,status:'checking',nextCheckAt:now+intervalSeconds*1000,countdownEndsAt:null,quietPending:atQuietStart,sosToken:null}}
export function tickAlarm(state,now,{quietStart=false,countdownSeconds=10}={}){
 if(state.status==='countdown')return now>=state.countdownEndsAt?{...state,status:'sos_sent',countdownEndsAt:null}:{...state};
 if(state.status!=='idle'&&state.status!=='checking')return state;
 if(quietStart||state.quietPending||state.nextCheckAt!==null&&now>=state.nextCheckAt)return {...state,status:'countdown',countdownEndsAt:now+countdownSeconds*1000,quietPending:false};
 return state;
}
export function safeAlarm(state,now,intervalSeconds){if(state.status!=='countdown')return state;return {...state,status:'checking',countdownEndsAt:null,nextCheckAt:now+intervalSeconds*1000,quietPending:false}}
export function setSosToken(state,token){return state.status==='sos_sent'?{...state,sosToken:token}:state}
export function clearAlarm(state){return {...state,status:'cleared',countdownEndsAt:null,nextCheckAt:null,quietPending:false}}
export function pauseAlarm(){return initialAlarm()}
