const matter=require('gray-matter');
const h=require('./atlas-test-helpers');
const {assert,fs,path,ROOT,AREA_IDS,NEW_AREA_IDS,sha256,baseline,json,requireFile,requireGold,runCases}=h;
const {classify,ALL_TRAITS}=require('../lib/classify');
const dev=json('build/atlas/evals/dev.json').descriptions;
const seeded=[...new Set(requireGold('entry-points').rows.filter((r)=>r.decision==='include').map((r)=>r.trait))].sort();
const FIXED={TS1:['uses-llm','accepts-user-input','uses-rag'],TS2:['uses-llm','is-agentic','accepts-user-input','is-external','uses-thirdparty-api'],TS3:['is-internal'],TS4:seeded,TS5:['uses-llm','accepts-user-input','uses-rag','jurisdiction-eu']};
const MATRIX=[...dev.map((d)=>[`dev-${d.id}`,d.ground_truth_traits]),...Object.entries(FIXED),...ALL_TRAITS.map((t)=>[`trait-${t}`,[t]])];
const hashes=baseline('routing-state'),oldAreas=baseline('area-state');
function routeSubset(out){return {risk_tier:out.risk_tier,reason:out.reason,implement_files:out.implement_files.filter((id)=>!NEW_AREA_IDS.includes(id)),templates:out.templates,guardrails_fired:out.guardrails_fired,warnings:out.warnings};}
function areaFrontmatter(id){return matter(fs.readFileSync(requireFile(`content/skills/areas/${id}.md`,`${id} area file missing`),'utf8')).data.controls;}
function oldControls(areas){const out={owasp:new Set(),nist:new Set(),iso:new Set()};for(const id of areas.filter((x)=>AREA_IDS.includes(x))){for(const value of oldAreas[id].controls.owasp||[])out.owasp.add(value);for(const value of oldAreas[id].controls.nist||[])out.nist.add(value);for(const value of oldAreas[id].controls.iso42001||[])out.iso.add(value);}return Object.fromEntries(Object.entries(out).map(([k,v])=>[k,[...v].sort()]));}
function expectedControls(out,traits){const expected=oldControls(out.implement_files);if(traits.includes('is-agentic'))for(const id of NEW_AREA_IDS){const controls=areaFrontmatter(id);for(const value of controls.owasp||[])expected.owasp.push(value);for(const value of controls.nist||[])expected.nist.push(value);for(const value of controls.iso42001||[])expected.iso.push(value);}for(const key of Object.keys(expected))expected[key]=[...new Set(expected[key])].sort();return expected;}
runCases([
 ['T-RT-01',()=>{for(const trait of ALL_TRAITS){const files=classify([trait]).implement_files;for(const id of NEW_AREA_IDS)assert.strictEqual(files.includes(id),trait==='is-agentic',`${trait}: ${id}`);}}],
 ['T-RT-02',()=>{for(const [label,traits] of MATRIX){const out=classify(traits),agentic=traits.includes('is-agentic');for(const id of NEW_AREA_IDS)assert.strictEqual(out.implement_files.includes(id),agentic,`${label}: ${id} routing`);assert.strictEqual(sha256(JSON.stringify(routeSubset(out))),hashes[label],`${label} changed beyond the routing delta`);}}],
 ['T-RT-03',()=>{for(const id of NEW_AREA_IDS)requireFile(`content/skills/areas/${id}.md`,`${id} area file missing`);for(const [label,traits] of MATRIX){const out=classify(traits),expected=expectedControls(out,traits);for(const fw of ['owasp','nist','iso'])assert.deepStrictEqual(out.controls[fw],expected[fw],`${label} ${fw} controls delta`);if(traits.includes('is-eu-high-risk')&&!traits.includes('is-agentic'))assert.deepStrictEqual(out.controls,{...out.controls,owasp:expected.owasp,nist:expected.nist,iso:expected.iso},`${label} EU fallback changed controls`);}}],
]);
