/* Paradise Advance sprite-package decoder adapted for Hackabitat. */
const paradiseExtract={packages:[],assets:[]};
const readU16=(a,p)=>p>=0&&p+2<=a.length?a[p]|a[p+1]<<8:0;
const readU32=(a,p)=>p>=0&&p+4<=a.length?(a[p]|a[p+1]<<8|a[p+2]<<16|a[p+3]<<24)>>>0:0;
function parseSpriteHeader(data,start,limit){if(start<0||start+24>limit)return null;const length=readU32(data,start),flags=data[start+4],bpp=data[start+5],count=readU16(data,start+6),width=data[start+8],height=data[start+9],imageWidth=data[start+12],imageHeight=data[start+13],paletteSets=data[start+15],transparent=readU16(data,start+16),paletteOffset=readU16(data,start+18),pixelOffset=readU16(data,start+20);if(![0,1,2,3,16,17,18].includes(bpp)||!count||!width||!height||width>128||height>128||!imageWidth||!imageHeight||(flags&0x60)===0x60)return null;if(length&&(length<24||start+length>limit))return null;if(paletteOffset>=(length||limit-start)||pixelOffset>=(length||limit-start))return null;return{length,flags,bpp,count,width,height,imageWidth,imageHeight,paletteSets,transparent,paletteOffset,pixelOffset}}
function validateSpritePackage(data,offset,length,archiveOffset,index){if(length<28||offset<0||offset+length>data.length)return null;const first=readU32(data,offset);if(first<4||first%4||first>Math.min(length,0x20000))return null;const count=first/4;if(count<1||count>20000||first+24>length)return null;let prev=first;for(let i=0;i<count;i++){const off=readU32(data,offset+i*4);if(off<first||off<prev||off+24>length)return null;prev=off}const header=parseSpriteHeader(data,offset+readU32(data,offset),offset+length);if(!header)return null;let valid=0;for(let i=0;i<Math.min(count,16);i++)if(parseSpriteHeader(data,offset+readU32(data,offset+i*4),offset+length))valid++;if(valid<Math.min(count,3))return null;return{id:paradiseExtract.packages.length,offset,length,entryCount:count,sourceArchiveOffset:archiveOffset,entryIndex:index,firstHeader:header}}
function rleDecode(src,wordwise,maxOutput){const out=[];let p=0,unit=wordwise?4:1;while(p+unit<=src.length&&out.length<maxOutput){let ctrl=0;for(let j=0;j<unit;j++)ctrl=(ctrl|src[p+j]<<(j*8))>>>0;p+=unit;if(!ctrl)break;const literal=wordwise?!!(ctrl&0x80000000):!!(ctrl&0x80),n=wordwise?(ctrl&0x0fffffff):(ctrl&0x7f);if(literal){const bytes=Math.min(n*unit,src.length-p,maxOutput-out.length);for(let j=0;j<bytes;j++)out.push(src[p+j]);p+=bytes}else{if(p+unit>src.length)break;const value=Array.from(src.subarray(p,p+unit));p+=unit;const bytes=Math.min(n*unit,maxOutput-out.length);for(let j=0;j<bytes;j++)out.push(value[j%unit])}}return new Uint8Array(out)}
function decodeParadiseSpriteFrame(pkg,assetIndex,frameIndex,paletteSet=0){const all=Hackabitat.firmware.bytes,base=pkg.offset,rel=readU32(all,base+assetIndex*4),start=base+rel,h=parseSpriteHeader(all,start,base+pkg.length);if(!h)throw Error('Invalid sprite header');if(frameIndex<0||frameIndex>=h.count)throw Error('Frame index outside package');const px=h.width*h.height,indexed=h.bpp<=3,bits=indexed?[1,2,4,8][h.bpp]:(h.bpp===18?24:16),expected=Math.ceil(px*bits/8),pixelBase=start+h.pixelOffset;let decoded;if(h.flags&0x60){const relOffset=readU32(all,pixelBase+frameIndex*8),storedLength=readU32(all,pixelBase+frameIndex*8+4),absolute=pixelBase+(relOffset&0x7fffffff);if(absolute<0||storedLength>pkg.length||absolute+storedLength>base+pkg.length||(h.length&&absolute+storedLength>start+h.length))throw Error('Invalid pixel data range');let stored=all.slice(absolute,absolute+storedLength);if(h.flags&0x80)stored=stored.map(v=>v^0x53);decoded=(relOffset&0x80000000)?stored:rleDecode(stored,!!(h.flags&0x40),Math.min(expected*4+64,2*1024*1024))}else{const absolute=pixelBase+frameIndex*expected;if(absolute+expected>base+pkg.length||(h.length&&absolute+expected>start+h.length))throw Error('Truncated pixel data');decoded=all.slice(absolute,absolute+expected);if(h.flags&0x80)decoded=decoded.map(v=>v^0x53)}const rgba=new Uint8ClampedArray(px*4);if(indexed){const max=1<<bits,paletteBase=start+h.paletteOffset+Math.min(paletteSet,Math.max(0,h.paletteSets-1))*max*2;let bit=0;for(let i=0;i<px;i++){let idx=0;for(let k=0;k<bits;k++)if(((bit+k)>>3)<decoded.length)idx|=((decoded[(bit+k)>>3]>>((bit+k)&7))&1)<<k;const c=readU16(all,paletteBase+idx*2),at=i*4;rgba[at]=Math.round(((c>>11)&31)*255/31);rgba[at+1]=Math.round(((c>>5)&63)*255/63);rgba[at+2]=Math.round((c&31)*255/31);rgba[at+3]=(h.flags&4)&&idx===h.transparent?0:255;bit+=bits}}else for(let i=0;i<px;i++){let r,g,b,word=0;if(h.bpp===18){const k=i*3;r=decoded[k]||0;g=decoded[k+1]||0;b=decoded[k+2]||0;word=(r>>3)<<11|(g>>2)<<5|b>>3}else{word=readU16(decoded,i*2);r=Math.round(((word>>11)&31)*255/31);g=Math.round(((word>>5)&63)*255/63);b=Math.round((word&31)*255/31)}const at=i*4;rgba[at]=r;rgba[at+1]=g;rgba[at+2]=b;rgba[at+3]=(h.flags&4)&&word===h.transparent?0:255}return{width:h.width,height:h.height,rgba,header:h}}
function decodeParadiseSubimage(pkg,assetIndex,subimageIndex,paletteSet=0){const all=Hackabitat.firmware.bytes,base=pkg.offset,rel=readU32(all,base+assetIndex*4),start=base+rel,h=parseSpriteHeader(all,start,base+pkg.length);if(!h)throw Error('Invalid sprite header');const cols=Math.max(1,h.imageWidth),rows=Math.max(1,h.imageHeight),per=cols*rows,total=Math.floor(h.count/per),index=Math.max(0,Math.min(total-1,subimageIndex)),w=h.width*cols,ht=h.height*rows,rgba=new Uint8ClampedArray(w*ht*4);for(let ty=0;ty<rows;ty++)for(let tx=0;tx<cols;tx++){const tile=decodeParadiseSpriteFrame(pkg,assetIndex,index*per+ty*cols+tx,paletteSet);for(let y=0;y<h.height;y++){const src=y*h.width*4,dst=((ty*h.height+y)*w+tx*h.width)*4;rgba.set(tile.rgba.subarray(src,src+h.width*4),dst)}}return{width:w,height:ht,rgba,header:h}}
function rgbaToPixels(d){const pixels=[],palette=[],seen=new Set();for(let i=0;i<d.rgba.length;i+=4){if(!d.rgba[i+3]){pixels.push(null);continue}const c='#'+[d.rgba[i],d.rgba[i+1],d.rgba[i+2]].map(v=>v.toString(16).padStart(2,'0')).join('');pixels.push(c);if(!seen.has(c)&&palette.length<64){seen.add(c);palette.push(c)}}return{pixels,palette:palette.length?palette:['#000000']}}
function buildParadiseAssetIndex(){const data=Hackabitat.firmware?.bytes;if(!data)return;const assets=[];for(const pkg of paradiseExtract.packages)for(let ai=0;ai<pkg.entryCount;ai++){const rel=readU32(data,pkg.offset+ai*4),h=parseSpriteHeader(data,pkg.offset+rel,pkg.offset+pkg.length);if(!h)continue;const subimages=Math.floor(h.count/(h.imageWidth*h.imageHeight));if(!subimages)continue;const width=h.width*h.imageWidth,height=h.height*h.imageHeight,category=(width>=96&&height>=64)?'backgrounds':(width<=32&&height<=32&&subimages<=4)?'icons':(subimages>=4&&(width>=24||height>=24))?'characters':(width<=48&&height<=48)?'ui':subimages>=2?'effects':'other';assets.push({pkg,assetIndex:ai,header:h,subimages,width,height,category,id:pkg.offset+':'+ai})}paradiseExtract.assets=assets}
async function scanParadiseSpritePackages(onProgress=()=>{}){
 const data=Hackabitat.firmware?.bytes;if(!data)throw Error('Load firmware first');
 const packages=[],seen=new Set(),hasArc=p=>p+16<=data.length&&data[p]===65&&data[p+1]===82&&data[p+2]===67&&data[p+3]===50;
 // Import of Paradise Advance's ARC2 package-table detection.
 for(let p=0;(p=data.indexOf(65,p))!==-1;){
  if(!hasArc(p))continue;
  const total=readU32(data,p+8),files=readU32(data,p+12);
  if(!files||files>4096||total<files*16||p+16+total>data.length)continue;
  const table=p+16;if(table+files*16>p+16+total)continue;
  for(let i=0;i<files;i++){
   const e=table+i*16,off=readU32(data,e+4),comp=readU32(data,e+8),raw=readU32(data,e+12);
   if(off<16+files*16||!comp||off+Math.max(comp,raw)>16+total||p+off+Math.max(comp,raw)>data.length)continue;
   const absolute=p+off,len=raw||comp,key=absolute+':'+len;
   if(seen.has(key))continue;
   const candidate=validateSpritePackage(data,absolute,len,p,i);
   if(candidate){seen.add(key);packages.push(candidate)}
  }
 }
 // Build sorted archive ranges once. The old ranges.some() ran for every 4-byte
 // offset and caused quadratic work on large firmware files.
 const ranges=[];
 for(let p=0;(p=data.indexOf(65,p))!==-1;){
  if(!hasArc(p))continue;
  const total=readU32(data,p+8);
  if(total>0&&total<0x1000000&&p+16+total<=data.length)ranges.push([p,p+16+total]);
 }
 ranges.sort((a,b)=>a[0]-b[0]);
 const known=new Set(packages.map(p=>p.offset));let ri=0,deepFound=0;
 const limit=data.length-32,batch=0x10000;
 for(let from=0;from<=limit;from+=batch){
  const to=Math.min(limit+1,from+batch);
  for(let off=from;off<to;off+=4){
   while(ri<ranges.length&&ranges[ri][1]<=off)ri++;
   if(known.has(off)||(ri<ranges.length&&off>=ranges[ri][0]&&off<ranges[ri][1]))continue;
   const first=readU32(data,off);
   if(first<8||first%4||first>0x4000||off+first+24>data.length)continue;
   const count=first/4;if(count<2||count>4096)continue;
   let prev=first,ok=true;
   for(let i=0;i<count;i++){const n=readU32(data,off+i*4);if(n<first||n<prev||off+n+24>data.length){ok=false;break}prev=n}
   if(!ok)continue;
   const h=parseSpriteHeader(data,off+readU32(data,off),data.length);
   if(!h||h.length<24||h.length>0x200000||off+readU32(data,off)+h.length>data.length)continue;
   let valid=0;
   for(let i=0;i<Math.min(count,8);i++){const n=readU32(data,off+i*4),hh=parseSpriteHeader(data,off+n,data.length);if(hh&&hh.length>=24&&hh.length<=0x200000&&off+n+hh.length<=data.length)valid++}
   if(valid<Math.min(count,2))continue;
   const candidate=validateSpritePackage(data,off,Math.min(data.length-off,0x800000),-1,-1);
   if(candidate){candidate.discovery='deep scan';known.add(off);packages.push(candidate);deepFound++}
  }
  onProgress(Math.min(100,Math.round(to/Math.max(1,limit+1)*100)));
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 packages.forEach(p=>{const h=p.firstHeader,w=h.width*h.imageWidth,ht=h.height*h.imageHeight,frames=Math.floor(h.count/Math.max(1,h.imageWidth*h.imageHeight));p.category=(w>=96&&ht>=64)?'backgrounds':(w<=32&&ht<=32&&frames<=4)?'icons':(frames>=4&&(w>=24||ht>=24))?'characters':(w<=48&&ht<=48)?'ui':frames>=2?'effects':'other';p.discovery=p.discovery||'archive'});
 packages.sort((a,b)=>a.offset-b.offset);paradiseExtract.packages=packages;buildParadiseAssetIndex();
 return{packages:packages.length,assets:paradiseExtract.assets.length,deepFound};
}