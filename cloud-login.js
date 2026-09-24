import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  "https://uluimdlelbqjjzefvdsw.supabase.co",
  "sb_publishable_Fz_z5YgMpqCrCZnNIUeJ3g_FVGzhdNw"
);

const $ = s => document.querySelector(s);
const state = () => window.ProjectLog?.state;
const lang = (zh,en) => localStorage.getItem("ProjectLogLang")==="en" ? en : zh;
const pendingKey = "ProjectLogSharedCloudPendingV2";
const cloud = {
  rows:[],
  busy:false,
  loading:false,
  timer:null,
  ready:false,
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
bar.innerHTML='<b>☁ '+lang("共享云端工作区","Shared cloud workspace")+'</b><div class="actions"><span id="cloudStatus"></span><button class="btn" id="cloudRefresh">'+lang("刷新共享数据","Refresh shared data")+'</button><button class="btn" id="cloudRetry" hidden>'+lang("重试同步","Retry sync")+'</button><button class="btn" id="openCloudArchive">'+lang("查看云端存档","View archive")+'</button></div>';
$(".main")?.prepend(bar);

const page=document.createElement("section");
page.id="cloudArchivePage";
page.className="page";
page.innerHTML='<header class="top"><div><h1>'+lang("共享云端存档","Shared cloud archive")+'</h1><p>'+lang("所有人打开网站后读取同一份项目数据；任何人修改后都会保存回同一份云端工作区。","Everyone reads the same project data. Any edit is saved back to the same shared cloud workspace.")+'</p></div></header><div id="cloudArchiveContent"></div>';
$(".main")?.append(page);

const nav=document.createElement("button");
nav.type="button";
nav.dataset.p="cloudArchive";
nav.textContent="☁　"+lang("共享云端","Shared cloud");
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
function payloadFor(p){
  const work=JSON.parse(JSON.stringify(p));
  work.__localProjectId=p.id;
  delete work.cloudStatus; delete work.cloudDeadline; delete work.cloudCreator; delete work.cloudPublic;
  return {
    title:p.name||lang("未命名项目","Untitled project"),
    category:p.category||"",
    status:"in_progress",
    requirements:p.goal||"",
    work_data:work,
    is_public:true
  };
}
function normalized(v){
  return JSON.stringify(v,(k,item)=>item&&typeof item==="object"&&!Array.isArray(item)
    ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
}
function hasChanges(p,row){
  if(!row)return true;
  const next=payloadFor(p);
  return next.title!==row.title || next.category!==(row.category||"") ||
    next.requirements!==(row.requirements||"") || normalized(next.work_data)!==normalized(row.work_data||{});
}
function rowProject(row){
  const w=row.work_data&&typeof row.work_data==="object"?JSON.parse(JSON.stringify(row.work_data)):{};
  const id=w.__localProjectId||w.id||crypto.randomUUID();
  delete w.__localProjectId;
  return {...w,id,name:row.title,goal:row.requirements||"",category:row.category||w.category||lang("工程项目","Project")};
}
function saveBrowserState(){
  localStorage.setItem("ProjectLogV2",JSON.stringify(state()));
  window.render?.();
}
function mergeCloudIntoBrowser(){
  if(!state())return;
  let changed=false;
  for(const row of cloud.rows){
    const incoming=rowProject(row);
    const i=state().projects.findIndex(p=>p.id===incoming.id);
    if(i>=0){
      if(!cloud.dirty.has(incoming.id)){
        state().projects[i]=incoming;
        changed=true;
      }
    }else{
      state().projects.push(incoming);
      changed=true;
    }
  }
  if(!state().projects.some(p=>p.id===state().active) && state().projects[0]){
    state().active=state().projects[0].id;
    changed=true;
  }
  if(changed)saveBrowserState();
}

async function refreshRows({merge=true}={}){
  if(cloud.loading)return;
  cloud.loading=true;
  try{
    const {data,error}=await db.from("projects")
      .select("*")
      .order("updated_at",{ascending:false});
    if(error)throw error;
    cloud.rows=data||[];
    if(merge)mergeCloudIntoBrowser();
    cloud.ready=true;
    report(lang("已读取共享云端最新数据","Shared cloud data is up to date"));
    drawArchive();
  }finally{
    cloud.loading=false;
  }
}
async function flush(){
  clearTimeout(cloud.timer);
  if(cloud.busy||!cloud.ready||!cloud.dirty.size)return;
  cloud.busy=true;
  try{
    while(cloud.dirty.size){
      const localId=cloud.dirty.values().next().value;
      const p=state()?.projects?.find(x=>x.id===localId);
      cloud.dirty.delete(localId);
      if(!p){persistPending();continue;}

      let row=cloud.rows.find(r=>localIdFromRow(r)===localId);
      if(!hasChanges(p,row)){persistPending();continue;}
      const payload=payloadFor(p);
      let result;

      if(row){
        result=await db.from("projects")
          .update(payload)
          .eq("id",row.id)
          .select("*")
          .single();
      }else{
        result=await db.from("projects")
          .insert({
            ...payload,
            id:crypto.randomUUID()
          })
          .select("*")
          .single();
      }

      if(result.error){
        cloud.dirty.add(localId);
        throw result.error;
      }
      if(row)Object.assign(row,result.data);
      else cloud.rows.push(result.data);
      persistPending();
    }
    report(lang("已保存到共享云端","Saved to shared cloud"));
    $("#cloudRetry").hidden=true;
    drawArchive();
  }catch(error){
    console.error("ProjectLog shared cloud",error);
    report(lang("共享云端保存失败；浏览器本地副本仍然安全。","Shared cloud save failed; the browser copy is still safe."),true);
    $("#cloudRetry").hidden=false;
  }finally{
    cloud.busy=false;
  }
}

function wrapSave(){
  const original=window.save;
  if(typeof original!=="function"||original.__sharedCloudWrapped)return;
  const wrapped=function(...args){
    const out=original.apply(this,args);
    if(!cloud.ready)return out;
    for(const p of state()?.projects||[]){
      const row=cloud.rows.find(r=>localIdFromRow(r)===p.id);
      if(hasChanges(p,row))cloud.dirty.add(p.id);
    }
    persistPending();
    if(cloud.dirty.size){
      report(lang("已保存到浏览器，正在同步共享云端…","Saved locally, syncing shared cloud…"));
      clearTimeout(cloud.timer);
      cloud.timer=setTimeout(flush,700);
    }
    return out;
  };
  wrapped.__sharedCloudWrapped=true;
  window.save=wrapped;
}

function drawArchive(){
  const root=$("#cloudArchiveContent");
  if(!root)return;
  const rows=[...cloud.rows].sort((a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||"")));
  root.innerHTML='<div class="card panel"><p class="muted">'+lang(
    "这里是所有访问者共用的云端项目存档。没有登录、游客、老师、管理员或公开/私密权限；所有人使用同一份数据。",
    "This archive is shared by every visitor. There are no login, visitor, teacher, admin, or public/private roles; everyone uses the same data."
  )+'</p></div><div class="archive-list">'+(rows.map(row=>{
    const when=row.updated_at?new Date(row.updated_at).toLocaleString():"";
    return '<div class="item"><div class="item-head"><div><b>'+escapeHtml(row.title||"")+'</b><div class="meta">'+escapeHtml(when)+'</div></div><button class="btn small" data-restore="'+escapeHtml(row.id)+'">'+lang("恢复到当前浏览器","Restore to browser")+'</button></div></div>';
  }).join("")||'<div class="card empty">'+lang("共享云端暂时没有项目。","The shared cloud workspace has no projects yet.")+'</div>')+'</div>';
  root.querySelectorAll("[data-restore]").forEach(btn=>btn.onclick=()=>restoreRow(btn.dataset.restore));
}
function escapeHtml(v=""){
  return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function restoreRow(rowId){
  const row=cloud.rows.find(r=>r.id===rowId);
  if(!row||!state())return;
  const p=rowProject(row);
  const i=state().projects.findIndex(x=>x.id===p.id);
  if(i>=0)state().projects[i]=p;else state().projects.push(p);
  state().active=p.id;
  cloud.dirty.delete(p.id);
  persistPending();
  saveBrowserState();
  report(lang("已从共享云端恢复到当前浏览器","Restored shared cloud data to this browser"));
}

async function pullLatest(){
  if(cloud.dirty.size){
    await flush();
    if(cloud.dirty.size)return;
  }
  report(lang("正在刷新共享数据…","Refreshing shared data…"));
  try{
    await refreshRows({merge:true});
  }catch(error){
    console.error("ProjectLog shared refresh",error);
    report(lang("刷新失败，请检查网络或云端权限设置。","Refresh failed. Check the network or cloud access policy."),true);
  }
}

$("#cloudRetry").onclick=async()=>{await pullLatest();await flush();};
$("#cloudRefresh").onclick=pullLatest;
$("#openCloudArchive").onclick=()=>{window.showPage?.("cloudArchive");drawArchive();};
nav.onclick=()=>{window.showPage?.("cloudArchive");drawArchive();};
window.addEventListener("online",pullLatest);
window.addEventListener("focus",()=>{if(cloud.ready&&!cloud.busy&&!cloud.dirty.size)pullLatest();});
window.addEventListener("beforeunload",e=>{if(cloud.dirty.size){e.preventDefault();e.returnValue="";}});

async function initialize(){
  wrapSave();
  try{
    report(lang("正在连接共享云端数据库…","Connecting shared cloud database…"));

    // Pull first. This prevents a new browser's default local content from overwriting shared data.
    await refreshRows({merge:true});

    // Only browser projects that do not yet exist in shared cloud are uploaded.
    for(const p of state()?.projects||[]){
      if(!cloud.rows.some(r=>localIdFromRow(r)===p.id))cloud.dirty.add(p.id);
    }
    persistPending();
    if(cloud.dirty.size)await flush();
    else report(lang("共享云端已连接","Shared cloud connected"));
  }catch(error){
    console.error("ProjectLog shared cloud initialization",error);
    report(lang("共享云端暂不可用；网站仍可在当前浏览器正常编辑。","Shared cloud is unavailable; the site still works in this browser."),true);
    $("#cloudRetry").hidden=false;
  }
  drawArchive();
}
initialize();
