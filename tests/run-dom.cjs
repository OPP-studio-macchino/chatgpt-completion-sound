// Optional DOM-model regression suite. This does not launch a browser or emulate layout.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parseHTML}=require(require.resolve('linkedom',{paths:[process.env.CHAPPY_DOM_DEPENDENCIES || __dirname]}));
const {document,window}=parseHTML(fs.readFileSync(path.join(__dirname,'dom.html'),'utf8'));
window.HTMLElement.prototype.getClientRects=function(){return this.style.display==='none'?[]:[{}];};
window.getComputedStyle=e=>({display:e.style.display||'block',visibility:e.style.visibility||'visible',opacity:e.style.opacity||'1'});
const context=vm.createContext({document,console});
for(const file of ['../extension/compatibility.js','../extension/detector.js','../extension/dom-reader.js','dom-tests.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),context,{filename:file});
document.getElementById('run').onclick();
const results=document.getElementById('results').textContent;
console.log(results);
if(results.includes('FAIL ')&&!results.endsWith('FAIL 0'))process.exitCode=1;
