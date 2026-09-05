/** Upload capability checks and explicit, expiring paid-export approval. */
export const WIDGET_START_APPROVAL = String.raw`
let approvalTimer=null,approvalBusy=false;
function stopApprovalTimer(){clearTimeout(approvalTimer);approvalTimer=null}
let nativeUploadProject=null,nativeUploadKey=null,nativeUploadIdentity=null,autoReviewProjectId=null;
function renderStart(){
  const host=window.openai||{},canSelect=typeof host.getFileDownloadUrl==='function'&&typeof host.selectFiles==='function';
  setStatus('Ready to begin');
  content.innerHTML='<div class="stack"><div><p class="eyebrow">Start with a video</p><h1>Caption your video</h1><p class="muted">Choose your video, then review captions and styles together.</p></div><div id="selection" class="notice" aria-live="polite">Upload a video up to 30 MB here. For larger videos, use ClipSubtitles.</div><div class="row"><button id="choose" class="btn primary">Choose video</button>'+(canSelect?'<button id="library" class="btn">File library</button>':'')+'<button id="web-upload" class="btn">Upload in ClipSubtitles</button></div><input id="fallback" type="file" accept="video/*" hidden></div>';
  document.getElementById('web-upload').onclick=function(){openExternal(nativeUploadProject?WEB+'/studio/'+nativeUploadProject+'/upload':WEB+'/app/new')};
  const choose=document.getElementById('choose'),library=document.getElementById('library'),fallback=document.getElementById('fallback');
  let busy=false;
  async function select(action){if(busy)return;busy=true;choose.disabled=true;if(library)library.disabled=true;try{await action()}catch(error){showError(error)}finally{busy=false;choose.disabled=false;if(library)library.disabled=false;fallback.value=''}}
  choose.onclick=function(){fallback.click()};fallback.onchange=function(){const file=fallback.files&&fallback.files[0];if(file)select(function(){return uploadNativeVideo(file)})};
  if(library)library.onclick=function(){select(async function(){const selected=await host.selectFiles();const files=Array.isArray(selected)?selected:selected&&selected.files;if(files&&files[0])await createFromFile(files[0])})};
}
async function uploadNativeVideo(file){
  if(!file.type||!file.type.startsWith('video/'))throw new Error('Choose a video file.');
  if(!file.size||file.size>31457280)throw new Error('Choose a video up to 30 MB, or use Upload in ClipSubtitles for larger videos.');
  const identity=JSON.stringify([file.name,file.type,file.size,file.lastModified]);
  if(nativeUploadIdentity!==identity){nativeUploadProject=null;nativeUploadKey=null;nativeUploadIdentity=identity}
  const selection=document.getElementById('selection');
  if(!nativeUploadKey)nativeUploadKey='widget-upload:'+crypto.randomUUID();
  selection.textContent=file.name+' · preparing upload…';setStatus('Preparing upload');
  const prepared=await preparePrivateUpload({title:file.name.replace(/\.[^.]+$/,''),fileName:file.name,mimeType:file.type,bytes:file.size,idempotencyKey:nativeUploadProject?'widget-upload:'+crypto.randomUUID():nativeUploadKey,...(nativeUploadProject?{projectId:nativeUploadProject}:{})});
  const data=prepared.data,target=prepared.target;
  if(data.project&&data.project.id)nativeUploadProject=data.project.id;
  if(!nativeUploadProject)throw new Error('The project could not be prepared. Please try again.');
  if(data.status==='already_uploaded'){await startNativeCaptions();return}
  if(!target)throw new Error('This host could not provide the secure upload connection. Use Upload in ClipSubtitles to continue with this project.');
  let url;try{url=new URL(target.url)}catch(_){throw new Error('The secure upload connection is unavailable. Please try again.')}
  const expiry=Date.parse(target.expiresAt);
  if(target.projectId!==nativeUploadProject||url.origin!==API||!url.pathname.startsWith('/v1/uploads/')||target.method!=='PUT'||!Number.isFinite(target.maxBytes)||file.size>target.maxBytes||!Number.isFinite(expiry)||expiry<=Date.now())throw new Error('The secure upload connection is unavailable. Choose your video again or use Upload in ClipSubtitles.');
  selection.textContent=file.name+' · uploading and checking video…';setStatus('Uploading video');
  const controller=new AbortController(),timer=setTimeout(function(){controller.abort()},120000);
  let response;
  try{response=await fetch(url.href,{method:'PUT',headers:{'Content-Type':file.type},body:file,credentials:'omit',signal:controller.signal,redirect:'error'})}catch(_){throw new Error('The upload connection was interrupted. Choose your video again to retry this project, or use Upload in ClipSubtitles.')}finally{clearTimeout(timer)}
  if(!response.ok)throw new Error(response.status===413?'This video is too large for an embedded upload. Use Upload in ClipSubtitles.':'The video could not be accepted. Choose your video again or continue in ClipSubtitles.');
  selection.textContent='Video uploaded. Creating your captions…';setStatus('Creating captions');
  const choose=document.getElementById('choose');
  choose.textContent='Create captions';choose.onclick=async function(){choose.disabled=true;try{await startNativeCaptions()}catch(error){showError(error)}finally{choose.disabled=false}};
  document.getElementById('web-upload').onclick=function(){openExternal(WEB+'/studio/'+nativeUploadProject)};
  await startNativeCaptions();
}
async function startNativeCaptions(){
  autoReviewProjectId=nativeUploadProject;
  const generated=await callTool('generate_captions',{projectId:nativeUploadProject,idempotencyKey:nativeUploadKey+':captions'});
  if(!generated.task||!generated.task.id)throw new Error('The caption task was not returned. Please try again.');
  render({task:{...generated.task,projectId:nativeUploadProject,kind:'generate_captions'}});
  nativeUploadProject=null;nativeUploadKey=null;nativeUploadIdentity=null;
  // Generation returns only pointers. Polling fetches the full task and then
  // opens the authoritative editor; never render its compact project pointer.

}
async function createFromFile(file){
  const host=window.openai||{};
  if(!file||!file.fileId||typeof host.getFileDownloadUrl!=='function')throw new Error('This host cannot provide the selected video. Please use Upload in ClipSubtitles.');
  if(file.mimeType&&!file.mimeType.startsWith('video/'))throw new Error('Choose a video file.');
  const selection=document.getElementById('selection');if(selection)selection.textContent=(file.fileName||'Selected video')+' · preparing project…';
  const fetched=await host.getFileDownloadUrl({fileId:file.fileId});
  if(!fetched||!fetched.downloadUrl)throw new Error('The selected file is no longer available. Select it again or upload in ClipSubtitles.');
  const data=await callTool('create_caption_project',{title:(file.fileName||'Untitled video').replace(/\.[^.]+$/,''),file:{download_url:fetched.downloadUrl,file_id:file.fileId,mime_type:file.mimeType||'video/mp4',file_name:file.fileName||'video.mp4'}});
  if(!data.project||!data.project.id)throw new Error('The host did not return the new project. Check ClipSubtitles before retrying.');
  if(selection&&selection.isConnected)selection.innerHTML='<strong>'+esc(data.project.title||'Video project created')+'</strong><br><span class="muted">Your video is being prepared for captions.</span>';
  setStatus('Project created','var(--ok)');
  if(data.importTask&&data.importTask.id)render({task:data.importTask});
  await followUp('Continue captioning project '+data.project.id+'. Poll the import if needed, then generate captions and immediately open_caption_editor so I can review my video and choose a caption style together.');
}
function approvalQuoteValid(quote){return !!(quote&&quote.id&&quote.projectId&&quote.status==='open'&&Number.isFinite(quote.creditCost)&&quote.creditCost>=0&&Number.isFinite(Date.parse(quote.expiresAt))&&Date.parse(quote.expiresAt)>Date.now())}
async function refreshApproval(quote){
  if(!quote||!quote.projectId){await followUp('Prepare a fresh export quote for the video I am editing. Ask which files and resolution I want. Do not start a paid export.');return}
  const data=await callTool('render_caption_export',{projectId:quote.projectId,...(quote.settings?{settings:quote.settings}:{})});render(data);
}
function renderApproval(){
  stopApprovalTimer();approvalBusy=false;const quote=output.quote,task=output.task;
  if(output.status==='render_started'){
    setStatus('Export started','var(--ok)');content.innerHTML='<div class="stack"><div><p class="eyebrow">Approved</p><h1>Your export is underway</h1><p class="muted">Preparing the files you approved.</p></div><button id="progress" class="btn primary">Show progress</button></div>';
    document.getElementById('progress').onclick=async function(){try{if(!task||!task.id)throw new Error('The export task was not returned. Open ClipSubtitles to check your exports.');render(await callTool('get_caption_task',{taskId:task.id}))}catch(error){showError(error)}};return;
  }
  if(!approvalQuoteValid(quote)){
    setStatus('Fresh quote needed');content.innerHTML='<div class="stack"><h1>'+(!quote?'Review an export quote first':'This quote is no longer available')+'</h1><p class="notice">Get the current files and price before approving an export.</p><button id="refresh-quote" class="btn primary">Get fresh quote</button></div>';
    document.getElementById('refresh-quote').onclick=async function(){this.disabled=true;try{await refreshApproval(quote)}catch(error){showError(error)}finally{this.disabled=false}};return;
  }
  if(output.status==='insufficient_credits'){
    const credits=output.creditAvailability;
    setStatus('Not enough existing credits');
    content.innerHTML='<div class="stack"><h1>This export is unavailable</h1><p class="notice">This export requires '+esc(quote.creditCost)+' existing credits.'+(credits?' Available: '+esc(credits.balance)+'. Shortfall: '+esc(credits.shortfall)+'.':'')+'</p><p class="notice">No export started. No credits were reserved or charged. You can keep editing or change the export options and review a new quote.</p><div class="row"><button id="edit-project" class="btn primary">Keep editing</button><button id="change" class="btn">Change options</button></div></div>';
    document.getElementById('edit-project').onclick=async function(){try{render(await callTool('open_caption_editor',{projectId:quote.projectId}))}catch(error){showError(error)}};
    document.getElementById('change').onclick=function(){followUp('Change the export options for project '+quote.projectId+'. Ask me which files and resolution I want, then create a new quote. Do not start a paid export.')};
    return;
  }
  setStatus('Approval required');
  content.innerHTML='<div class="stack"><div><p class="eyebrow">Review before export</p><h1>Review your export</h1></div><div class="meta"><div class="kv"><span class="muted">Files</span><strong>'+esc((quote.settings&&quote.settings.outputs||[]).map(humanize).join(' + '))+'</strong></div><div class="kv"><span class="muted">Resolution</span><strong>'+esc(quote.settings&&quote.settings.resolution)+'</strong></div><div class="kv"><span class="muted">Length</span><strong>'+esc(duration(quote.durationMs))+'</strong></div><div class="kv"><span class="muted">Total</span><strong>'+esc(quote.creditCost)+' credits</strong></div></div><p class="notice">Nothing is exported or charged until you approve this exact quote.</p><p id="quote-expiry" class="muted" role="status"></p><div class="row"><button id="approve" class="btn primary">Approve '+esc(quote.creditCost)+' credits & export</button><button id="change" class="btn">Change options</button></div></div>';
  const button=document.getElementById('approve'),expiry=document.getElementById('quote-expiry');
  function tick(){if(!button.isConnected)return;const left=Date.parse(quote.expiresAt)-Date.now();if(left<=0){button.disabled=true;expiry.textContent='This quote expired. Get a fresh quote before exporting.';renderApproval();return}expiry.textContent='Quote expires in '+Math.ceil(left/60000)+' minute'+(left>60000?'s':'')+'.';approvalTimer=setTimeout(tick,Math.min(left,1000))}tick();
  button.onclick=async function(){if(approvalBusy)return;if(!approvalQuoteValid(quote)){renderApproval();return}approvalBusy=true;button.disabled=true;button.textContent='Starting export…';try{const data=await callTool('render_caption_export',{projectId:quote.projectId,approval:{quoteId:quote.id,approvedCreditCost:quote.creditCost},idempotencyKey:'widget:'+quote.id});render(data)}catch(error){showError(error)}finally{approvalBusy=false;if(button.isConnected){button.disabled=!approvalQuoteValid(quote);button.textContent='Approve '+quote.creditCost+' credits & export'}}};
  document.getElementById('change').onclick=function(){followUp('Change the export options for project '+quote.projectId+'. Ask me which files and resolution I want, then create a new quote. Do not start a paid export.')};
}
`;
