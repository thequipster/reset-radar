const fs=require('fs'),path=require('path'),sharp=require('sharp');
const root=__dirname;
const sizes=[16,20,24,32,48,64,128,256,512,1024];
(async()=>{const buffers={};for(const s of sizes){const source=path.join(root,'icons/source',s<=24?'reset-radar-small.svg':'reset-radar.svg');buffers[s]=await sharp(source).resize(s,s).png().toBuffer();fs.writeFileSync(path.join(root,`icons/png/reset-radar-${s}.png`),buffers[s]);}
const frames=sizes.slice(0,8);const head=Buffer.alloc(6+16*frames.length);head.writeUInt16LE(1,2);head.writeUInt16LE(frames.length,4);let offset=head.length;frames.forEach((s,i)=>{const p=6+16*i;head[p]=head[p+1]=s===256?0:s;head.writeUInt16LE(1,p+4);head.writeUInt16LE(32,p+6);head.writeUInt32LE(buffers[s].length,p+8);head.writeUInt32LE(offset,p+12);offset+=buffers[s].length;});fs.writeFileSync(path.join(root,'icons/reset-radar.ico'),Buffer.concat([head,...frames.map(s=>buffers[s])]));console.log('已导出 10 个 PNG 尺寸与 8 帧 ICO');})();
