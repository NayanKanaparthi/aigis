const h=require('./atlas-test-helpers');
const {assert,read,json,runCases}=h;
runCases([['T-REL-01',()=>{const lock=json('package-lock.json');const found={'package.json':json('package.json').version,'package-lock.json':lock.version,'package-lock root':lock.packages[''].version,'bin/aigis.js':(read('bin/aigis.js').match(/\.version\('([^']+)'\)/)||[])[1],'cli-python/pyproject.toml':(read('cli-python/pyproject.toml').match(/^version\s*=\s*"([^"]+)"/m)||[])[1]};for(const [file,version] of Object.entries(found))assert.strictEqual(version,'2.2.0',`${file} version`);}]]);
