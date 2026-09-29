const fs = require("fs");
const http = require("http");
const WebSocket = require("ws");
const CONFIG = require("../../../config");
const knowledge = require("../../knowledge/knowledge-engine");
const { listProjects, resolveAssetPath } = require("./portfolio-repository");

function getBrowserTab() {
  return new Promise((resolve, reject) => {
    http.get(CONFIG.PORTFOLIO_CDP_URL, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const tabs = JSON.parse(data);
          const tab = tabs.find(t => t.url && t.url.startsWith(CONFIG.PORTFOLIO_RENDER_PLATFORM_ORIGIN));
          if (!tab) reject(new Error("Configured portfolio render platform tab not found"));
          else resolve(tab);
        } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

class CdpClient {
  constructor(url) { this.url=url; this.ws=null; this.id=0; }
  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve,reject)=>{this.ws.once("open",resolve);this.ws.once("error",reject);});
  }
  call(method, params={}) {
    return new Promise((resolve,reject)=>{
      const id=++this.id;
      const handler=raw=>{const msg=JSON.parse(raw);if(msg.id!==id)return;this.ws.off("message",handler);msg.error?reject(msg.error):resolve(msg.result);};
      this.ws.on("message",handler);this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  close(){try{this.ws?.close();}catch(_){}}
}

function buildExpression(project, founder, company, width, height) {
  const source = [
    "(() => {",
    "const canvas=document.createElement('canvas');",
    "canvas.width=__WIDTH__; canvas.height=__HEIGHT__;",
    "const ctx=canvas.getContext('2d');",
    "const project=__PROJECT__; const founder=__FOUNDER__; const company=__COMPANY__;",
    "const bg=ctx.createLinearGradient(0,0,canvas.width,canvas.height);",
    "bg.addColorStop(0,'#0f172a'); bg.addColorStop(.55,'#1e1b4b'); bg.addColorStop(1,'#020617');",
    "ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);",
    "ctx.strokeStyle='rgba(255,255,255,.05)';",
    "for(let x=40;x<canvas.width;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}",
    "for(let y=40;y<canvas.height;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}",
    "ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=2;ctx.strokeRect(50,50,canvas.width-100,canvas.height-100);",
    "ctx.font='700 22px system-ui';ctx.fillStyle='#60a5fa';ctx.fillText('PORTFOLIO SHOWCASE',80,120);",
    "ctx.font='500 20px system-ui';ctx.fillStyle='rgba(255,255,255,.65)';ctx.fillText(String(project.category||'').toUpperCase(),80,155);",
    "const wrap=(text,maxWidth,lineHeight,startY)=>{const words=String(text||'').split(/\\s+/);let line='',y=startY;for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxWidth&&line){ctx.fillText(line,80,y);line=word;y+=lineHeight;}else line=test;}if(line)ctx.fillText(line,80,y);return y;};",
    "ctx.font='700 42px system-ui';ctx.fillStyle='#fff';",
    "const titleY=wrap(project.name+' — '+project.title,800,54,240);",
    "ctx.font='400 24px system-ui';ctx.fillStyle='rgba(255,255,255,.78)';",
    "const descY=wrap(project.description,800,34,titleY+55);",
    "const metrics=Array.isArray(project.metrics)?project.metrics.join(' • '):'';",
    "const boxY=descY+45;ctx.fillStyle='rgba(255,255,255,.05)';ctx.fillRect(80,boxY,840,75);",
    "ctx.font='700 20px system-ui';ctx.fillStyle='#60a5fa';ctx.fillText('KEY IMPACT:',105,boxY+45);",
    "ctx.font='500 20px system-ui';ctx.fillStyle='#f1f5f9';ctx.fillText(metrics.slice(0,92),250,boxY+45);",
    "ctx.font='700 18px system-ui';ctx.fillStyle='rgba(255,255,255,.55)';ctx.fillText('CORE TECHNOLOGIES',80,boxY+130);",
    "let x=80,y=boxY+155;",
    "for(const tech of (project.technologies||[]).slice(0,7)){ctx.font='600 18px system-ui';const w=ctx.measureText(tech).width+36;if(x+w>900){x=80;y+=55;}ctx.fillStyle='rgba(255,255,255,.08)';ctx.beginPath();ctx.roundRect(x,y,w,42,8);ctx.fill();ctx.fillStyle='#fff';ctx.fillText(tech,x+18,y+27);x+=w+16;}",
    "ctx.strokeStyle='rgba(255,255,255,.1)';ctx.beginPath();ctx.moveTo(80,880);ctx.lineTo(920,880);ctx.stroke();",
    "ctx.font='700 20px system-ui';ctx.fillStyle='#fff';ctx.fillText(founder.name||company.name||'Portfolio',80,920);",
    "ctx.font='400 18px system-ui';ctx.fillStyle='#60a5fa';ctx.fillText(founder.role||company.name||'',80,946);",
    "if(founder.github){ctx.font='500 18px system-ui';ctx.fillStyle='rgba(255,255,255,.5)';ctx.fillText(founder.github.replace(/^https?:\\/\\//,''),690,930);}",
    "return canvas.toDataURL('image/png');",
    "})()"
  ].join("\n");
  return source.replace("__WIDTH__",JSON.stringify(width)).replace("__HEIGHT__",JSON.stringify(height))
    .replace("__PROJECT__",JSON.stringify(project)).replace("__FOUNDER__",JSON.stringify(founder)).replace("__COMPANY__",JSON.stringify(company));
}

async function generatePortfolioCards({projects=listProjects()}={}) {
  fs.mkdirSync(CONFIG.PORTFOLIO_GENERATED_DIR,{recursive:true});
  const tab=await getBrowserTab();const cdp=new CdpClient(tab.webSocketDebuggerUrl);await cdp.connect();
  const founder=knowledge.getFounderInfo();const company=knowledge.getCompanyInfo();
  try {
    for(const project of projects){
      const result=await cdp.call("Runtime.evaluate",{expression:buildExpression(project,founder,company,CONFIG.PORTFOLIO_CARD_WIDTH,CONFIG.PORTFOLIO_CARD_HEIGHT),returnByValue:true});
      const data=result?.result?.value;if(!data)throw new Error("Portfolio renderer returned no image for "+project.id);
      fs.writeFileSync(resolveAssetPath(project),data.replace(/^data:image\/png;base64,/,""),"base64");
    }
  } finally { cdp.close(); }
  return projects.map(p=>({id:p.id,path:resolveAssetPath(p)}));
}
module.exports={generatePortfolioCards};
