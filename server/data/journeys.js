// Hand-authored corridors. Intermediate points follow the named roads; the small
// deterministic offsets create two distinct, walkable demo alternatives.
const seeds=[
 {id:'hauz-khas',name:'Hauz Khas Metro to IIT Delhi',start:'Hauz Khas Metro',end:'IIT Delhi',buddy:true,base:[[28.5438,77.2066],[28.5437,77.2056],[28.5438,77.2046],[28.5440,77.2036],[28.5442,77.2026],[28.5443,77.2016],[28.5445,77.2006],[28.5447,77.1996],[28.5449,77.1986],[28.5450,77.1976],[28.5451,77.1966],[28.5452,77.1956],[28.5452,77.1946],[28.5452,77.1936],[28.5451,77.1927],[28.5451,77.1920]]},
 {id:'cp-india-gate',name:'Connaught Place to India Gate',start:'Connaught Place',end:'India Gate',buddy:true,base:[[28.6328,77.2197],[28.6315,77.2202],[28.6302,77.2207],[28.6289,77.2212],[28.6276,77.2217],[28.6263,77.2222],[28.6250,77.2228],[28.6237,77.2235],[28.6224,77.2242],[28.6211,77.2249],[28.6198,77.2256],[28.6185,77.2262],[28.6172,77.2268],[28.6159,77.2274],[28.6146,77.2280],[28.6133,77.2286]]},
 {id:'green-park-aiims',name:'Green Park Metro to AIIMS',start:'Green Park Metro',end:'AIIMS',buddy:true,base:[[28.5580,77.2060],[28.5585,77.2061],[28.5590,77.2063],[28.5595,77.2065],[28.5600,77.2067],[28.5605,77.2069],[28.5610,77.2071],[28.5615,77.2073],[28.5620,77.2075],[28.5625,77.2077],[28.5630,77.2079],[28.5635,77.2081],[28.5640,77.2083],[28.5645,77.2085],[28.5650,77.2087],[28.5690,77.2090]]},
 {id:'saket-malviya',name:'Saket Metro to Malviya Nagar',start:'Saket Metro',end:'Malviya Nagar',buddy:false,base:[[28.5200,77.2010],[28.5207,77.2014],[28.5214,77.2019],[28.5221,77.2023],[28.5228,77.2028],[28.5235,77.2032],[28.5242,77.2037],[28.5249,77.2041],[28.5256,77.2046],[28.5263,77.2050],[28.5270,77.2055],[28.5277,77.2059],[28.5284,77.2064],[28.5290,77.2068],[28.5295,77.2072],[28.5300,77.2076]]}
];
const interpolate=(points,n=52)=>Array.from({length:n},(_,i)=>{const x=i/(n-1)*(points.length-1),j=Math.min(Math.floor(x),points.length-2),f=x-j;return [points[j][0]+(points[j+1][0]-points[j][0])*f,points[j][1]+(points[j+1][1]-points[j][1])*f]});
const mkroute=(pts,alt=0)=>interpolate(pts).map(([a,b],i)=>[a+(alt?Math.sin(i*.5)*.0003:0),b+(alt?Math.cos(i*.4)*.0003:0)]);
const lengthM=coords=>coords.reduce((sum,p,i)=>{if(!i)return sum;const a=coords[i-1],rad=Math.PI/180,dlat=(p[0]-a[0])*rad,dlng=(p[1]-a[1])*rad,h=Math.sin(dlat/2)**2+Math.cos(a[0]*rad)*Math.cos(p[0]*rad)*Math.sin(dlng/2)**2;return sum+12742016*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))},0);
export const journeys=seeds.map(s=>{const fastest=mkroute(s.base),bharatsafe=mkroute(s.base,1),first=Math.round(lengthM(fastest)/1.3/60);return {id:s.id,name:s.name,start:s.start,end:s.end,hasBuddy:s.buddy,routes:[{name:'Fastest route',coordinates:fastest,minutes:first},{name:'Bharat Safe route',coordinates:bharatsafe,minutes:Math.max(first+2,Math.round(lengthM(bharatsafe)/1.3/60))}]}});
const names=['Metro Gate','Ravi General Store','Sharma Medical','Nizamuddin Tea Stall','City Care Clinic','Bharat Fuel Point','Khan Bakery','Green Leaf Pharmacy','Night Owl Grocers','Asha Chemist','Delhi Corner Cafe','Sanjay Dairy'];
export function placesFor(journey,routeIndex){
 const r=journey.routes[routeIndex],length=lengthM(r.coordinates),spacing=length/24;
 const desiredGap=routeIndex===0?1050:(journey.id==='green-park-aiims'?800:journey.id==='saket-malviya'?600:600),quietCount=Math.max(1,Math.min(23,Math.round(desiredGap/spacing)-1)),quietFirst=Math.max(1,Math.floor((25-quietCount)/2)),quietLast=quietFirst+quietCount-1;
 return Array.from({length:25},(_,i)=>{
  const at=(i+.2)/25,ix=Math.round(at*(r.coordinates.length-1)),[lat,lng]=r.coordinates[ix];
  const kind=i===0?'metro':i%11===5?'hospital':i%13===6?'fuel':i%7===2?'pharmacy':i%9===4?'clinic':i%6===3?'food':'shop';
  const inQuiet=i>=quietFirst&&i<=quietLast,closed=inQuiet;
  const closing=closed?21:routeIndex===1?(i%7===1?23:24):[22,23,24][i%3],always=i%10===0&&!inQuiet;
  return {id:`${journey.id}-${routeIndex}-${i}`,name:names[(i+routeIndex*3)%names.length],category:kind,lat:lat+.00012,lng:lng-.0001,at,opening_hours:always?'24/7':`Mo-Su 06:00-${String(closing).padStart(2,'0')}:00`};
 });
}
