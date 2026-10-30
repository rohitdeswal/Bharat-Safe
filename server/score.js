import * as turf from '@turf/turf';
import OpeningHours from 'opening_hours';
const SPEED=1.3;
const isOpen=(hours,date)=>{try{return new OpeningHours(hours).getState(date)}catch{return false}};
export function scoreRoute(coords,places,time='22:00',date=new Date()){
 const empty={score:0,breakdown:{},segments:{type:'FeatureCollection',features:[]},longestQuietM:0,longestQuietStretch:{startM:0,endM:0,lengthM:0},places:[],helpPoints:[]};
 if(!Array.isArray(coords)||coords.length<2)return empty;
 const line=turf.lineString(coords.map(([lat,lng])=>[lng,lat])),length=turf.length(line,{units:'meters'});if(!Number.isFinite(length)||length===0)return empty;const [hh,mm]=time.split(':').map(Number),start=new Date(date);start.setHours(hh,mm,0,0);
 const stops=places.map(p=>{const snap=turf.nearestPointOnLine(line,turf.point([p.lng,p.lat]),{units:'meters'}),at=snap.properties.location;const open=isOpen(p.opening_hours,new Date(start.getTime()+at/SPEED*1000));return {...p,at,open}}).filter(p=>turf.distance(turf.point([p.lng,p.lat]),turf.nearestPointOnLine(line,turf.point([p.lng,p.lat]),{units:'meters'}),{units:'meters'})<60);
 const active=stops.filter(p=>p.open).map(p=>p.at).sort((a,b)=>a-b),bounds=[0,...active,length],rawGaps=[];for(let i=1;i<bounds.length;i++)rawGaps.push({from:bounds[i-1],to:bounds[i]});const quietGaps=rawGaps.map(g=>({from:g.from===0?0:g.from+150,to:g.to===length?length:g.to-150})).filter(g=>g.to>g.from);
 const quietGap=quietGaps.reduce((a,b)=>(b.to-b.from)>(a.to-a.from)?b:a,{from:0,to:0}),longest=Math.max(0,...quietGaps.map(g=>g.to-g.from)),pOpen=Math.round(30*Math.min(1,active.length/16)),help=stops.filter(p=>p.open&&['pharmacy','clinic','hospital','fuel'].includes(p.category)),pHelp=Math.round(20*Math.min(1,help.length/5)),pQuiet=Math.round(30*Math.max(0,1-longest/900)),pTransport=stops.some(p=>p.open&&p.category==='metro')?10:0;
 const features=[];for(let i=0;i<coords.length-1;i++){const mid=(i/(coords.length-1))*length;const lit=active.some(at=>Math.abs(at-mid)<=150);features.push(turf.lineString([[coords[i][1],coords[i][0]],[coords[i+1][1],coords[i+1][0]]],{lit}))}
 return {score:pOpen+pHelp+pQuiet+pTransport+10,breakdown:{places:{points:pOpen,max:30},help:{points:pHelp,max:20},quiet:{points:pQuiet,max:30},transport:{points:pTransport,max:10},confidence:{points:10,max:10}},segments:turf.featureCollection(features),longestQuietM:Math.round(longest),longestQuietStretch:{startM:Math.round(quietGap.from),endM:Math.round(quietGap.to),lengthM:Math.round(longest)},places:stops,helpPoints:help};
}
