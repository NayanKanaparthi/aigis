const h=require('./atlas-test-helpers');
const {assert,fs,os,path,ROOT,FIXTURES,AREA_IDS,DS1,TS1,TS2,baseline,maskVolatile,stripAtlas,requireFile,sha256,run,runCases}=h;
const {detectTraitsFromText}=require('../lib/keywords');
const {classify}=require('../lib/classify');
const {buildBrief}=require('../lib/build');
function ready(){requireFile('content/index/atlas.json','content/index/atlas.json missing');}
function clean(name,text){
 if(name.startsWith('reg-classify')){const obj=JSON.parse(text);return `${JSON.stringify(stripAtlas(obj),null,2)}\n`;}
 if(name==='reg-get-input-validation')return text.replace(/^  atlas: \[[^\n]*\]\n/m,'');
 if(name==='reg-build-list')return text.replace(/\nThreat model:\n  aigis threats --traits [^\n]+\n?$/,'\n');
 if(name==='reg-help')return text.split('\n').filter((line)=>!/^\s*threats\b/.test(line)).join('\n');
 if(name==='reg-search-list')return text.split('\n').filter((line)=>!line.includes('threat-model')).join('\n');
 return text;
}
const matrix={
 'reg-classify-ts2':['classify','--traits',TS2,'--json'],'reg-classify-ds1':['classify',DS1,'--json'],'reg-get-input-validation':['get','input-validation'],'reg-get-rag-no-frontmatter':['get','rag-security','--no-frontmatter'],'reg-verify-pii':['verify','pii-handling'],'reg-template-impact':['template','ai-impact-assessment'],'reg-workflow-fastapi':['workflow','fastapi-llm'],'reg-infra-rate':['infra','rate-limiting'],'reg-audit-ts1':['audit','--traits',TS1,'--json'],'reg-search-list':['search','--list'],'reg-traits':['traits'],'reg-build-list':['build',DS1,'--list'],'reg-help':['--help'],
};
runCases([
 ['T-REG-01',()=>{for(const [name,args] of Object.entries(matrix)){const got=run(args),old=baseline(name);assert.strictEqual(got.status,old.status,`${name} exit changed`);assert.strictEqual(maskVolatile(clean(name,got.stdout)),maskVolatile(old.stdout),`${name} changed beyond allowed additions`);}ready();}],
 ['T-REG-02',()=>{for(const area of AREA_IDS){const got=run(['get',area]),old=baseline(`reg-get-area-${area}`);assert.strictEqual(got.status,old.status);const added=got.stdout.split('\n').filter((line)=>/^  atlas: \[.*\]$/.test(line));assert.strictEqual(added.length,1,`${area} must add exactly one atlas line`);assert.strictEqual(got.stdout.replace(`${added[0]}\n`,''),old.stdout,`${area} changed beyond atlas line`);}ready();}],
 ['T-REG-03',()=>{const old=baseline('static-files'),state=baseline('dev-state'),dev=JSON.parse(fs.readFileSync(path.join(FIXTURES,'dev.json'),'utf8')).descriptions;assert.strictEqual(sha256(fs.readFileSync(path.join(ROOT,'content/resolvers/triggers.json'))),old.triggers_sha256);for(const item of dev)assert.deepStrictEqual(detectTraitsFromText(item.text),state[item.id].detection,item.id);ready();}],
 ['T-REG-04',()=>{const state=baseline('dev-state'),classifyPath=baseline('dev-classify-path'),dev=JSON.parse(fs.readFileSync(path.join(FIXTURES,'dev.json'),'utf8')).descriptions;for(const item of dev){assert.deepStrictEqual(classify(item.traits),state[item.id].classify_ground_truth,`${item.id} ground-truth classify`);const r=run(['classify',item.text,'--json']);assert.strictEqual(r.status,classifyPath[item.id].status,`${item.id} classify exit`);if(r.status===0)assert.deepStrictEqual(JSON.parse(r.stdout).implement_files,classifyPath[item.id].implement_files,`${item.id} classify path`);if(state[item.id].build.error){assert.throws(()=>buildBrief({description:item.text,mode:'compact',timestamp:new Date('2026-04-19T00:00:00.000Z')}),new RegExp(state[item.id].build.error.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`${item.id} build error`);}else{const built=buildBrief({description:item.text,mode:'compact',timestamp:new Date('2026-04-19T00:00:00.000Z')});assert.deepStrictEqual(built.meta.areas,state[item.id].build.areas,`${item.id} build path`);}}ready();}],
 ['T-REG-05',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-init-'));try{const r=run(['init','cursor'],{cwd:dir});assert.strictEqual(r.status,0,r.stderr);const current=fs.readFileSync(path.join(dir,'.cursorrules'),'utf8');const old=baseline('init-cursor');const {renderResolverBlock}=require('../lib/init');assert.strictEqual(renderResolverBlock(),old.resolver_block);assert.strictEqual(sha256(renderResolverBlock()),old.resolver_sha256);const oldCore=baseline('static-files').core,newCore=fs.readFileSync(path.join(ROOT,'content/skills/core.md'),'utf8');assert.strictEqual(current.length-old.length,newCore.length-oldCore.length);}finally{fs.rmSync(dir,{recursive:true,force:true});}ready();}],
]);
