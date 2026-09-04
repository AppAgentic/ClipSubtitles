/** Upload capability checks and explicit, expiring paid-export approval. */
export const WIDGET_START_APPROVAL = String.raw`
let approvalTimer=null,approvalBusy=false;
function stopApprovalTimer(){clearTimeout(approvalTimer);approvalTimer=null}
function renderStart(){
  const host=window.openai||{},canDownload=typeof host.getFileDownloadUrl==='function';
  const canUpload=canDownload&&typeof host.uploadFile==='function',canSelect=canDownload&&typeof host.selectFiles==='function';
  setStatus('Ready to begin');
  content.innerHTML='<div class="stack"><div><p class="eyebrow">Start with a video</p><h1>Caption your video</h1><p class="muted">Choose a video here or upload securely in ClipSubtitles.</p></div><div id="selection" class="notice" aria-live="polite">'+(canUpload||canSelect?'No video selected yet.':'This host does not support direct video selection. Upload in ClipSubtitles, then return to this conversation.')+'</div><div class="row">'+(canUpload?'<button id="choose" class="btn primary">Choose video</button>':'')+(canSelect?'<button id="library" class="btn">File library</button>':'')+'<button id="web-upload" class="btn">Upload in ClipSubtitles</button></div><input id="fallback" type="file" accept="video/*" hidden></div>';
  document.getElementById('web-upload').onclick=function(){openExternal(WEB+'/app/new')};
  const choose=document.getElementById('choose'),library=document.getElementById('library'),fallback=document.getElementById('fallback');
  let busy=false;
  async function select(action){if(busy)return;busy=true;if(choose)choose.disabled=true;if(library)library.disabled=true;try{await action()}catch(error){showError(error)}finally{busy=false;if(choose)choose.disabled=false;if(library)library.disabled=false;fallback.value=''}}
  if(choose){choose.onclick=function(){fallback.click()};fallback.onchange=function(){const file=fallback.files&&fallback.files[0];if(!file)return;select(async function(){if(file.type&&!file.type.startsWith('video/'))throw new Error('Choose a video file.');const uploaded=await host.uploadFile(file,{library:true});if(!uploaded||!uploaded.fileId)throw new Error('The host did not return an uploaded file. Please use Upload in ClipSubtitles.');await createFromFile({fileId:uploaded.fileId,fileName:file.name,mimeType:file.type})})}}
  if(library)library.onclick=function(){select(async function(){const selected=await host.selectFiles();const files=Array.isArray(selected)?selected:selected&&selected.files;if(files&&files[0])await createFromFile(files[0])})};
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
  const checkout=output.status==='checkout_required'?output.checkout:null;
  setStatus(checkout?'More credits needed':'Approval required');
  content.innerHTML='<div class="stack"><div><p class="eyebrow">Review before export</p><h1>'+(checkout?'Add credits to continue':'Review your export')+'</h1></div><div class="meta"><div class="kv"><span class="muted">Files</span><strong>'+esc((quote.settings&&quote.settings.outputs||[]).map(humanize).join(' + '))+'</strong></div><div class="kv"><span class="muted">Resolution</span><strong>'+esc(quote.settings&&quote.settings.resolution)+'</strong></div><div class="kv"><span class="muted">Length</span><strong>'+esc(duration(quote.durationMs))+'</strong></div><div class="kv"><span class="muted">Total</span><strong>'+esc(quote.creditCost)+' credits</strong></div></div>'+(checkout?'<p class="notice">Available: '+esc(checkout.balance)+' credits. You need '+esc(checkout.shortfall)+' more. Adding credits does not start this export.</p><button id="add-credits" class="btn primary">View credit options</button>':'')+'<p class="notice">Nothing is exported or charged until you approve this exact quote.</p><p id="quote-expiry" class="muted" role="status"></p><div class="row"><button id="approve" class="btn primary">Approve '+esc(quote.creditCost)+' credits & export</button><button id="change" class="btn">Change options</button></div></div>';
  if(checkout)document.getElementById('add-credits').onclick=function(){let href=WEB+'/pricing';try{const url=new URL(checkout.pricingUrl);if(url.origin===new URL(WEB).origin)href=url.href}catch(error){}openExternal(href)};
  const button=document.getElementById('approve'),expiry=document.getElementById('quote-expiry');
  function tick(){if(!button.isConnected)return;const left=Date.parse(quote.expiresAt)-Date.now();if(left<=0){button.disabled=true;expiry.textContent='This quote expired. Get a fresh quote before exporting.';renderApproval();return}expiry.textContent='Quote expires in '+Math.ceil(left/60000)+' minute'+(left>60000?'s':'')+'.';approvalTimer=setTimeout(tick,Math.min(left,1000))}tick();
  button.onclick=async function(){if(approvalBusy)return;if(!approvalQuoteValid(quote)){renderApproval();return}approvalBusy=true;button.disabled=true;button.textContent='Starting export…';try{const data=await callTool('render_caption_export',{projectId:quote.projectId,approval:{quoteId:quote.id,approvedCreditCost:quote.creditCost},idempotencyKey:'widget:'+quote.id});render(data)}catch(error){showError(error)}finally{approvalBusy=false;if(button.isConnected){button.disabled=!approvalQuoteValid(quote);button.textContent='Approve '+quote.creditCost+' credits & export'}}};
  document.getElementById('change').onclick=function(){followUp('Change the export options for project '+quote.projectId+'. Ask me which files and resolution I want, then create a new quote. Do not start a paid export.')};
}
`;
