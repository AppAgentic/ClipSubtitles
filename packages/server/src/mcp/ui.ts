import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../context';
import { STYLE_PRESETS } from '@clipsubtitles/core';
import { WIDGET_BRIDGE } from './widget-bridge';
import { WIDGET_PROGRESS } from './widget-progress';
import { WIDGET_WORKSPACE } from './widget-workspace';
import { WIDGET_START_APPROVAL } from './widget-start-approval';
import { WIDGET_OVERLAY } from './generated/overlay';

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
            text: widgetHtml(kind, ctx.config.webPublicUrl, apiOrigin),
            _meta: {
              ui: {
                prefersBorder: false,
                csp: {
                  connectDomains: [apiOrigin, webOrigin],
                  resourceDomains: [apiOrigin, webOrigin],
                },
              },
              'openai/widgetDescription': DESCRIPTIONS[kind],
              'openai/widgetPrefersBorder': false,
              'openai/widgetCSP': {
                connect_domains: [apiOrigin, webOrigin],
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

function widgetHtml(
  kind: UiKind,
  webPublicUrl: string,
  apiOrigin = new URL(webPublicUrl).origin,
): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{
  color-scheme:light dark;
  --bg:light-dark(#ffffff,#1c1c1e);
  --soft:light-dark(#f5f5f7,#242426);
  --soft-strong:light-dark(#e5e5ea,#3a3a3c);
  --line:light-dark(#d6d6db,#48484a);
  --ink:light-dark(#1d1d1f,#f5f5f7);
  --muted:light-dark(#6e6e73,#98989d);
  --accent:light-dark(#0071e3,#0a84ff);
  --accent-fill:light-dark(#0071e3,#0060df);
  --accent-ink:#ffffff;
  --ok:light-dark(#248a3d,#32d74b);
  --danger:light-dark(#d70015,#ff453a);
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;
  font-feature-settings:"kern" 1,"liga" 1,"calt" 1;
}
*{box-sizing:border-box}
body{margin:0;background:transparent;color:var(--ink);font-size:14px;line-height:1.5}
button,input{font:inherit}
h1,h2,h3,p{margin:0}
h1{font-size:24px;font-weight:650;line-height:1.18;letter-spacing:-.025em;text-wrap:balance}
.shell{width:100%;padding:16px}
.kind-start,.kind-approval,.kind-progress{max-width:720px;margin-inline:auto}
.kind-styles{max-width:980px;margin-inline:auto}
.card{overflow:hidden;border:1px solid var(--line);border-radius:22px;background:var(--bg)}
.kind-editor .card,.kind-styles .card{border:0;background:transparent}
.head{display:none}
.brand{display:flex;align-items:center;gap:10px;font-weight:650;letter-spacing:-.01em}
.mark{position:relative;width:32px;height:32px;flex:0 0 auto;border-radius:8px;background:var(--ink);color:transparent}
.mark:before,.mark:after{content:"";position:absolute;top:7px;width:12px;height:18px;border:4px solid}
.mark:before{left:6px;border-color:var(--bg) transparent var(--bg) var(--bg);border-radius:6px 0 0 6px}
.mark:after{right:5px;border-color:var(--accent) var(--accent) var(--accent) transparent;border-radius:0 6px 6px 0}
.mark b{display:none}
.body{padding:20px}
.kind-editor .body,.kind-styles .body{padding-inline:0}
.stack{display:grid;gap:16px}
.row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.between{justify-content:space-between}
.muted{color:var(--muted)}
.eyebrow{margin-bottom:4px;color:var(--muted);font-size:12px;font-weight:600;letter-spacing:0;text-transform:none}
.pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:6px;padding:4px 8px;color:var(--muted);font-size:11px;font-weight:550}
.btn{display:inline-flex;min-height:42px;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:999px;background:var(--bg);color:var(--ink);padding:0 18px;font-weight:600;letter-spacing:-.01em;cursor:pointer;transition:border-color .18s,background-color .18s,transform .12s}
.btn:hover{border-color:color-mix(in srgb,var(--ink),transparent 55%);background:var(--soft)}
.btn:active{transform:translateY(1px)}
.btn:focus-visible,.style:focus-visible,.page:focus-visible,.word:focus-visible,input:focus-visible,.download:focus-visible{outline:3px solid color-mix(in srgb,var(--accent),transparent 48%);outline-offset:2px}
.btn.primary{border-color:var(--accent-fill);background:var(--accent-fill);color:var(--accent-ink)}
.btn.primary:hover{background:color-mix(in srgb,var(--accent-fill),#fff 10%)}
.btn.danger{border-color:transparent;background:transparent;color:var(--danger)}
.btn:disabled{cursor:not-allowed;opacity:.48}
.dropzone{display:grid;min-height:160px;place-items:center;border:1px solid var(--line);border-radius:20px;background:var(--soft);padding:24px;text-align:center}
.drop-icon{display:grid;width:48px;height:48px;place-items:center;margin:0 auto 12px;border-radius:50%;background:var(--ink);color:var(--bg);font-size:24px}
.styles{display:grid;grid-auto-columns:minmax(190px,1fr);grid-auto-flow:column;gap:12px;overflow-x:auto;padding:2px 2px 10px;scroll-snap-type:x mandatory;scrollbar-width:thin}
.style{display:grid;gap:10px;min-width:190px;scroll-snap-align:start;border:1px solid var(--line);border-radius:20px;background:var(--bg);padding:8px;text-align:left;color:var(--ink);cursor:pointer;transition:border-color .18s,background-color .18s,transform .18s}
.style:hover{background:var(--soft)}
.style:active{transform:scale(.985)}
.style[aria-pressed=true]{border-color:var(--accent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent),transparent 52%)}
.style-preview{position:relative;display:grid;aspect-ratio:16/9;place-items:center;overflow:hidden;border-radius:14px;background:#0a0a0a}
.style-preview video{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:contain;pointer-events:none}
.meta{display:grid}.approval-sheet{border-radius:18px;background:var(--soft);padding:8px 16px}
.kv{display:flex;justify-content:space-between;gap:24px;padding:11px 0;border-bottom:1px solid var(--line)}
.kv:last-child{border-bottom:0}.kv strong{font-variant-numeric:tabular-nums;text-align:right}
.notice{border-left:3px solid var(--line);padding:10px 12px;background:var(--soft);color:var(--muted);font-size:12px}
.stages{display:grid;gap:0}.stage{position:relative;display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:12px;min-height:52px;align-items:start}
.stage:not(:last-child):after{content:"";position:absolute;left:9px;top:28px;bottom:0;width:1px;background:var(--line)}
.stage .circle{z-index:1;width:20px;height:20px;border:2px solid var(--line);border-radius:50%;background:var(--bg)}
.stage.done .circle{border-color:var(--ok);background:var(--ok)}
.stage.active .circle{border-color:var(--accent-fill);background:var(--accent-fill)}
.stage-detail{min-width:0}.stage-progress{position:relative;height:5px;overflow:hidden;margin-top:9px;border-radius:3px;background:var(--line)}
.stage-progress i{display:block;height:100%;border-radius:inherit;background:var(--accent-fill);transition:width .3s}
.stage-progress.is-active::after{content:"";position:absolute;inset:0 auto 0 0;width:35%;background:var(--accent-fill);opacity:.45;animation:task-activity 1.8s ease-in-out infinite}
@keyframes task-activity{from{transform:translateX(-100%)}to{transform:translateX(390%)}}
@media(prefers-reduced-motion:reduce){.stage-progress.is-active::after{animation:none;display:none}}
.files{display:grid;gap:8px}.download{display:flex;align-items:center;justify-content:space-between;gap:12px;border:0;border-radius:16px;background:var(--soft);padding:12px;color:var(--ink);text-decoration:none}
.editor{display:grid;grid-template-columns:minmax(0,1fr);gap:0;overflow:hidden;border:1px solid var(--line);border-radius:22px;background:var(--bg)}
.panel{min-width:0;border:0;border-right:1px solid var(--line);border-radius:0;background:var(--bg);padding:16px}
.panel:last-child{border-right:0}.pages{display:grid;gap:6px}
.page{width:100%;border:0;border-left:3px solid transparent;border-radius:14px;background:transparent;padding:10px 12px;text-align:left;color:var(--ink);cursor:pointer}
.page:hover{background:var(--soft)}.page.active{border-left-color:var(--accent);background:var(--soft)}
.stage-video{display:grid;min-height:320px;place-items:center;overflow:hidden;border-bottom:1px solid var(--line);background:#0a0a0a}
.stage-video video{width:100%;height:100%;max-height:520px;object-fit:contain}
.scene-nav{display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid var(--line);padding:10px 12px}.scene-nav .btn{min-height:36px;padding-inline:12px}.scene-label{min-width:0;text-align:center}.scene-label strong,.scene-label span{display:block}.scene-label span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pages-panel{display:none;border-bottom:1px solid var(--line)}.pages-panel.open{display:block}
.words{display:flex;flex-wrap:wrap;gap:7px}.word{border:1px solid transparent;border-radius:999px;background:var(--soft);padding:8px 12px;color:var(--ink);cursor:pointer}
.word:hover{background:var(--soft-strong)}
.word[aria-pressed=true]{border-color:var(--accent);background:color-mix(in srgb,var(--accent),transparent 88%)}
.edit-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px}.edit-row .btn{white-space:nowrap}
input{width:100%;height:42px;border:1px solid var(--line);border-radius:999px;background:var(--soft);color:var(--ink);padding:0 14px}
.card,.dropzone,.style,.style-preview,.approval-sheet,.download,.editor,.page{corner-shape:squircle}
.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
.error{color:var(--danger)}
@media(min-width:860px){.kind-editor .editor{grid-template-columns:minmax(360px,1.25fr) minmax(280px,.75fr)}.kind-editor .scene-nav,.kind-editor .pages-panel{grid-column:1/-1}.kind-editor .stage-video{border-right:1px solid var(--line);border-bottom:0}}
@media(max-width:720px){.shell{padding:8px}.body{padding:14px}.kind-editor .body,.kind-styles .body{padding-inline:8px}.styles{grid-auto-columns:82%;gap:14px;padding:2px 10px 10px 2px;scroll-padding-inline:2px 10px}.style{min-width:0;width:100%;scroll-snap-stop:always}.stage-video{min-height:300px}.panel{border-right:0}.row .btn{flex:1 1 auto}.edit-row{grid-template-columns:1fr 1fr}.edit-row input{grid-column:1/-1}.scene-label{max-width:46%}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}

.video-stage video::-webkit-media-controls-fullscreen-button{display:none!important}
.playback-controls{display:flex;align-items:center;gap:10px;padding-top:10px}.playback-controls .btn{min-height:32px;padding:0 10px;font-size:12px}.playback-controls input[type=range]{height:20px;min-width:30px;flex:1;padding:0;accent-color:var(--accent);background:transparent;border:0}.playback-controls span{white-space:nowrap;font-size:11px;font-variant-numeric:tabular-nums}
/* One application frame, shared across every tool surface. */
.shell{padding:8px;max-width:1200px;margin:auto}.card,.kind-editor .card,.kind-styles .card{border:1px solid var(--line);border-radius:20px;background:var(--bg)}
.body,.kind-editor .body,.kind-styles .body{padding:20px}h1{font-size:23px}h2{font-size:16px;letter-spacing:-.015em}.workspace{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(250px,1fr);gap:20px}.video-column{min-width:0}.video-stage{position:relative;height:360px;background:#111;border-radius:14px;overflow:hidden}.video-stage video{display:block;width:100%;height:100%;object-fit:contain}.video-stage canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.style-panel{display:flex;flex-direction:column;gap:10px;min-width:0}.styles{display:grid;grid-auto-flow:row;grid-template-columns:1fr 1fr;grid-auto-columns:auto;gap:8px;max-height:272px;overflow:auto;padding:2px}.style{min-width:0;display:flex;flex-direction:column;gap:5px;padding:6px;border-radius:12px}.style strong{font-size:12px}.style small{display:block;font-size:10px;line-height:1.35}.style-poster{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:7px;background:#151515}.style[aria-pressed=true]{border-color:var(--accent);box-shadow:none;background:color-mix(in srgb,var(--accent),var(--bg) 94%)}.style:disabled{opacity:.6}.style-panel .btn{min-height:38px;padding:0 12px;font-size:12px}.scene-nav{border:0;padding:12px 0 0}.scene-label{max-width:75%;overflow:hidden;font-size:12px}.scene-label span{max-width:100%;text-overflow:ellipsis;overflow:hidden}.scene-nav .btn{min-width:36px;padding:0 10px}.result-video{display:block;width:100%;max-height:320px;border-radius:12px;background:#111}details{border-top:1px solid var(--line);padding-top:14px}summary{cursor:pointer;font-weight:600;padding:4px 0}.correction-layout{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px}.pages{max-height:260px;overflow:auto}.page{border-radius:8px;font-size:13px}.edit-row{grid-template-columns:1fr;gap:8px}.edit-row input{border-radius:10px}#style-status,#save-status{font-size:12px}.notice[hidden],form[hidden]{display:none}.notice.error{color:var(--danger);margin-top:14px}button:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
:root[data-display-mode=fullscreen] .shell{max-width:1440px;padding:24px}:root[data-display-mode=fullscreen] .card{border:0}:root[data-display-mode=fullscreen] .workspace{grid-template-columns:minmax(0,1.7fr) minmax(300px,1fr)}:root[data-display-mode=fullscreen] .video-stage{height:min(68vh,760px)}:root[data-display-mode=fullscreen] .styles{max-height:min(52vh,580px);grid-template-columns:repeat(2,minmax(0,1fr))}
@media(max-width:600px){.body,.kind-editor .body,.kind-styles .body{padding:14px}.workspace{grid-template-columns:1fr;gap:16px}.video-stage{height:260px}.styles{display:flex;max-height:none;overflow-x:auto;scroll-snap-type:x mandatory;gap:8px;padding:2px 2px 8px}.style{flex:0 0 128px;width:128px;scroll-snap-align:start}.style small{display:none}.style-panel{gap:8px}.row .btn{flex:0 1 auto}.correction-layout{grid-template-columns:1fr}.pages{max-height:150px}h1{font-size:20px}.shell{padding:4px}.scene-label{max-width:66%}:root[data-display-mode=fullscreen] .shell{padding:4px}:root[data-display-mode=fullscreen] .workspace{grid-template-columns:1fr}:root[data-display-mode=fullscreen] .video-stage{height:40vh}:root[data-display-mode=fullscreen] .styles{max-height:none}}
:root[data-display-mode=fullscreen] .shell{padding-top:max(24px,var(--host-safe-top,0px));padding-right:max(16px,var(--host-safe-right,0px));padding-bottom:max(96px,calc(var(--host-safe-bottom,0px) + 16px));padding-left:max(16px,var(--host-safe-left,0px))}
</style></head><body><main id="app" class="shell kind-${kind}"><div class="card"><span id="state" class="sr-only" role="status" aria-live="polite">Loading…</span><div id="content" class="body"><p class="muted">Preparing the interface…</p></div></div></main>
<script>${WIDGET_OVERLAY}</script>
<script>
const KIND=${JSON.stringify(kind)};const WEB=${JSON.stringify(webPublicUrl.replace(/\/$/, ''))};const API=${JSON.stringify(apiOrigin)};const PRESETS=${JSON.stringify(Object.values(STYLE_PRESETS)).replace(/</g, '\\u003c')};const content=document.getElementById('content');const state=document.getElementById('state');
${WIDGET_BRIDGE}
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]})}
function humanize(value){return String(value||'').replace(/[-_]/g,' ').replace(/\\b\\w/g,function(ch){return ch.toUpperCase()})}
function duration(ms){if(!Number.isFinite(ms))return '—';const seconds=Math.round(ms/1000);return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')}
function setStatus(label){state.textContent=label}
function safeUrl(href){const url=new URL(href,WEB);if(![new URL(WEB).origin,API].includes(url.origin)||!['http:','https:'].includes(url.protocol))throw new Error('This link is unavailable. Refresh the project.');return url}
function mediaUrl(href){const url=safeUrl(href);url.searchParams.set('stream','1');return url.href}
function openExternal(href){try{const url=safeUrl(href);if(window.openai&&window.openai.openExternal)window.openai.openExternal({href:url.href});else window.open(url.href,'_blank','noopener')}catch(error){showError(error)}}
function showError(error){let note=document.getElementById('widget-error');if(!note){note=document.createElement('p');note.id='widget-error';note.className='notice error';note.setAttribute('role','alert');content.appendChild(note)}note.textContent=error&&error.message||'Something went wrong. Please try again.';setStatus('Needs attention');notifyHeight()}
function render(next){if(!next||!Object.keys(next).length)return;if(next.project&&workspaceProject&&next.project.id===workspaceProject.id&&next.project.version<workspaceProject.version)return;rememberWorkspace();disposeWorkspace();stopApprovalTimer();output=next;if(next.task&&next.project){renderProgress()}else if(next.project){stopPolling();renderWorkspace()}else if(next.quote||next.status==='insufficient_credits'||next.status==='render_started'){stopPolling();renderApproval()}else if(next.task){renderProgress()}else if(KIND==='approval'){stopPolling();renderApproval()}else if(KIND==='start'){stopPolling();renderStart()}else{showError(new Error('Project details are not ready. Ask ChatGPT to open this project again.'))}notifyHeight()}
${WIDGET_PROGRESS}
${WIDGET_WORKSPACE}
${WIDGET_START_APPROVAL}
initializeBridge();
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
