const h=require('./atlas-test-helpers');
const {assert,fs,path,FIXTURES,DS1,TS1,DISCLAIMER,requireFile,baseline,maskVolatile,makeScratch,mutateScratch,run,runCases}=h;
const project=path.join(FIXTURES,'project');
const commands=[
 ['C1',['classify','--traits',TS1,'--json']],
 ['C2',['verify','rate-limiting','--auto',project,'--json']],
 ['C3',['verify','rate-limiting','--auto',project]],
 ['C4',['report','--areas','input-validation,rate-limiting','--project',project,'--format','json']],
 ['C5',['report','--areas','input-validation,rate-limiting','--project',project]],
 ['C6',['build',DS1,'--json']],
 ['C7',['build',DS1,'--compact','--json']],
];
function ready(){requireFile('content/index/atlas.json','content/index/atlas.json missing');requireFile('content/index/atlas-entry-points.json','content/index/atlas-entry-points.json missing');}
function assertNoAtlasKeys(v){if(Array.isArray(v))return v.forEach(assertNoAtlasKeys);if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){assert.ok(!['atlas','atlas_count'].includes(k),`unexpected ${k} key`);assertNoAtlasKeys(x);}}
function isJson(args){return args.includes('--json')||args.includes('json');}
function hasDisclaimer(v){if(typeof v==='string')return v.includes(DISCLAIMER);if(Array.isArray(v))return v.some(hasDisclaimer);if(v&&typeof v==='object')return Object.values(v).some(hasDisclaimer);return false;}
function withScratch(mutation,fn){const dir=makeScratch();try{if(mutation)mutateScratch(dir,mutation);fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function checkCatalogMutation(mutation,code){withScratch(mutation,(dir)=>{for(const [label,args] of commands){const got=run(args,{root:dir});const old=baseline(`fs-${label.toLowerCase()}`);assert.strictEqual(got.status,old.status,`${label} exit`);assert.strictEqual(maskVolatile(got.stdout),maskVolatile(old.stdout),`${label} did not reproduce the pre-feature baseline`);assert.ok(!got.stdout.includes('ATLAS')&&!got.stdout.includes('AML.'),`${label} leaked ATLAS`);if(label==='C6'||label==='C7'){assert.ok(!got.stdout.includes('## Threat model (MITRE ATLAS)'));assert.ok(!got.stdout.includes('aigis threats'));assert.ok(!got.stdout.includes('Never report a gap as handled'));}if(isJson(args))assertNoAtlasKeys(JSON.parse(got.stdout));assert.strictEqual(got.stderr,`aigis: ATLAS catalog unavailable (catalog ${code}); ATLAS output omitted\n`);}});}
function checkEntryMutation(mutation){withScratch(mutation,(dir)=>{const healthy=makeScratch();try{for(const [label,args] of commands){const got=run(args,{root:dir}),want=run(args,{root:healthy});assert.strictEqual(got.status,0,`${label} exit`);assert.strictEqual(maskVolatile(got.stdout),maskVolatile(want.stdout),`${label} changed for broken entry points`);assert.strictEqual(got.stderr,'');assert.ok(isJson(args)?hasDisclaimer(JSON.parse(got.stdout)):got.stdout.includes(DISCLAIMER),`${label} disclaimer missing`);}}finally{fs.rmSync(healthy,{recursive:true,force:true});}});}

runCases([
 ['T-FS-01',()=>{ready();checkCatalogMutation('catalog-missing','missing');}],
 ['T-FS-02',()=>{ready();checkCatalogMutation('catalog-corrupt','corrupt');checkCatalogMutation('catalog-nokey','corrupt');}],
 ['T-FS-03',()=>{ready();checkCatalogMutation('catalog-sha','pin-mismatch');checkCatalogMutation('catalog-version','pin-mismatch');}],
 ['T-FS-04',()=>{ready();for(const m of ['entry-missing','entry-corrupt','entry-version','entry-badtech','entry-badtrait'])checkEntryMutation(m);}],
 ['T-FS-05',()=>{ready();withScratch(null,(dir)=>{for(const [label,args] of commands){const got=run(args,{root:dir}),want=run(args);assert.strictEqual(got.status,want.status,`${label} exit`);assert.strictEqual(maskVolatile(got.stdout),maskVolatile(want.stdout),`${label} stdout`);assert.strictEqual(got.stderr,want.stderr,`${label} stderr`);}});withScratch('catalog-missing',(dir)=>{for(const fmt of ['json','markdown']){const args=['report','--areas','input-validation,rate-limiting,bias-monitoring','--project',project,'--format',fmt];const got=run(args,{root:dir});assert.strictEqual(got.stderr.trim().split('\n').length,1);}});}],
]);
