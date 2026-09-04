/** Inline, dependency-free host adapter. Keep both MCP Apps and ChatGPT delivery asynchronous. */
export const WIDGET_BRIDGE = String.raw`
let output=null,input=null,displayMode='inline';
let bridgeState={},bridgeDisposed=false,bridgeId=1,bridgeReady=false;
const bridgePending=new Map();
function normalizeToolResult(result){
  if(result&&result.isError){
    let message='The request could not be completed. Please try again.';
    for(const item of result.content||[]){if(item.type==='text'){try{const body=JSON.parse(item.text);message=body.error&&body.error.message||body.message||message}catch(_){}}}
    throw new Error(message);
  }
  const data=result&&result.structuredContent!==undefined?result.structuredContent:result;
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('No usable response arrived. Please try again.');
  return data;
}
function bridgeRequest(method,params){
  if(bridgeDisposed)return Promise.reject(new Error('This view has closed.'));
  const id=bridgeId++;
  return new Promise(function(resolve,reject){
    const timer=setTimeout(function(){bridgePending.delete(id);reject(new Error('The connection took too long. Please try again.'))},15000);
    bridgePending.set(id,{resolve:resolve,reject:reject,timer:timer});
    window.parent.postMessage({jsonrpc:'2.0',id:id,method:method,params:params},'*');
  });
}
function bridgeNotify(method,params){if(!bridgeDisposed)window.parent.postMessage({jsonrpc:'2.0',method:method,params:params},'*')}
async function callToolEnvelope(name,args){
  const host=window.openai;let timer;
  try{return await Promise.race([
    host&&host.callTool?host.callTool(name,args):bridgeRequest('tools/call',{name:name,arguments:args}),
    new Promise(function(_,reject){timer=setTimeout(function(){reject(new Error('The connection took too long. Please try again.'))},15000)})
  ])}finally{clearTimeout(timer)}
}
async function callTool(name,args){return normalizeToolResult(await callToolEnvelope(name,args))}
function uploadMetadataTargets(metadata){
  if(!metadata||typeof metadata!=='object')return [];
  const candidates=[];
  if(metadata.uploadTarget)candidates.push({target:metadata.uploadTarget});
  for(const envelope of [metadata.mcp_tool_result,metadata.call_tool_result]){
    if(envelope&&envelope._meta&&envelope._meta.uploadTarget)candidates.push({target:envelope._meta.uploadTarget,envelope:true,projectId:envelope.structuredContent&&envelope.structuredContent.project&&envelope.structuredContent.project.id});
  }
  return candidates;
}
async function preparePrivateUpload(args){
  const host=window.openai,before=host&&host.toolResponseMetadata;
  const oldTargets=uploadMetadataTargets(before).map(function(candidate){return candidate.target});
  let projectId=null,resolveWaiting=null,waitTimer=null;const metadataEvents=[];
  function matches(candidate){return candidate.target&&candidate.target.projectId===projectId&&(!candidate.envelope||candidate.projectId===projectId)}
  function findFresh(metadata){
    if(!projectId||!metadata||metadata===before)return;
    const candidate=uploadMetadataTargets(metadata).find(function(entry){return matches(entry)&&!oldTargets.some(function(old){return old===entry.target||(old.uploadId&&old.uploadId===entry.target.uploadId)||(old.url&&old.url===entry.target.url)})});
    return candidate&&candidate.target;
  }
  function onMetadata(event){
    const globals=event.detail&&event.detail.globals;
    const metadata=globals&&globals.toolResponseMetadata||(window.openai&&window.openai.toolResponseMetadata);
    if(metadataEvents.length===8)metadataEvents.shift();metadataEvents.push(metadata);
    const target=findFresh(metadata);if(target&&resolveWaiting)resolveWaiting(target);
  }
  window.addEventListener('openai:set_globals',onMetadata);
  try{
    const result=await callToolEnvelope('prepare_caption_upload',args),data=normalizeToolResult(result);
    projectId=data.project&&data.project.id;
    const direct=uploadMetadataTargets(result&&result._meta).find(matches);
    if(direct||data.status==='already_uploaded'||!projectId)return {data:data,target:direct&&direct.target};
    const fresh=metadataEvents.map(findFresh).find(Boolean)||findFresh(window.openai&&window.openai.toolResponseMetadata);
    if(fresh)return {data:data,target:fresh};
    // Host globals may arrive after callTool resolves. Never substitute a prior capability.
    const target=await new Promise(function(resolve){resolveWaiting=resolve;waitTimer=setTimeout(function(){resolve(findFresh(window.openai&&window.openai.toolResponseMetadata))},2000)});
    return {data:data,target:target};
  }finally{clearTimeout(waitTimer);resolveWaiting=null;metadataEvents.length=0;window.removeEventListener('openai:set_globals',onMetadata)}
}
async function followUp(prompt){try{const host=window.openai;return await(host&&host.sendFollowUpMessage?host.sendFollowUpMessage({prompt:prompt}):bridgeRequest('ui/message',{role:'user',content:[{type:'text',text:prompt}]}))}catch(error){showError(error)}}
function notifyHeight(){requestAnimationFrame(function(){if(bridgeDisposed)return;const height=document.documentElement.scrollHeight;if(window.openai&&window.openai.notifyIntrinsicHeight)window.openai.notifyIntrinsicHeight({height:height});else if(bridgeReady)bridgeNotify('ui/notifications/size-changed',{height:height})})}
function getWidgetState(){return bridgeState}
function setWidgetState(next){bridgeState=Object.assign({},bridgeState,next);if(window.openai&&window.openai.setWidgetState)Promise.resolve(window.openai.setWidgetState(bridgeState)).catch(function(){});return bridgeState}
async function requestDisplayMode(mode){const host=window.openai;const result=await(host&&host.requestDisplayMode?host.requestDisplayMode({mode:mode}):bridgeRequest('ui/request-display-mode',{mode:mode}));displayMode=result&&result.mode||mode;document.documentElement.dataset.displayMode=displayMode;notifyHeight();return result}
function receiveSafeArea(context){
  const insets=context.safeAreaInsets||(context.safeArea&&context.safeArea.insets);
  if(!insets||typeof insets!=='object'||Array.isArray(insets))return;
  ['top','right','bottom','left'].forEach(function(edge){
    if(!Object.prototype.hasOwnProperty.call(insets,edge))return;
    const value=insets[edge];const pixels=typeof value==='number'&&Number.isFinite(value)?Math.min(2048,Math.max(0,value)):0;
    document.documentElement.style.setProperty('--host-safe-'+edge,pixels+'px');
  });
}
function receiveHostContext(context){if(!context)return;receiveSafeArea(context);if(context.displayMode)displayMode=context.displayMode;document.documentElement.dataset.displayMode=displayMode;if(context.theme==='light'||context.theme==='dark')document.documentElement.style.colorScheme=context.theme;if(typeof onHostContextChanged==='function')onHostContextChanged(context)}
function receiveToolData(value){try{const data=normalizeToolResult(value);if((data.upload||data.status==='already_uploaded')&&data.project)return;if(Object.keys(data).length&&data!==output)render(data)}catch(error){showError(error)}}
function receiveOpenAiGlobals(globals){if(!globals)return;if(globals.widgetState)bridgeState=globals.widgetState;if(globals.toolInput)input=globals.toolInput;receiveHostContext(globals);if(globals.toolOutput)receiveToolData(globals.toolOutput)}
function disposeBridge(){bridgeDisposed=true;if(typeof stopPolling==='function')stopPolling();if(typeof stopApprovalTimer==='function')stopApprovalTimer();if(typeof disposeWorkspace==='function')disposeWorkspace();bridgePending.forEach(function(entry){clearTimeout(entry.timer);entry.reject(new Error('This view has closed.'))});bridgePending.clear()}
function initializeBridge(){
  window.addEventListener('openai:set_globals',function(event){receiveOpenAiGlobals(event.detail&&event.detail.globals||window.openai)});
  window.addEventListener('message',function(event){
    if(event.source!==window.parent)return;const message=event.data;if(!message||message.jsonrpc!=='2.0')return;
    if(message.id!==undefined&&bridgePending.has(message.id)){const entry=bridgePending.get(message.id);bridgePending.delete(message.id);clearTimeout(entry.timer);if(message.error)entry.reject(new Error(message.error.message||'The host could not complete this request.'));else entry.resolve(message.result);return}
    if(message.method==='ui/notifications/tool-input')input=message.params&&message.params.arguments||message.params;
    if(message.method==='ui/notifications/tool-result')receiveToolData(message.params);
    if(message.method==='ui/notifications/host-context-changed')receiveHostContext(message.params);
    if(message.method==='ui/resource-teardown'){if(message.id!==undefined)window.parent.postMessage({jsonrpc:'2.0',id:message.id,result:{}},'*');disposeBridge()}
  });
  window.addEventListener('pagehide',disposeBridge);
  receiveOpenAiGlobals(window.openai);
  if(!(window.openai&&window.openai.callTool))bridgeRequest('ui/initialize',{protocolVersion:'2026-01-26',appInfo:{name:'clipsubtitles',version:'0.1.0'},appCapabilities:{availableDisplayModes:['inline','fullscreen']}}).then(function(result){bridgeReady=true;receiveHostContext(result&&result.hostContext);bridgeNotify('ui/notifications/initialized',{});notifyHeight()}).catch(function(error){if(!bridgeDisposed&&!output)showError(error)});
}
`;
