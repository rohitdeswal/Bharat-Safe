import * as turf from '@turf/turf';
export const withinWindow=(offset,window=15)=>Number.isFinite(offset)&&Math.abs(offset)<=window;
// Input route arrays use [lat,lng]; the only returned geometry is the overlap.
export function matchQuietStretch(userCoords,buddyCoords,quietStart,quietEnd,offset,places=[]){
 if(!withinWindow(offset)||quietEnd-quietStart<200||userCoords?.length<2||buddyCoords?.length<2)return null;
 const user=turf.lineString(userCoords.map(([lat,lng])=>[lng,lat])),buddy=turf.lineString(buddyCoords.map(([lat,lng])=>[lng,lat]));
 const length=turf.length(buddy,{units:'meters'}),from=Math.max(0,quietStart),to=Math.min(turf.length(user,{units:'meters'}),quietEnd);
 if(to-from<200)return null;
 const quiet=turf.lineSliceAlong(user,from,to,{units:'meters'}),area=turf.buffer(quiet,50,{units:'meters'});if(!area)return null;
 const inside=[];for(let d=0;d<=length;d+=20){const p=turf.along(buddy,d,{units:'meters'});if(turf.booleanPointInPolygon(p,area))inside.push([d,p.geometry.coordinates]);}
 let best=[],run=[];for(const sample of inside){if(run.length&&sample[0]-run.at(-1)[0]>45){if(run.length>best.length)best=run;run=[]}run.push(sample)}if(run.length>best.length)best=run;
 const overlapLength=best.length>1?best.at(-1)[0]-best[0][0]:0;if(overlapLength<200)return null;
 const meeting=places.filter(p=>p.open&&p.at<quietStart&&['food','shop','pharmacy','clinic','hospital','metro'].includes(p.category)).sort((a,b)=>b.at-a.at)[0];
 if(!meeting)return null;
 return {overlap:{type:'LineString',coordinates:best.map(x=>x[1])},overlapM:Math.round(overlapLength),meetingPoint:meeting};
}
