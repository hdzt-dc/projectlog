import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  "https://uluimdlelbqjjzefvdsw.supabase.co",
  "sb_publishable_Fz_z5YgMpqCrCZnNIUeJ3g_FVGzhdNw"
);

const $ = s => document.querySelector(s);
const state = () => window.ProjectLog?.state;
const lang = (zh,en) => localStorage.getItem("ProjectLogLang")==="en" ? en : zh;
const pendingKey = "ProjectLogCloudPendingOpenV1";
const cloud = {
  user:null, rows:[], busy:false, timer:null,
  dirty:new Set((()=>{try{return JSON.parse(localStorage.getItem(pendingKey))||[]}catch{return[]}})())
};

const style=document.createElement("style");
style.textContent=`
#cloudBar{margin:0 0 18px;padding:12px 16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}
#cloudBar .actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#cloudStatus{font-size:12px}
#cloudArchivePage .archive-list{display:grid;gap:10px}
`;
document.head.append(style);

const bar=document.createElement("div");
bar.id="cloudBar";
bar.className="card";
bar.innerHTML='<b>☁ '+lang("云端存档","Cloud archive")+'</b><div class="actions"><span id="cloudStatus"></span><button class="btn" id="cloudRetry" hidden>'+lang("重试同步","Retry sync")+'</button><button class="btn" id="openCloudArchive">'+lang("查看云端存档","View archive")+'</button></div>';
$(".main")?.prepend(bar);

const page=document.createElement("section");
page.id="cloudArchivePage";
page.className="page";
page.innerHTML='<header class="top"><div><h1>'+lang("云端存档","Cloud archive")+'</h1><p>'+lang("网站无需登录。所有人都可以编辑；这里仅用于自动备份和恢复。","No sign-in is required. Everyone can edit; this page is only for automatic backup and restore.")+'</p></div></header><div id="cloudArchiveContent"></div>';
$(".main")?.append(page);

const nav=document.createElement("button");
nav.type="button";
nav.dataset.p="cloudArchive";
nav.textContent="☁　"+lang("云端存档","Cloud archive");
$(".nav")?.append(nav);

function report(msg,bad=false){
  const el=$("#cloudStatus");
  if(el){el.textContent=msg;el.style.color=bad?"#b42318":"#18794e";}
}
function persistPending(){
  localStorage.setItem(pendingKey,JSON.stringify([...cloud.dirty]));
}
function localIdFromRow(row){
  return row?.work_data?.__localProjectId || row?.work_data?.id || null;
}
function payloadFor(p,row){
  const work=JSON.parse(JSON.stringify(p));
  work.__localProjectId=p.id;
  delete work.cloudStatus; delete work.cloudDeadline; delete work.cloudCreator; delete work.cloudPublic;
  const payload={
    title:p.name||lang("未命名项目","Untitled project"),
    category:p.category||"",
    status:"in_progress",
    requirements:p.goal||"",
    work_data:work,
    is_public:false
  };
  return payload;
}
function normalized(v){
  return JSON.stringify(v,(k,item)=>item&&typeof item==="object"&&!Array.isArray(item)
    ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
}
function hasChanges(p,row){
  if(!row)return true;
  const next=payloadFor(p,row);
  return next.title!==row.title || next.category!==(row.category||"") ||
    next.requirements!==(row.requirements||"") || normalized(next.work_data)!==normalized(row.work_data||{});
}
function rowProject(row){
  const w=row.work_data&&typeof row.work_data==="object"?JSON.parse(JSON.stringify(row.work_data)):{};
  const id=w.__localProjectId||w.id||crypto.randomUUID();
  delete w.__localProjectId;
  return {...w,id,name:row.title,goal:row.requirements||"",category:row.category||w.category||lang("工程项目","Project")};
}

async function ensureAnonymousUser(){
  const {data:{session}}=await db.auth.getSession();
  if(session?.user){cloud.user=session.user;return true;}
  const {data,error}=await db.auth.signInAnonymously();
  if(error)throw error;
  cloud.user=data.user;
  return Boolean(cloud.user);
}
async function refreshRows(){
  if(!cloud.user)return;
  const {data,error}=await db.from("projects")
    .select("*")
    .eq("created_by",cloud.user.id)
    .order("updated_at",{ascending:false});
  if(error)throw error;
  cloud.rows=data||[];
}
async function flush(){
  clearTimeout(cloud.timer);
  if(cloud.busy||!cloud.user||!cloud.dirty.size)return;
  cloud.busy=true;
  try{
    while(cloud.dirty.size){
      const localId=cloud.dirty.values().next().value;
      const p=state()?.projects?.find(x=>x.id===localId);
      cloud.dirty.delete(localId);
      if(!p){persistPending();continue;}
      const row=cloud.rows.find(r=>localIdFromRow(r)===localId);
      if(!hasChanges(p,row)){persistPending();continue;}
      const payload=payloadFor(p,row);
      let result;
      if(row){
        result=await db.from("projects").update(payload).eq("id",row.id).eq("created_by",cloud.user.id).select("*").single();
      }else{
        result=await db.from("projects").insert({
          ...payload,
          id:crypto.randomUUID(),
          created_by:cloud.user.id,
          assigned_to:cloud.user.id
        }).select("*").single();
      }
      if(result.error){cloud.dirty.add(localId);throw result.error;}
      if(row)Object.assign(row,result.data);else cloud.rows.push(result.data);
      persistPending();
    }
    report(lang("已自动保存到云端","Saved to cloud automatically"));
    $("#cloudRetry").hidden=true;
    drawArchive();
  }catch(error){
    console.error("ProjectLog cloud archive",error);
    report(lang("云端存档失败；浏览器本地副本仍然安全。","Cloud archive failed; the browser copy is still safe."),true);
    $("#cloudRetry").hidden=false;
  }finally{cloud.busy=false;}
}
function markAllDirty(){
  for(const p of state()?.projects||[])cloud.dirty.add(p.id);
  persistPending();
}
function wrapSave(){
  const original=window.save;
  if(typeof original!=="function"||original.__cloudWrapped)return;
  const wrapped=function(...args){
    const out=original.apply(this,args);
    for(const p of state()?.projects||[]){
      const row=cloud.rows.find(r=>localIdFromRow(r)===p.id);
      if(hasChanges(p,row))cloud.dirty.add(p.id);
    }
    persistPending();
    report(lang("已保存到浏览器，正在同步云端…","Saved locally, syncing to cloud…"));
    clearTimeout(cloud.timer);
    cloud.timer=setTimeout(flush,800);
    return out;
  };
  wrapped.__cloudWrapped=true;
  window.save=wrapped;
}
function drawArchive(){
  const root=$("#cloudArchiveContent");
  if(!root)return;
  const rows=[...cloud.rows].sort((a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||"")));
  root.innerHTML='<div class="card panel"><p class="muted">'+lang(
    "云端存档只负责备份，不再包含登录、游客、老师、管理员、公开/私密或权限设置。",
    "Cloud archive is backup only. There are no login, visitor, teacher, admin, public/private, or permission settings."
  )+'</p></div><div class="archive-list">'+(rows.map(row=>{
    const localId=localIdFromRow(row)||"";
    const when=row.updated_at?new Date(row.updated_at).toLocaleString():"";
    return '<div class="item"><div class="item-head"><div><b>'+escapeHtml(row.title||"")+'</b><div class="meta">'+escapeHtml(when)+'</div></div><button class="btn small" data-restore="'+escapeHtml(row.id)+'" data-local="'+escapeHtml(localId)+'">'+lang("恢复此存档","Restore")+'</button></div></div>';
  }).join("")||'<div class="card empty">'+lang("还没有云端存档。编辑项目后会自动创建。","No cloud archives yet. Editing a project will create one automatically.")+'</div>')+'</div>';
  root.querySelectorAll("[data-restore]").forEach(btn=>btn.onclick=()=>restoreRow(btn.dataset.restore));
}
function escapeHtml(v=""){
  return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function restoreRow(rowId){
  const row=cloud.rows.find(r=>r.id===rowId);
  if(!row||!state())return;
  const p=rowProject(row);
  if(!confirm(lang(
    '用云端存档“'+(row.title||"")+'”覆盖当前浏览器中的同一项目？',
    'Replace the browser copy of "'+(row.title||"")+'" with this cloud archive?'
  )))return;
  const i=state().projects.findIndex(x=>x.id===p.id);
  if(i>=0)state().projects[i]=p;else state().projects.push(p);
  state().active=p.id;
  localStorage.setItem("ProjectLogV2",JSON.stringify(state()));
  window.render?.();
  report(lang("已从云端存档恢复","Restored from cloud archive"));
}
$("#cloudRetry").onclick=flush;
$("#openCloudArchive").onclick=()=>{window.showPage?.("cloudArchive");drawArchive();};
nav.onclick=()=>{window.showPage?.("cloudArchive");drawArchive();};
window.addEventListener("online",flush);
window.addEventListener("beforeunload",e=>{if(cloud.dirty.size){e.preventDefault();e.returnValue="";}});

async function initialize(){
  try{
    report(lang("正在连接云端存档…","Connecting cloud archive…"));
    await ensureAnonymousUser();
    await refreshRows();
    wrapSave();
    for(const p of state()?.projects||[]){
      const row=cloud.rows.find(r=>localIdFromRow(r)===p.id);
      if(hasChanges(p,row))cloud.dirty.add(p.id);
    }
    persistPending();
    if(cloud.dirty.size)await flush();
    else report(lang("云端存档已连接","Cloud archive connected"));
    drawArchive();
  }catch(error){
    console.error("ProjectLog cloud initialization",error);
    wrapSave();
    report(lang("云端存档暂不可用；网站仍可正常编辑并保存在浏览器。","Cloud archive is temporarily unavailable; editing and browser storage still work."),true);
    $("#cloudRetry").hidden=false;
  }
}
initialize();
