import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../context';

export const UI_RESOURCES = {
  start: 'ui://clipsubtitles/start-v1.html',
  styles: 'ui://clipsubtitles/styles-v1.html',
  approval: 'ui://clipsubtitles/export-approval-v1.html',
  progress: 'ui://clipsubtitles/progress-v1.html',
  editor: 'ui://clipsubtitles/editor-v1.html',
} as const;

type UiKind = keyof typeof UI_RESOURCES;

const DESCRIPTIONS: Record<UiKind, string> = {
  start: 'Choose a video and begin a ClipSubtitles caption project.',
  styles: 'Compare caption looks and apply one to the current project.',
  approval: 'Review the fixed export details and explicitly approve the credit cost.',
  progress: 'Follow caption work and download completed files.',
  editor: 'Review caption words and styles in a focused fullscreen workspace.',
};

export function registerClipSubtitlesUi(server: McpServer, ctx: AppContext): void {
  const apiOrigin = new URL(ctx.config.apiPublicUrl).origin;
  const webOrigin = new URL(ctx.config.webPublicUrl).origin;
  for (const [kind, uri] of Object.entries(UI_RESOURCES) as Array<[UiKind, string]>) {
    server.registerResource(
      `clipsubtitles-${kind}`,
      uri,
      {
        title: `ClipSubtitles ${kind}`,
        description: DESCRIPTIONS[kind],
        mimeType: 'text/html;profile=mcp-app',
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: 'text/html;profile=mcp-app',
            text: widgetHtml(kind, ctx.config.webPublicUrl),
            _meta: {
              ui: {
                prefersBorder: kind === 'start' || kind === 'approval' || kind === 'progress',
                csp: {
                  connectDomains: [apiOrigin],
                  resourceDomains: [apiOrigin, webOrigin],
                },
              },
              'openai/widgetDescription': DESCRIPTIONS[kind],
              'openai/widgetPrefersBorder':
                kind === 'start' || kind === 'approval' || kind === 'progress',
              'openai/widgetCSP': {
                connect_domains: [apiOrigin],
                resource_domains: [apiOrigin, webOrigin],
                redirect_domains: [webOrigin],
              },
            },
          },
        ],
      }),
    );
  }
}

function widgetHtml(kind: UiKind, webPublicUrl: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{
  color-scheme:light dark;
  --bg:light-dark(#fffdf9,#181613);
  --soft:light-dark(#f5f1eb,#211e1a);
  --soft-strong:light-dark(#ebe5dc,#2a2621);
  --line:light-dark(#ddd6cc,#403a32);
  --ink:light-dark(#191510,#f7f1e8);
  --muted:light-dark(#625a51,#b8aea2);
  --accent:#db7620;
  --accent-ink:#211005;
  --ok:light-dark(#3f7d45,#78b77a);
  --danger:light-dark(#a94237,#df776d);
  font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}
*{box-sizing:border-box}
body{margin:0;background:transparent;color:var(--ink);font-size:14px;line-height:1.5}
button,input{font:inherit}
h1,h2,h3,p{margin:0}
h1{font-size:24px;font-weight:650;line-height:1.18;letter-spacing:-.025em;text-wrap:balance}
.shell{width:100%;padding:16px}
.kind-start,.kind-approval,.kind-progress{max-width:720px;margin-inline:auto}
.kind-styles{max-width:980px;margin-inline:auto}
.card{overflow:hidden;border:1px solid var(--line);border-radius:12px;background:var(--bg)}
.kind-editor .card,.kind-styles .card{border:0;background:transparent}
.head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px;border-bottom:1px solid var(--line)}
.kind-editor .head,.kind-styles .head{padding-inline:0}
.brand{display:flex;align-items:center;gap:10px;font-weight:650;letter-spacing:-.01em}
.mark{position:relative;width:32px;height:32px;flex:0 0 auto;border-radius:8px;background:var(--ink);color:transparent}
.mark:before,.mark:after{content:"";position:absolute;top:7px;width:12px;height:18px;border:4px solid}
.mark:before{left:6px;border-color:#f2e9df transparent #f2e9df #f2e9df;border-radius:6px 0 0 6px}
.mark:after{right:5px;border-color:var(--accent) var(--accent) var(--accent) transparent;border-radius:0 6px 6px 0}
.mark b{display:none}
.body{padding:24px}
.kind-editor .body,.kind-styles .body{padding-inline:0}
.stack{display:grid;gap:16px}
.row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.between{justify-content:space-between}
.muted{color:var(--muted)}
.eyebrow{margin-bottom:4px;color:var(--muted);font-size:12px;font-weight:600;letter-spacing:0;text-transform:none}
.pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:6px;padding:4px 8px;color:var(--muted);font-size:11px;font-weight:550}
.btn{display:inline-flex;min-height:40px;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);padding:0 16px;font-weight:600;cursor:pointer;transition:border-color .18s,background-color .18s,transform .12s}
.btn:hover{border-color:color-mix(in srgb,var(--ink),transparent 55%);background:var(--soft)}
.btn:active{transform:translateY(1px)}
.btn:focus-visible,.style:focus-visible,.page:focus-visible,.word:focus-visible,input:focus-visible,.download:focus-visible{outline:3px solid color-mix(in srgb,var(--accent),transparent 48%);outline-offset:2px}
.btn.primary{border-color:var(--accent);background:var(--accent);color:var(--accent-ink)}
.btn.primary:hover{background:color-mix(in srgb,var(--accent),#fff 10%)}
.btn.danger{border-color:transparent;background:transparent;color:var(--danger)}
.btn:disabled{cursor:not-allowed;opacity:.48}
.dropzone{display:grid;min-height:160px;place-items:center;border:1px solid var(--line);border-radius:8px;background:var(--soft);padding:24px;text-align:center}
.drop-icon{display:grid;width:48px;height:48px;place-items:center;margin:0 auto 12px;border-radius:8px;background:var(--ink);color:var(--bg);font-size:24px}
.styles{display:grid;grid-auto-columns:minmax(190px,1fr);grid-auto-flow:column;gap:16px;overflow-x:auto;padding:2px 2px 10px;scroll-snap-type:x proximity}
.style{display:grid;gap:10px;min-width:190px;scroll-snap-align:start;border:1px solid var(--line);border-radius:8px;background:var(--bg);padding:10px;text-align:left;color:var(--ink);cursor:pointer;transition:border-color .18s,background-color .18s}
.style:hover{background:var(--soft)}
.style[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent),transparent 72%)}
.style-preview{display:grid;aspect-ratio:4/3;place-items:end center;border-radius:6px;background:radial-gradient(circle at 65% 20%,#a98b70 0,transparent 34%),linear-gradient(145deg,#70513c,#1b1713);padding:14px;color:#fff;font-weight:800;text-align:center;text-shadow:0 2px 5px #000}
.style-preview.bold-pop{font-size:19px;text-transform:uppercase;-webkit-text-stroke:1px #000}
.style-preview.karaoke b{color:#ffd43b}.style-preview.minimal{font-weight:500}
.meta{display:grid}.approval-sheet{border-radius:8px;background:var(--soft);padding:8px 16px}
.kv{display:flex;justify-content:space-between;gap:24px;padding:11px 0;border-bottom:1px solid var(--line)}
.kv:last-child{border-bottom:0}.kv strong{font-variant-numeric:tabular-nums;text-align:right}
.notice{border-left:3px solid var(--line);padding:10px 12px;background:var(--soft);color:var(--muted);font-size:12px}
.stages{display:grid;gap:0}.stage{position:relative;display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:12px;min-height:52px;align-items:start}
.stage:not(:last-child):after{content:"";position:absolute;left:9px;top:28px;bottom:0;width:1px;background:var(--line)}
.stage .circle{z-index:1;width:20px;height:20px;border:2px solid var(--line);border-radius:50%;background:var(--bg)}
.stage.done .circle{border-color:var(--ok);background:var(--ok)}
.stage.active .circle{border-color:var(--accent);background:var(--accent)}
.stage-detail{min-width:0}.stage-progress{height:5px;overflow:hidden;margin-top:9px;border-radius:3px;background:var(--line)}
.stage-progress i{display:block;height:100%;border-radius:inherit;background:var(--accent);transition:width .3s}
.files{display:grid;gap:8px}.download{display:flex;align-items:center;justify-content:space-between;gap:12px;border:0;border-radius:8px;background:var(--soft);padding:12px;color:var(--ink);text-decoration:none}
.editor{display:grid;grid-template-columns:minmax(180px,.58fr) minmax(360px,1.55fr) minmax(260px,.88fr);gap:0;min-height:560px;overflow:hidden;border:1px solid var(--line);border-radius:8px;background:var(--bg)}
.panel{min-width:0;border:0;border-right:1px solid var(--line);border-radius:0;background:var(--bg);padding:16px}
.panel:last-child{border-right:0}.pages{display:grid;gap:6px}
.page{width:100%;border:0;border-left:3px solid transparent;border-radius:4px;background:transparent;padding:9px 10px;text-align:left;color:var(--ink);cursor:pointer}
.page:hover{background:var(--soft)}.page.active{border-left-color:var(--accent);background:var(--soft)}
.stage-video{display:grid;min-height:100%;place-items:center;overflow:hidden;border-right:1px solid var(--line);background:#0c0a08}
.stage-video video{width:100%;height:100%;max-height:600px;object-fit:contain}
.words{display:flex;flex-wrap:wrap;gap:6px}.word{border:0;border-radius:4px;background:var(--soft);padding:5px 8px;color:var(--ink);cursor:pointer}
.word:hover{background:var(--soft-strong)}
input{width:100%;height:40px;border:1px solid var(--line);border-radius:6px;background:var(--soft);color:var(--ink);padding:0 10px}
.error{color:var(--danger)}
@media(max-width:720px){.shell{padding:8px}.head{padding:14px 16px}.body{padding:16px}.kind-editor .head,.kind-editor .body,.kind-styles .head,.kind-styles .body{padding-inline:8px}.styles{grid-auto-columns:minmax(160px,80%)}.editor{grid-template-columns:1fr;min-height:auto}.editor .pages-panel{display:none}.stage-video{min-height:380px;border-right:0;border-bottom:1px solid var(--line)}.panel{border-right:0}.row .btn{flex:1 1 auto}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}
</style></head><body><main id="app" class="shell kind-${kind}"><div class="card"><div class="head"><div class="brand"><span class="mark">C<b>S</b></span>ClipSubtitles</div><span id="state" class="pill">Loading…</span></div><div id="content" class="body"><p class="muted">Preparing the interface…</p></div></div></main>
<script>
const KIND=${JSON.stringify(kind)};const WEB=${JSON.stringify(webPublicUrl)};const content=document.getElementById('content');const state=document.getElementById('state');let output=window.openai&&window.openai.toolOutput?window.openai.toolOutput:null;let input=window.openai&&window.openai.toolInput?window.openai.toolInput:null;let currentVersion=null;let requestId=1;const pending=new Map();
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]})}
function request(method,params){const id=requestId++;window.parent.postMessage({jsonrpc:'2.0',id:id,method:method,params:params},'*');return new Promise(function(resolve,reject){pending.set(id,{resolve:resolve,reject:reject})})}
async function callTool(name,args){if(window.openai&&window.openai.callTool)return window.openai.callTool(name,args);return request('tools/call',{name:name,arguments:args})}
async function followUp(prompt){if(window.openai&&window.openai.sendFollowUpMessage)return window.openai.sendFollowUpMessage({prompt:prompt});return request('ui/message',{role:'user',content:[{type:'text',text:prompt}]})}
function notifyHeight(){requestAnimationFrame(function(){if(window.openai&&window.openai.notifyIntrinsicHeight)window.openai.notifyIntrinsicHeight({height:document.documentElement.scrollHeight})})}
function setStatus(label,tone){state.textContent=label;state.style.color=tone||''}
function render(next){output=next||output||{};if(KIND==='start')renderStart();if(KIND==='styles')renderStyles();if(KIND==='approval')renderApproval();if(KIND==='progress')renderProgress();if(KIND==='editor')renderEditor();enhanceDesign();notifyHeight()}
function enhanceDesign(){
  if(KIND==='start'){
    const selection=document.getElementById('selection');
    if(selection&&selection.textContent==='No video selected yet.'){
      selection.className='dropzone';
      selection.innerHTML='<div><span class="drop-icon">↑</span><strong>Choose a video to caption</strong><p class="muted" style="margin-top:4px">Upload a new clip or reuse one from your ChatGPT files.</p></div>';
    }
  }
  if(KIND==='styles'){
    const descriptions={clean:'Clear and balanced',bold_pop:'High-energy social captions',lower_third:'Polished and understated',karaoke:'Follows every spoken word',minimal:'Quiet and editorial'};
    document.querySelectorAll('.style').forEach(function(button){
      const label=button.querySelector('strong');const id=String(label&&label.textContent||'').toLowerCase().replace(/ /g,'_');
      if(label&&!button.querySelector('small')){const note=document.createElement('small');note.className='muted';note.textContent=descriptions[id]||'A distinct caption look';button.appendChild(note)}
    });
  }
  if(KIND==='approval'){
    const meta=document.querySelector('.meta');if(meta)meta.classList.add('approval-sheet');
  }
}
function renderStart(){setStatus('Ready to begin');content.innerHTML='<div class="stack"><div><p class="eyebrow">Start with a video</p><h1>Caption a clip with your AI</h1><p class="muted" style="margin-top:8px">Choose a video, then tell ChatGPT how you want the captions to look.</p></div><div id="selection" class="notice">No video selected yet.</div><div class="row"><button id="choose" class="btn primary">Choose video</button><button id="library" class="btn">File library</button></div><input id="fallback" type="file" accept="video/*" hidden></div>';const choose=document.getElementById('choose'),library=document.getElementById('library'),fallback=document.getElementById('fallback');choose.onclick=function(){fallback.click()};fallback.onchange=async function(){const file=fallback.files&&fallback.files[0];if(!file)return;try{choose.disabled=true;choose.textContent='Uploading…';if(!(window.openai&&window.openai.uploadFile))throw new Error('Upload is not available in this host.');const uploaded=await window.openai.uploadFile(file,{library:true});await createFromFile({fileId:uploaded.fileId,fileName:file.name,mimeType:file.type})}catch(error){showError(error)}finally{choose.disabled=false;choose.textContent='Choose video'}};library.onclick=async function(){try{if(!(window.openai&&window.openai.selectFiles))throw new Error('The file library is not available in this host.');const files=await window.openai.selectFiles();if(files&&files[0])await createFromFile(files[0])}catch(error){showError(error)}}}
async function createFromFile(file){const selection=document.getElementById('selection');selection.textContent=(file.fileName||'Selected video')+' · preparing project…';const fetched=await window.openai.getFileDownloadUrl({fileId:file.fileId});const result=await callTool('create_caption_project',{title:(file.fileName||'Untitled video').replace(/\\.[^.]+$/,''),file:{download_url:fetched.downloadUrl,file_id:file.fileId,mime_type:file.mimeType||'video/mp4',file_name:file.fileName||'video.mp4'}});const data=result.structuredContent||result;selection.innerHTML='<strong>'+esc(data.project&&data.project.title||'Video project created')+'</strong><br><span class="muted">Captions can start as soon as the import finishes.</span>';setStatus('Project created','var(--ok)');followUp('Continue captioning project '+(data.project&&data.project.id||'')+'. Poll the import if needed, then generate captions and show me the review UI.')}
function renderStyles(){const project=output.project||{};const presets=output.presets||[];currentVersion=project.version;setStatus('Review styles');content.innerHTML='<div class="stack"><div><p class="eyebrow">Choose a look</p><h1>'+esc(project.title||'Caption styles')+'</h1><p class="muted" style="margin-top:7px">Pick a starting point. You can still change individual details afterward.</p></div><div class="styles" id="styles"></div><p id="style-note" class="muted">Current style: '+esc(project.style&&project.style.preset||'custom')+'</p></div>';const list=document.getElementById('styles');presets.slice(0,8).forEach(function(preset){const id=preset.preset;const button=document.createElement('button');button.className='style';button.setAttribute('aria-pressed',String(project.style&&project.style.preset===id));const preview=document.createElement('div');preview.className='style-preview '+id;preview.innerHTML=id==='karaoke'?'Caption <b>every word</b>':'Caption every word';const label=document.createElement('strong');label.textContent=humanize(id);button.append(preview,label);button.onclick=async function(){try{button.disabled=true;const result=await callTool('update_caption_project',{projectId:project.id,expectedVersion:currentVersion,ops:[{op:'set_preset',preset:id}]});const data=result.structuredContent||result;currentVersion=data.project.version;project.style=data.project.style;list.querySelectorAll('.style').forEach(function(item){item.setAttribute('aria-pressed','false')});button.setAttribute('aria-pressed','true');document.getElementById('style-note').textContent=humanize(id)+' is now applied. Ask ChatGPT to preview it when you are ready.';followUp('The user selected '+humanize(id)+'. Render a free preview for project '+project.id+'.')}catch(error){showError(error)}finally{button.disabled=false}};list.appendChild(button)})}
function renderApproval(){const quote=output.quote||{};if(output.status==='render_started'){setStatus('Export started','var(--ok)');content.innerHTML='<div class="stack"><div><p class="eyebrow">Approved</p><h1>Your export is underway</h1><p class="muted" style="margin-top:8px">ClipSubtitles is preparing the files you approved.</p></div><button id="progress" class="btn primary">Show progress</button></div>';document.getElementById('progress').onclick=function(){followUp('Show live progress for task '+(output.task&&output.task.id||'')+'.')};return}setStatus('Approval required');content.innerHTML='<div class="stack"><div><p class="eyebrow">Review before export</p><h1>Everything is ready</h1></div><div class="meta"><div class="kv"><span class="muted">Files</span><strong>'+esc((quote.settings&&quote.settings.outputs||[]).map(humanize).join(' + '))+'</strong></div><div class="kv"><span class="muted">Resolution</span><strong>'+esc(quote.settings&&quote.settings.resolution)+'</strong></div><div class="kv"><span class="muted">Length</span><strong>'+esc(duration(quote.durationMs))+'</strong></div><div class="kv"><span class="muted">Total</span><strong>'+esc(quote.creditCost)+' credits</strong></div></div><div class="notice">Nothing is exported or charged until you approve this exact quote.</div><div class="row"><button id="approve" class="btn primary">Approve '+esc(quote.creditCost)+' credits & export</button><button id="change" class="btn">Change options</button></div></div>';document.getElementById('approve').onclick=async function(){const button=this;try{button.disabled=true;button.textContent='Starting export…';const result=await callTool('render_caption_export',{projectId:quote.projectId,approval:{quoteId:quote.id,approvedCreditCost:quote.creditCost},idempotencyKey:'widget:'+quote.id});render(result.structuredContent||result)}catch(error){showError(error)}finally{button.disabled=false}};document.getElementById('change').onclick=function(){followUp('I want to change the export options for project '+quote.projectId+'. Ask me which files and resolution I want, then create a new quote.')}}
let pollTimer=null;
function renderProgress(){
  const task=output.task||{};const exports=output.exports||[];const active=task.status==='queued'||task.status==='running';
  setStatus(active?'Working':humanize(task.status),active?'':task.status==='succeeded'?'var(--ok)':'var(--danger)');
  if(active){
    const preparing=task.progress<=5;const packaging=task.progress>80;
    content.innerHTML='<div class="stack"><div><p class="eyebrow">Creating your captions</p><h1>'+esc(stageLabel(task.stage,task.kind))+'</h1></div><div class="stages">'
      +'<div class="stage '+(preparing?'active':'done')+'"><span class="circle"></span><div class="stage-detail"><span>Preparing video</span>'+(preparing?'<div class="stage-progress"><i style="width:'+Math.max(10,task.progress*20)+'%"></i></div>':'')+'</div><span class="muted">'+(preparing?'Working':'Complete')+'</span></div>'
      +'<div class="stage '+(packaging?'done':'active')+'"><span class="circle"></span><div class="stage-detail"><span>Adding captions</span>'+(!packaging&&!preparing?'<div class="stage-progress"><i style="width:'+Math.max(2,task.progress)+'%"></i></div>':'')+'</div><span>'+esc(task.progress)+'%</span></div>'
      +'<div class="stage '+(packaging?'active':'')+'"><span class="circle"></span><div class="stage-detail"><span>Packaging files</span>'+(packaging?'<div class="stage-progress"><i style="width:'+Math.min(100,Math.max(8,(task.progress-80)*5))+'%"></i></div>':'')+'</div><span class="muted">'+(packaging?'Working':'Next')+'</span></div>'
      +'</div><div class="row between"><span class="muted">You can keep chatting while this finishes.</span><button id="cancel" class="btn danger">Cancel</button></div></div>';
    document.getElementById('cancel').onclick=async function(){const result=await callTool('cancel_caption_task',{taskId:task.id});render(result.structuredContent||result)};
    clearTimeout(pollTimer);pollTimer=setTimeout(async function(){try{const result=await callTool('get_caption_task',{taskId:task.id});render(result.structuredContent||result)}catch(error){showError(error)}},2200);return;
  }
  clearTimeout(pollTimer);
  if(task.status==='succeeded'){content.innerHTML='<div class="stack"><div><p class="eyebrow">Finished</p><h1>Your captioned video is ready</h1></div><div class="files" id="files"></div><div class="row"><button id="open-app" class="btn">Open in ClipSubtitles</button></div></div>';const list=document.getElementById('files');exports.forEach(function(file){const link=document.createElement('a');link.className='download';link.href=file.downloadUrl||'#';link.target='_blank';link.rel='noreferrer';link.innerHTML='<span><strong>'+esc(file.fileName)+'</strong><br><span class="muted">'+humanize(file.kind)+'</span></span><span>Download ↓</span>';list.appendChild(link)});document.getElementById('open-app').onclick=function(){openExternal(WEB+'/studio/'+(task.projectId||task.result&&task.result.projectId||''))};return}
  content.innerHTML='<div class="stack"><p class="eyebrow">'+esc(humanize(task.status))+'</p><h1>'+esc(task.error&&task.error.message||'This task did not finish.')+'</h1><button id="open-app" class="btn">Open ClipSubtitles</button></div>';document.getElementById('open-app').onclick=function(){openExternal(WEB+'/app')}
}
function renderEditor(){const project=output.project||{};const pages=project.pages||[];const words=project.transcript&&project.transcript.words||[];currentVersion=project.version;setStatus('Saved','var(--ok)');content.innerHTML='<div class="row between" style="margin-bottom:12px"><div><p class="eyebrow">Focused editor</p><h1>'+esc(project.title||'Caption editor')+'</h1></div><button id="fullscreen" class="btn">Open fullscreen</button></div><div class="editor"><section class="panel pages-panel"><strong>Scenes</strong><div id="pages" class="pages" style="margin-top:12px"></div></section><section id="video" class="stage-video"></section><section class="panel stack"><div><strong>Words</strong><p class="muted">Select a word to correct it.</p></div><div id="words" class="words"></div><div id="edit" hidden><input id="word-input" aria-label="Correct word"><div class="row" style="margin-top:8px"><button id="save-word" class="btn primary">Save word</button><button id="cancel-word" class="btn">Cancel</button></div></div><div><strong>Look</strong><p class="muted">Current style: <span id="current-style">'+esc(project.style&&humanize(project.style.preset))+'</span></p></div><button id="styles-button" class="btn">Compare styles</button></section></div>';const pagesEl=document.getElementById('pages');pages.slice(0,8).forEach(function(page,index){const button=document.createElement('button');button.className='page '+(index===0?'active':'');button.textContent=page.text;button.onclick=function(){pagesEl.querySelectorAll('.page').forEach(function(item){item.classList.remove('active')});button.classList.add('active')};pagesEl.appendChild(button)});const video=document.getElementById('video');if(project.source&&project.source.playbackUrl){const player=document.createElement('video');player.src=project.source.playbackUrl;player.controls=true;player.playsInline=true;video.appendChild(player)}else video.innerHTML='<span class="muted">Video preview unavailable</span>';const wordsEl=document.getElementById('words'),edit=document.getElementById('edit'),wordInput=document.getElementById('word-input');let selectedWord=null;words.slice(0,80).forEach(function(word){const button=document.createElement('button');button.className='word';button.textContent=word.text;button.onclick=function(){selectedWord=word;wordInput.value=word.text;edit.hidden=false;wordInput.focus()};wordsEl.appendChild(button)});document.getElementById('cancel-word').onclick=function(){edit.hidden=true;selectedWord=null};document.getElementById('save-word').onclick=async function(){if(!selectedWord)return;try{const result=await callTool('update_caption_project',{projectId:project.id,expectedVersion:currentVersion,ops:[{op:'replace_word_text',wordId:selectedWord.id,text:wordInput.value}]});const data=result.structuredContent||result;currentVersion=data.project.version;render({project:data.project})}catch(error){showError(error)}};document.getElementById('styles-button').onclick=function(){followUp('Open the caption style picker for project '+project.id+'.')};document.getElementById('fullscreen').onclick=async function(){if(window.openai&&window.openai.requestDisplayMode)await window.openai.requestDisplayMode({mode:'fullscreen'})}}
function humanize(value){return String(value||'').replace(/[-_]/g,' ').replace(/\\b\\w/g,function(ch){return ch.toUpperCase()})}function duration(ms){if(!Number.isFinite(ms))return '—';const seconds=Math.round(ms/1000);return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')}function stageLabel(stage,kind){if(stage)return humanize(stage);if(kind==='generate_captions')return 'Listening for every word';if(kind==='render_preview')return 'Preparing your preview';return 'Creating your export'}function openExternal(href){if(window.openai&&window.openai.openExternal)window.openai.openExternal({href:href});else window.open(href,'_blank','noopener')}function showError(error){const message=error&&error.message?error.message:'Something went wrong.';content.insertAdjacentHTML('beforeend','<p class="error">'+esc(message)+'</p>');setStatus('Needs attention','var(--danger)');notifyHeight()}
window.addEventListener('message',function(event){if(event.source!==window.parent)return;const message=event.data;if(!message||message.jsonrpc!=='2.0')return;if(message.id!==undefined&&pending.has(message.id)){const waiting=pending.get(message.id);pending.delete(message.id);if(message.error)waiting.reject(message.error);else waiting.resolve(message.result);return}if(message.method==='ui/notifications/tool-input')input=message.params;if(message.method==='ui/notifications/tool-result')render(message.params&&message.params.structuredContent)});render(output||{});
</script></body></html>`;
}

/** Deterministic visual-test entrypoint. Production registration still goes through registerClipSubtitlesUi. */
export function widgetHtmlForPreview(
  kind: UiKind,
  webPublicUrl: string,
  toolOutput: unknown,
): string {
  const html = widgetHtml(kind, webPublicUrl);
  const bridge = `<script>window.openai={toolOutput:${JSON.stringify(toolOutput).replace(/</g, '\\u003c')},callTool:async function(name,args){return {structuredContent:window.openai.toolOutput}},sendFollowUpMessage:async function(){return {}},notifyIntrinsicHeight:function(){},requestDisplayMode:async function(){return {mode:'fullscreen'}},openExternal:function(){}};</script>`;
  return html.replace('<script>\nconst KIND=', `${bridge}<script>\nconst KIND=`);
}
