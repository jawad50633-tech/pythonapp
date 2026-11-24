let course=null, currentIndex=0, pyodide=null, pyodidePromise=null;
const completed=new Set(JSON.parse(localStorage.getItem('py-learning-completed')||'[]'));
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function sectionGroups(){const groups=new Map();course.lessons.forEach((l,i)=>{if(!groups.has(l.section))groups.set(l.section,[]);groups.get(l.section).push({...l,index:i})});return groups}
function updateProgress(){const total=course.lessons.length,done=completed.size,pct=Math.round(done/total*100);$('progressText').textContent=pct+'%';$('progressBar').style.width=pct+'%';$('completedText').textContent=`${done} of ${total} lessons completed`}
function renderNav(filter=''){
 const nav=$('lessonNav');nav.innerHTML='';const q=filter.toLowerCase();
 for(const [section,items] of sectionGroups()){
  const visible=items.filter(x=>(x.title+' '+x.section).toLowerCase().includes(q));if(!visible.length)continue;
  const wrap=document.createElement('div');wrap.className='nav-section';const h=document.createElement('div');h.className='nav-section-title';h.textContent=section;wrap.appendChild(h);
  visible.forEach(item=>{const b=document.createElement('button');b.className='nav-lesson'+(item.index===currentIndex?' active':'')+(completed.has(item.number)?' done':'');b.innerHTML=`<span class="nav-number">${completed.has(item.number)?'✓':item.number}</span><span class="nav-name">${esc(item.title)}</span>`;b.addEventListener('click',()=>{currentIndex=item.index;renderLesson();$('sidebar').classList.remove('open')});wrap.appendChild(b)});nav.appendChild(wrap);
 }
 if(!nav.children.length)nav.innerHTML='<div class="empty-state">No lessons found.</div>';
}
function renderMarkdown(s){const raw=window.marked?marked.parse(s):`<pre>${esc(s)}</pre>`;return window.DOMPurify?DOMPurify.sanitize(raw):raw}
function renderLesson(){
 const l=course.lessons[currentIndex];if(!l)return;
 $('crumbTitle').textContent=l.section;$('sectionPill').textContent=l.section.toUpperCase();$('lessonCount').textContent=`LESSON ${currentIndex+1} OF ${course.lessons.length}`;$('lessonTitle').textContent=l.title;$('lessonSubtitle').textContent=l.number===50?'Apply your Python skills in a complete capstone project.':'Work through the explanation, examples and exercises in this lesson.';
 const content=$('lessonContent');content.innerHTML='';let codeIndex=0;
 l.blocks.forEach((block)=>{
  if(block.type==='markdown'){const div=document.createElement('div');div.className='markdown-block';div.innerHTML=renderMarkdown(block.content);content.appendChild(div)}
  else if(block.type==='code'){
   const id=`code-${currentIndex}-${codeIndex++}`;const card=document.createElement('section');card.className='code-card';card.innerHTML=`<div class="code-toolbar"><span class="code-label">PYTHON CODE · CELL ${codeIndex}</span><div class="code-actions"><button class="small-btn reset-btn" type="button">Reset</button><button class="small-btn run-btn" type="button">▶ Run code</button></div></div><textarea class="code-editor" spellcheck="false" aria-label="Python code editor">${esc(block.content)}</textarea><div class="output-wrap"><div class="output-head"><span>OUTPUT</span><span class="output-state">NOT RUN</span></div><pre class="code-output">Run this cell to see the result.</pre></div>`;
   const editor=card.querySelector('textarea'),out=card.querySelector('.code-output'),state=card.querySelector('.output-state');
   card.querySelector('.run-btn').addEventListener('click',async()=>{state.textContent='RUNNING';out.classList.remove('error');out.textContent='';try{await ensurePyodide();const result=await executePython(editor.value);out.textContent=result||'(Code executed successfully with no printed output.)';state.textContent='FINISHED'}catch(e){out.textContent=e.message||String(e);out.classList.add('error');state.textContent='ERROR'}});
   card.querySelector('.reset-btn').addEventListener('click',()=>{editor.value=block.content;out.textContent='Cell reset. Run it to see the result.';out.classList.remove('error');state.textContent='NOT RUN'});
   editor.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();card.querySelector('.run-btn').click()}if(e.key==='Tab'){e.preventDefault();const a=editor.selectionStart,b=editor.selectionEnd;editor.setRangeText('    ',a,b,'end')}});
   content.appendChild(card);
  }
 });
 const isDone=completed.has(l.number);$('completeBtn').classList.toggle('done',isDone);$('completeBtn').textContent=isDone?'✓ Completed':'✓ Mark complete';$('prevBtn').disabled=currentIndex===0;$('nextBtn').disabled=currentIndex===course.lessons.length-1;$('nextBtn').textContent=currentIndex===course.lessons.length-1?'Course complete':'Next lesson →';renderNav($('searchInput').value);updateProgress();window.scrollTo({top:0,behavior:'smooth'});
}
async function ensurePyodide(){
 if(pyodide)return pyodide;
 if(pyodidePromise)return pyodidePromise;
 if(typeof loadPyodide!=='function')throw new Error('Could not load Pyodide. Check your internet connection and reload the page.');
 setRuntime('Loading Python runtime…',false);$('runtimeDetail').textContent='Downloading Python runtime…';
 pyodidePromise=loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'}).then(p=>{pyodide=p;pyodide.setStdin({stdin:()=>{const v=window.prompt('Python input() requested. Enter a value:');return v===null?null:new TextEncoder().encode(v+'\n')}});setRuntime('Python interpreter ready',true);$('runtimeDetail').textContent='Python is running in your browser';$('loadRuntimeBtn').textContent='Python runtime loaded';toast('Python interpreter is ready');return p}).catch(e=>{pyodidePromise=null;setRuntime('Interpreter failed to load',false);$('runtimeDetail').textContent='Load failed — check your connection';throw e});
 return pyodidePromise;
}
function setRuntime(text,ready){$('runtimeStatus').classList.toggle('ready',ready);$('runtimeStatus').querySelector('span').textContent=text;$('runtimeDetail').textContent=text}
async function executePython(code){
 if(/\bimport\s+tkinter|\bfrom\s+tkinter/i.test(code))throw new Error('Tkinter is a desktop GUI library and is not supported inside a browser-based Python runtime. Read and study this code here; run it on a computer with desktop Python to open its window.');
 if(/\b(import|from)\s+pandas\b/.test(code)){$('runtimeDetail').textContent='Loading pandas package…';await pyodide.loadPackage('pandas')}
 if(/\b(import|from)\s+numpy\b/.test(code)){await pyodide.loadPackage('numpy')}
 let output='';pyodide.setStdout({batched:s=>{output+=s+'\n'}});pyodide.setStderr({batched:s=>{output+=s+'\n'}});
 try{await pyodide.runPythonAsync(code)}catch(e){throw new Error(String(e))}finally{$('runtimeDetail').textContent='Python is running in your browser'}
 return output.trimEnd();
}
async function init(){const r=await fetch('lessons.json');if(!r.ok)throw new Error('Could not load lessons.json. Keep all website files in the same folder.');course=await r.json();$('searchInput').addEventListener('input',e=>renderNav(e.target.value));$('completeBtn').addEventListener('click',()=>{const n=course.lessons[currentIndex].number;if(completed.has(n))completed.delete(n);else completed.add(n);localStorage.setItem('py-learning-completed',JSON.stringify([...completed]));renderLesson();toast(completed.has(n)?'Lesson marked complete':'Completion removed')});$('prevBtn').addEventListener('click',()=>{if(currentIndex>0){currentIndex--;renderLesson()}});$('nextBtn').addEventListener('click',()=>{if(currentIndex<course.lessons.length-1){currentIndex++;renderLesson()}});$('loadRuntimeBtn').addEventListener('click',()=>ensurePyodide().catch(e=>toast(e.message)));$('menuBtn').addEventListener('click',()=>$('sidebar').classList.toggle('open'));renderLesson()}
init().catch(e=>{document.getElementById('lessonContent').innerHTML=`<div class="notice">${esc(e.message)}</div>`});
