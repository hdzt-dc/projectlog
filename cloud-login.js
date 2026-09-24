import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  "https://uluimdlelbqjjzefvdsw.supabase.co",
  "sb_publishable_Fz_z5YgMpqCrCZnNIUeJ3g_FVGzhdNw"
);
const adminEmail = "hdzt_dc@outlook.com";
const pendingKey = "ProjectLogCloudPendingV1";
const pendingFromDisk = (() => { try { return JSON.parse(localStorage.getItem(pendingKey)) || []; } catch { return []; } })();
const cloud = { user: null, role: null, rows: [], comments: [], profile: null, busy: false, dirty: new Set(pendingFromDisk), conflicts: new Set(), timer: null };
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);
const lang = (zh, en) => localStorage.getItem("ProjectLogLang") === "en" ? en : zh;
const state = () => window.ProjectLog.state;
const report = (message, bad = false) => {
  const el = $("#cloudStatus");
  if (el) { el.textContent = message; el.style.color = bad ? "#b42318" : "#18794e"; }
};

const style = document.createElement("style");
style.textContent = `
#passwordPanel[hidden]{display:none!important}#passwordPanel{margin:0 0 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}#passwordPanel input{margin:0 10px;padding:8px;max-width:260px}\n#cloudBar{margin:0 0 18px;padding:12px 16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}
#cloudBar .actions{align-items:center}#cloudStatus{font-size:12px}
#cloudPage .cloud-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px}
#cloudPage .cloud-card{padding:17px}#cloudPage .cloud-card h3{margin:4px 0}
#cloudPage .cloud-card .body{max-height:190px;overflow:auto}
#cloudPage .cloud-form{display:grid;gap:10px;max-width:700px}
#cloudPage textarea{min-height:100px;resize:vertical;width:100%}
#cloudPage input{width:100%}
#cloudPage .cloud-discussion{border-top:1px solid #e5e7eb;padding:10px 0}
#cloudPage .cloud-discussion:first-child{border:0}
#cloudPage .cloud-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
body.cloud-teacher .main>.page:not(#cloudPage),body.cloud-pending .main>.page:not(#cloudPage){display:none!important}
body.cloud-teacher .nav button:not([data-p="cloud"]),body.cloud-pending .nav button:not([data-p="cloud"]){display:none!important}
body.cloud-teacher .now,body.cloud-pending .now{display:none}
body.cloud-teacher #cloudPage,body.cloud-pending #cloudPage{display:block!important}
`;
document.head.append(style);
const bar = document.createElement("div");
bar.id = "cloudBar";
bar.className = "card";
bar.innerHTML = '<span id="cloudIdentity"></span><div class="actions"><span id="cloudStatus"></span><button class="btn" id="cloudRetry" hidden>重试同步</button><button class="btn" id="cloudLogin">登录并开启备份</button><button class="btn" id="cloudLogout" hidden>退出登录</button></div>';
$(".main").prepend(bar);
const passwordButton = document.createElement("button");
passwordButton.id = "setPassword"; passwordButton.className = "btn";
passwordButton.textContent = "设置密码 / Set password";
passwordButton.hidden = true;
$("#cloudLogout").before(passwordButton);
passwordButton.onclick = () => $("#passwordPanel").hidden = false;
const passwordPanel = document.createElement("form");
passwordPanel.id = "passwordPanel"; passwordPanel.className = "card panel"; passwordPanel.hidden = true;
passwordPanel.innerHTML = `<label>设置登录密码（至少 8 位） / Set password (8+ characters)<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><button class="btn primary" type="submit">保存密码 / Save password</button><button class="btn" type="button" id="cancelPassword">取消 / Cancel</button><span id="passwordStatus" role="status"></span>`;
bar.after(passwordPanel);
$("#cancelPassword").onclick = () => { passwordPanel.hidden = true; passwordPanel.reset(); };
passwordPanel.onsubmit = async event => {
  event.preventDefault();
  if (!cloud.user || !["admin", "teacher"].includes(cloud.role)) return;
  const button = passwordPanel.querySelector("button[type=submit]");
  const status = $("#passwordStatus");
  button.disabled = true;
  status.textContent = "正在保存密码… / Saving password…";
  try {
    const password = passwordPanel.querySelector("input[name=password]").value;
    const { error } = await db.auth.updateUser({ password });
    if (error) status.textContent = `保存失败：${error.message} / Could not save password.`;
    else {
      passwordPanel.reset();
      passwordPanel.hidden = true;
      status.textContent = "";
      report(lang("密码已保存，下次可用邮箱和密码登录。", "Password saved. Sign in with your email and password next time."));
    }
  } catch (error) { status.textContent = "保存失败，请检查网络后重试。 / Could not save password. Check your connection."; }
  finally { button.disabled = false; }
};
const page = document.createElement("section");
page.id = "cloudPage";
page.className = "page";
page.innerHTML = '<header class="top"><div><h1>任务与评价</h1><p id="cloudSubtitle">老师可以布置项目和批注作品；项目仍在原来的项目中心。</p></div></header><div id="cloudContent"></div>';
$(".main").append(page);
const nav = document.createElement("button");
nav.type = "button"; nav.dataset.p = "cloud"; nav.textContent = "✎　任务与评价";
$(".nav").prepend(nav);
nav.addEventListener("click", () => {
  window.showPage("cloud");
  draw();
});
// The login gate is present in HTML, so authentication failures stay closed.
const gate = document.getElementById("loginGate");
const gateStatus = document.getElementById("loginStatus");
$("#sendLogin").disabled = false;
$("#passwordLogin").disabled = false;
$("#guestEntry").disabled = false;
let authBusy = false;
function enterMode(mode) {
  document.documentElement.dataset.access = mode;
  gate.hidden = mode !== "login";
  document.getElementById("readerView").hidden = mode !== "reader";
}
$("#cloudLogin").onclick = () => enterMode("login");
$("#readerLogin").onclick = () => enterMode("login");
$("#loginForm").onsubmit = async event => {
  event.preventDefault();
  const button = $("#passwordLogin");
  button.disabled = true;
  gateStatus.textContent = "正在登录… / Signing in…";
  try {
    const { error } = await db.auth.signInWithPassword({
      email: $("#loginEmail").value.trim(), password: $("#loginPassword").value
    });
    if (error) gateStatus.textContent = "无法登录：请检查邮箱和密码。首次使用请先点击下方邮件链接验证。 / Check your email and password, or verify your email first.";
    else { $("#loginPassword").value = ""; await initialize(); }
  } catch (error) { gateStatus.textContent = "无法连接，请检查网络后重试。 / Connection failed. Please retry."; }
  finally { button.disabled = false; }
};
$("#sendLogin").onclick = async () => {
  const email = $("#loginEmail");
  if (!email.reportValidity()) return;
  const button = $("#sendLogin");
  button.disabled = true;
  gateStatus.textContent = "正在发送… / Sending…";
  try {
    const { error } = await db.auth.signInWithOtp({
      email: email.value.trim(), options: { emailRedirectTo: "https://hdzt-dc.github.io/projectlog/" }
    });
    gateStatus.textContent = error ? error.message : "请打开邮箱里的登录链接。进入工作台后可设置密码。 / Open the email link, then set a password in the workspace.";
  } catch (error) { gateStatus.textContent = "邮件发送失败，请稍后重试。 / Could not send email. Retry later."; }
  finally { button.disabled = false; }
};
async function loadPublicProjects() {
  // Guest rendering never reads the administrator's browser records.
  enterMode("reader");
  const content = $("#readerContent");
  content.textContent = "正在读取公开项目… / Loading public projects…";
  try {
    const { data, error } = await db.from("projects").select("*").eq("is_public", true).order("updated_at", { ascending: false });
    if (error) throw error;
    content.innerHTML = data.length ? data.map(row => `<article class="card panel"><h2>${escapeHTML(row.title)}</h2><p>${escapeHTML(row.requirements)}</p>${workPreview(rowProject(row), row.id)}</article>`).join("") : "暂时没有公开项目。私有备份不会在这里显示。 / No public projects yet.";
    content.querySelectorAll("[data-annotate]").forEach(button => button.remove());
  } catch (error) {
    console.error("ProjectLog public projects", error);
    const permission = error.code === "42501";
    content.replaceChildren();
    const message = document.createElement("p");
    message.textContent = permission
      ? "公开项目读取权限尚未修复，请联系站点管理员。 / Public access needs a database permission fix."
      : "暂时无法加载公开项目，请检查网络并重试。 / Could not load public projects. Check your connection and retry.";
    const detail = document.createElement("p");
    detail.textContent = [error.code, error.message].filter(Boolean).join(" · ");
    const retry = document.createElement("button");
    retry.className = "btn"; retry.textContent = "重试 / Retry"; retry.onclick = loadPublicProjects;
    content.append(message, detail, retry);
  }
}
$("#guestEntry").onclick = loadPublicProjects;
$("#cloudLogout").onclick = async () => {
  await flush();
  if (cloud.dirty.size) {
    report(lang("仍有记录未同步，请先点击“重试同步”。", "Unsynced changes remain. Please retry sync before signing out."), true);
    return;
  }
  const { error } = await db.auth.signOut();
  if (error) report(error.message, true);
  else location.reload();
};
$("#cloudRetry").onclick = flush;

function rowProject(row) {
  const work = row.work_data && typeof row.work_data === "object" ? row.work_data : {};
  return {
    ...work, id: row.id, name: row.title, goal: row.requirements,
    category: row.category || work.category || "工程项目",
    stages: Array.isArray(work.stages) ? work.stages : [],
    logs: Array.isArray(work.logs) ? work.logs : [],
    experiments: Array.isArray(work.experiments) ? work.experiments : [],
    issues: Array.isArray(work.issues) ? work.issues : [],
    summary: work.summary || {},
    cloudStatus: row.status, cloudDeadline: row.deadline,
    cloudCreator: row.created_by, cloudPublic: row.is_public
  };
}

async function refresh() {
  if (!cloud.user) return;
  const profileResult = await db.from("profiles").select("id,email,display_name,role").eq("id", cloud.user.id).single();
  if (profileResult.error) { report(profileResult.error.message, true); return; }
  cloud.profile = profileResult.data;
  cloud.role = cloud.profile.role;
  $("#setPassword").hidden = !["admin", "teacher"].includes(cloud.role);
  enterMode("workspace");
  $("#cloudIdentity").textContent = cloud.user.email + " · " + cloud.role;
  document.body.classList.toggle("cloud-teacher", cloud.role === "teacher");
  document.body.classList.toggle("cloud-pending", cloud.role === "pending");
  const [projects, comments] = await Promise.all([
    db.from("projects").select("*").order("updated_at", { ascending: false }),
    db.from("project_comments").select("*").order("created_at", { ascending: true })
  ]);
  if (projects.error || comments.error) {
    report((projects.error || comments.error).message, true);
    return;
  }
  cloud.rows = projects.data;
  cloud.comments = comments.data;
  if (cloud.role === "admin") {
    let changed = false;
    cloud.conflicts.clear();
    for (const row of cloud.rows) {
      if (row.status === "archived") continue;
      const i = state().projects.findIndex(p => p.id === row.id);
      if (i >= 0) {
        // Never silently overwrite browser work with a cloud snapshot.
        if (!cloud.dirty.has(row.id) && hasChanges(state().projects[i], row)) cloud.conflicts.add(row.id);
      } else { state().projects.push(rowProject(row)); changed = true; }
    }
    if (changed) { localStorage.setItem("ProjectLogV2", JSON.stringify(state())); window.render(); }
    // Keep the existing project center; projects with no cloud copy are backed up here.
    for (const p of state().projects) {
      if (!cloud.rows.some(row => row.id === p.id)) cloud.dirty.add(p.id);
    }
    persistPending();
    if (cloud.dirty.size) {
      report(lang("正在备份浏览器项目到云端…", "Backing up browser projects…"));
      await flush();
    } else if (cloud.conflicts.size) {
      report(lang("发现本地与云端版本不同，请到“备份与评价”选择保留哪一份。", "Browser and cloud versions differ; choose which copy to keep in Backup and reviews."), true);
    } else report(lang("项目已在云端备份", "Projects backed up to cloud"));
  }
  draw();
}

async function initialize() {
  if (authBusy) return;
  authBusy = true;
  try {
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) {
      cloud.user = null; cloud.role = null;
      if (document.documentElement.dataset.access === "workspace") enterMode("login");
      gateStatus.textContent = "请输入邮箱获取登录链接，或选择仅阅读。 / Sign in by email or continue read-only.";
      return;
    }
    cloud.user = data.user;
    $("#cloudIdentity").textContent = data.user.email;
    $("#cloudLogin").hidden = true; $("#cloudLogout").hidden = false;
    await refresh();
    if (!cloud.role) gateStatus.textContent = "账号权限读取失败，请刷新重试。 / Could not load permissions. Please refresh.";
  } catch (error) {
    gateStatus.textContent = "连接失败，请检查网络并刷新。 / Connection failed. Please refresh.";
  } finally { authBusy = false; }
}

const originalSave = window.save;
function persistPending() {
  localStorage.setItem(pendingKey, JSON.stringify([...cloud.dirty]));
}
function payloadFor(p, row) {
  const work = { ...p };
  for (const key of ["id", "name", "goal", "category", "cloudStatus",
    "cloudDeadline", "cloudCreator", "cloudPublic"]) delete work[key];
  const payload = {
    title: p.name, category: p.category || "", status: p.cloudStatus || "in_progress",
    work_data: work
  };
  if (!row || row.created_by === cloud.user.id) payload.requirements = p.goal || "";
  return payload;
}
function hasChanges(p, row) {
  if (!row) return true;
  const next = payloadFor(p, row);
  const baseline = payloadFor(rowProject(row), row);
  const ordered = value => JSON.stringify(value, (key, item) =>
    item && !Array.isArray(item) && typeof item === "object"
      ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]]))
      : item
  );
  return next.title !== baseline.title || next.category !== baseline.category ||
    (next.requirements !== undefined && next.requirements !== baseline.requirements) ||
    ordered(next.work_data) !== ordered(baseline.work_data);
}
window.save = function () {
  if (cloud.role !== "admin" || !cloud.user) return;
  originalSave();
  let touched = false;
  for (const p of state().projects) {
    if (cloud.conflicts.has(p.id)) continue;
    const row = cloud.rows.find(item => item.id === p.id);
    if (hasChanges(p, row)) { cloud.dirty.add(p.id); touched = true; }
  }
  if (!touched) return;
  persistPending();
  report(lang("已在浏览器保存，正在同步云端…", "Saved locally, syncing to cloud…"));
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(flush, 1000);
};

async function flush() {
  clearTimeout(cloud.timer);
  if (cloud.busy || !cloud.dirty.size || cloud.role !== "admin") return;
  cloud.busy = true;
  try {
    while (cloud.dirty.size) {
      const projectId = cloud.dirty.values().next().value;
      cloud.dirty.delete(projectId);
      const p = state().projects.find(item => item.id === projectId);
      if (!p) { persistPending(); continue; }
      if (cloud.conflicts.has(projectId)) { persistPending(); continue; }
      const row = cloud.rows.find(item => item.id === projectId);
      if (!hasChanges(p, row)) { persistPending(); continue; }
      const payload = payloadFor(p, row);
      const result = row
        ? await db.from("projects").update(payload).eq("id", projectId).select("*").single()
        : await db.from("projects").insert({
          ...payload, id: projectId, created_by: cloud.user.id,
          assigned_to: cloud.user.id, is_public: false
        }).select("*").single();
      if (result.error) { cloud.dirty.add(projectId); throw result.error; }
      if (row) Object.assign(row, result.data);
      else cloud.rows.push(result.data);
      persistPending();
      report(lang("已自动保存到云端", "Saved to cloud automatically"));
      $("#cloudRetry").hidden = true;
    }
  } catch (error) {
    report(lang("云端保存失败，浏览器副本仍在。请检查网络并重试同步。", "Cloud save failed. Your browser copy remains; retry sync."), true);
    $("#cloudRetry").hidden = false;
    console.error("ProjectLog sync", error);
  } finally { cloud.busy = false; }
}
window.addEventListener("online", flush);
window.addEventListener("beforeunload", event => {
  if (cloud.role === "admin" && cloud.dirty.size) { event.preventDefault(); event.returnValue = ""; }
});
const removeLocalProject = window.deleteProject;
window.deleteProject = function (projectId) {
  if (cloud.rows.some(row => row.id === projectId)) {
    alert(lang("为防止误删，已备份项目暂不支持直接删除。你可以先导出 JSON 备份。", "To prevent accidental loss, backed-up projects cannot be deleted directly. Export a JSON backup first."));
    return;
  }
  removeLocalProject(projectId);
};

for (const name of ["projectModal", "deleteProject", "stageModal", "taskModal", "toggleTask", "removeTask", "removeStage", "logModal", "experimentModal", "issueModal", "remove", "saveSummary", "codeRecordModal", "removeCodeRecord"]) {
  const handler = window[name];
  if (typeof handler === "function") window[name] = function (...args) {
    if (cloud.role !== "admin") return;
    return handler.apply(this, args);
  };
}


// Keep publication next to the project's own edit controls.
const originalProjectModal = window.projectModal;
window.projectModal = function (projectId) {
  if (cloud.role !== "admin") return;
  originalProjectModal(projectId);
  const current = state().projects.find(project => project.id === projectId);
  const backedUp = cloud.rows.find(row => row.id === projectId);
  const field = document.createElement("label");
  field.className = "field full";
  field.style.cssText = "display:flex;gap:10px;align-items:flex-start;cursor:pointer";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = "projectPublic";
  checkbox.checked = Boolean(backedUp?.is_public ?? current?.cloudPublic);
  checkbox.style.cssText = "width:auto;margin-top:4px";
  const label = document.createElement("span");
  label.textContent = lang(
    "公开项目：允许访客阅读此项目已备份的标题、要求、日志、代码和附件",
    "Public project: visitors may read backed-up titles, requirements, logs, code and attachments"
  );
  field.append(checkbox, label);
  document.querySelector("#modalRoot .form")?.append(field);
  const saveButton = document.querySelector("#modalRoot #saveBtn");
  const saveProject = saveButton.onclick;
  saveButton.onclick = () => {
    const desired = checkbox.checked;
    const wasPublic = Boolean(backedUp?.is_public ?? current?.cloudPublic);
    if (desired && !wasPublic && !confirm(lang(
      "确定公开该项目？访客可以阅读项目内已备份的日志、代码和附件。",
      "Publish this project? Visitors may read backed-up logs, code and attachments."
    ))) return;
    saveProject();
    // Validation errors leave the edit dialog open.
    if (document.querySelector("#modalRoot #saveBtn") === saveButton) return;
    const savedId = projectId || state().active;
    if (desired !== wasPublic) setProjectVisibility(savedId, desired);
  };
};

async function setProjectVisibility(projectId, isPublic) {
  if (cloud.role !== "admin" || !cloud.user) return;
  const project = state().projects.find(item => item.id === projectId);
  if (!project) return;
  if (cloud.conflicts.has(projectId)) {
    report(lang("本地与云端版本冲突。请先在备份与评价中选择保留哪个版本。", "Resolve the browser/cloud version conflict before changing visibility."), true);
    return;
  }
  report(lang("正在保存项目和公开设置…", "Saving project and visibility…"));
  cloud.dirty.add(projectId);
  persistPending();
  if (cloud.busy) {
    while (cloud.busy) await new Promise(resolve => setTimeout(resolve, 100));
  }
  await flush();
  if (cloud.dirty.has(projectId)) {
    report(lang("云端备份失败，公开状态尚未更改；本地内容仍在浏览器中。", "Backup failed; visibility was not changed. Your browser copy remains."), true);
    return;
  }
  const row = cloud.rows.find(item => item.id === projectId);
  if (!row) {
    report(lang("未找到云端备份，公开设置尚未保存。", "Cloud backup missing; visibility was not saved."), true);
    return;
  }
  const { data, error } = await db.from("projects").update({ is_public: isPublic }).eq("id", projectId).select("id,is_public").single();
  if (error) {
    report(lang("公开设置保存失败：", "Could not save visibility: ") + error.message, true);
    return;
  }
  row.is_public = data.is_public;
  project.cloudPublic = data.is_public;
  report(data.is_public
    ? lang("项目已公开，访客可仅阅读。", "Project is public and readable by visitors.")
    : lang("项目已设为私密。", "Project is private."));
  draw();
}

async function createAssignment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const title = form.elements.title.value.trim();
  const requirements = form.elements.requirements.value.trim();
  if (!title) return;
  const { error } = await db.rpc("create_assigned_project", {
    p_title: title, p_requirements: requirements,
    p_category: form.elements.category.value.trim(),
    p_deadline: form.elements.deadline.value || null
  });
  if (error) return report(error.message, true);
  form.reset();
  report(lang("项目已创建并自动保存。", "Project created and saved."));
  await refresh();
}
async function approve(userId) {
  const { error } = await db.rpc("approve_teacher", { p_user_id: userId });
  if (error) return report(error.message, true);
  report(lang("教师账号已批准。", "Teacher account approved."));
  await draw();
}
async function revoke(userId) {
  if (!confirm(lang("确定撤销教师权限？", "Revoke teacher access?"))) return;
  const { error } = await db.rpc("revoke_teacher", { p_user_id: userId });
  if (error) return report(error.message, true);
  await draw();
}
async function sendComment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const rating = form.elements.rating.value;
  const { error } = await db.from("project_comments").insert({
    project_id: form.elements.project.value, author_id: cloud.user.id,
    target_type: form.elements.target.value, target_key: form.elements.targetKey.value || "",
    comment_type: rating ? "evaluation" : "annotation",
    rating: rating ? Number(rating) : null, body: form.elements.body.value.trim()
  });
  if (error) return report(error.message, true);
  await refresh();
}
async function replyTo(projectId, parentId) {
  const body = prompt(lang("输入回复内容：", "Write a reply:"));
  if (!body?.trim()) return;
  const { error } = await db.from("project_comments").insert({
    project_id: projectId, parent_id: parentId, author_id: cloud.user.id,
    target_type: "project", comment_type: "reply", body: body.trim()
  });
  if (error) return report(error.message, true);
  await refresh();
}
function restoreOne(projectId) {
  if (cloud.role !== "admin") return;
  const row = cloud.rows.find(item => item.id === projectId);
  if (!row) return;
  const current = state().projects.find(item => item.id === projectId);
  const label = current
    ? lang("这会用云端备份替换当前浏览器里的同名项目。", "This replaces the browser copy with the cloud backup.")
    : lang("这会将备份添加回项目中心。", "This adds the backup to the project center.");
  if (!confirm(`${row.title}\n${label}\n${lang("系统会先自动下载当前浏览器的 JSON 备份。继续？", "A JSON backup of your browser data will download first. Continue?")}`)) return;
  window.exportData();
  const recovered = rowProject(row);
  const index = state().projects.findIndex(item => item.id === projectId);
  if (index < 0) state().projects.push(recovered);
  else state().projects[index] = recovered;
  state().active = projectId;
  cloud.dirty.delete(projectId);
  cloud.conflicts.delete(projectId);
  persistPending();
  localStorage.setItem("ProjectLogV2", JSON.stringify(state()));
  window.render();
  report(lang("已从云端恢复，原浏览器数据已下载为 JSON。", "Restored from cloud; the old browser data was downloaded as JSON."));
}
async function uploadLocalVersion(projectId) {
  if (cloud.role !== "admin") return;
  const row = cloud.rows.find(item => item.id === projectId);
  if (!row || !state().projects.some(item => item.id === projectId)) return;
  if (!confirm(lang(`将本地版本覆盖“${row.title}”的云端备份？数据库会保留旧版历史，但其他设备上的改动可能被覆盖。`,
    `Replace the cloud backup of "${row.title}" with this browser copy? Database history is retained, but changes from another device may be replaced.`))) return;
  cloud.conflicts.delete(projectId);
  cloud.dirty.add(projectId);
  persistPending();
  await flush();
  await draw();
}
function renderComments(row) {
  const group = cloud.comments.filter(comment => comment.project_id === row.id);
  return `<div class="cloud-discussion"><b>${lang("批注和评价", "Comments and evaluations")}</b>
    ${group.map(comment => `<div class="item" style="margin-top:8px">
      <div class="meta">${escapeHTML(comment.target_type)} ${escapeHTML(comment.target_key || "")}
      · ${new Date(comment.created_at).toLocaleString()} ${comment.rating ? "· ★" + comment.rating : ""}</div>
      <div class="body">${escapeHTML(comment.body)}</div>
      <button class="btn small" data-reply="${comment.id}" data-project="${row.id}">${lang("回复", "Reply")}</button>
    </div>`).join("") || '<p class="muted">暂无批注 / No comments</p>'}
    ${cloud.role === "pending" ? "" : `<form class="cloud-form cloud-comment" style="margin-top:10px">
      <input type="hidden" name="project" value="${row.id}">
      <select name="target"><option value="project">项目 / Project</option><option value="requirements">要求 / Requirements</option><option value="stage">分类 / Category</option><option value="task">内容 / Item</option><option value="log">日志 / Log</option><option value="code">代码 / Code</option><option value="summary">总结 / Summary</option></select>
      <input name="targetKey" placeholder="具体标题或日志 ID（可选） / Target title or log ID">
      <textarea name="body" maxlength="10000" required placeholder="写批注或评价 / Write a comment or evaluation"></textarea>
      <select name="rating"><option value="">普通批注 / Comment</option><option value="1">评价 1 ★</option><option value="2">评价 2 ★</option><option value="3">评价 3 ★</option><option value="4">评价 4 ★</option><option value="5">评价 5 ★</option></select>
      <button class="btn primary">提交批注 / Submit</button>
    </form>`}
  </div>`;
}
function workPreview(p, projectId) {
  const stageItems = p.stages.map(stage => `<div class="item">
    <b>${escapeHTML(stage.name)}</b><div class="body">${escapeHTML(stage.desc || "")}</div>
    <button class="btn small" data-annotate="${projectId}" data-target="stage" data-key="${escapeHTML(stage.id)}">${lang("批注此分类", "Comment on category")}</button>
    ${(stage.tasks || []).map(task => `<div class="item" style="margin-top:8px">
      <b>${escapeHTML(task.title)}</b><div class="body">${escapeHTML(task.note || "")}</div>
      <button class="btn small" data-annotate="${projectId}" data-target="task" data-key="${escapeHTML(task.id)}">${lang("批注此内容", "Comment on item")}</button>
    </div>`).join("")}
  </div>`).join("");
  const logItems = p.logs.map(log => `<div class="item">
    <b>${escapeHTML(log.title)}</b><div class="meta">${escapeHTML(log.date)}</div>
    <div class="body">${escapeHTML(log.note || "")}</div>
    ${log.code ? `<pre class="code">${escapeHTML(log.code)}</pre>` : ""}
    <button class="btn small" data-annotate="${projectId}" data-target="log" data-key="${escapeHTML(log.id)}">${lang("批注此日志", "Comment on log")}</button>
  </div>`).join("");
  const summary = p.summary?.result || "";
  return `<details style="margin-top:10px"><summary>${lang("查看项目内容与日志", "View project work and logs")}</summary>
    <div class="list" style="margin-top:10px">${stageItems}${logItems}
    ${(p.codeRecords || []).map(record => `<div class="item"><b>${escapeHTML(record.title || record.name || "Code")}</b><pre class="code">${escapeHTML(record.code || record.content || "")}</pre></div>`).join("")}
    ${summary ? `<div class="item"><b>${lang("项目总结", "Project summary")}</b>
      <div class="body">${escapeHTML(summary)}</div><button class="btn small" data-annotate="${projectId}" data-target="summary" data-key="">${lang("批注总结", "Comment on summary")}</button></div>` : ""}</div>
  </details>`;
}

async function draw() {
  $("#cloudLogin").textContent = lang("登录并开启备份", "Sign in for backup");
  $("#cloudLogout").textContent = lang("退出登录", "Sign out");
  $("#cloudRetry").textContent = lang("重试同步", "Retry sync");
  nav.textContent = cloud.role === "teacher"
    ? lang("✎　布置任务与评价", "✎  Assignments and reviews")
    : lang("☁　备份与评价", "☁  Backup and reviews");
  $("#cloudPage h1").textContent = lang("备份与评价", "Backup and reviews");
  if (!cloud.user) {
    $("#cloudContent").innerHTML = `<div class="card panel">${lang("项目仍在左侧“项目中心”。管理员登录后会在后台自动备份；教师登录后可以布置任务和评价。", "Projects stay in Project center. Admin sign-in enables automatic backups; teachers can assign and review.")}</div>`;
    return;
  }
  $("#cloudSubtitle").textContent = cloud.role === "pending"
    ? lang("账号已注册，正在等待管理员批准教师权限。", "Account registered; awaiting teacher approval.")
    : lang("项目在原来的项目中心；本页只管理备份、教师权限和评价。", "Projects stay in Project center; this page manages backups, teacher access, and reviews.");
  if (cloud.role === "pending") {
    $("#cloudContent").innerHTML = '<div class="card panel">邮箱已验证，正在等待管理员批准教师权限。你可以退出登录后选择“仅阅读”。 / Email verified. Awaiting teacher approval.</div>';
    return;
  }
  const visibleRows = cloud.role === "admin"
    ? cloud.rows.filter(row => cloud.comments.some(comment => comment.project_id === row.id))
    : cloud.rows;
  const items = visibleRows.map(row => {
    const p = rowProject(row);
    const count = p.stages.reduce((n, s) => n + (s.tasks || []).length, 0);
    return `<article class="card cloud-card">
      <div class="meta">${escapeHTML(row.category || lang("工程项目", "Project"))} · ${escapeHTML(row.status)}
      ${row.deadline ? " · " + lang("截止", "Due") + " " + escapeHTML(row.deadline) : ""}</div>
      <h3>${escapeHTML(row.title)}</h3><div class="body">${escapeHTML(row.requirements || lang("尚未填写要求", "No requirements yet"))}</div>
      <p class="meta">${count} ${lang("条内容", "items")} · ${p.logs.length} ${lang("条日志", "logs")}</p>
      ${cloud.role === "admin" ? `<button class="btn primary" data-open="${row.id}">${lang("进入项目", "Open project")}</button>` : ""}
      ${cloud.role === "teacher" ? workPreview(p, row.id) : ""}
      ${renderComments(row)}
    </article>`;
  }).join("");
  let html = "";
  if (cloud.role === "teacher") {
    html += `<div class="card panel"><h2>${lang("新建项目任务", "Create assignment")}</h2>
      <form id="cloudCreate" class="cloud-form">
        <input name="title" maxlength="160" required placeholder="项目标题 / Project title">
        <textarea name="requirements" maxlength="20000" placeholder="任务要求 / Requirements"></textarea>
        <input name="category" maxlength="100" placeholder="类别（可选） / Category">
        <label>${lang("截止日期（可选）", "Deadline (optional)")} <input name="deadline" type="date"></label>
        <button class="btn primary">${lang("创建并保存", "Create and save")}</button>
      </form></div>`;
  }
  if (cloud.role === "admin") {
    const { data, error } = await db.from("profiles").select("id,email,display_name,role").order("created_at");
    if (!error) html += `<div class="card panel"><h2>${lang("教师账号管理", "Teacher accounts")}</h2>
      ${data.filter(p => p.role !== "admin").map(p => `<div class="item">
        ${escapeHTML(p.display_name)} · ${escapeHTML(p.email)} · ${escapeHTML(p.role)}
        ${p.role === "pending" ? `<button class="btn small" data-approve="${p.id}">批准教师</button>` : `<button class="btn small" data-revoke="${p.id}">撤销权限</button>`}
      </div>`).join("") || lang("暂时没有教师申请。", "No teacher applications yet.")}</div>`;
    html += `<div class="card panel"><h2>${lang("云端备份与恢复", "Cloud backup and restore")}</h2>
      <p class="muted">${lang("项目保留在原项目中心；下方是备份状态。需要恢复时，系统会先下载当前浏览器的 JSON 备份。", "Projects stay in Project center. Before restoring, your current browser data is downloaded as JSON.")}</p>
      ${cloud.rows.map(row => `<div class="item"><b>${escapeHTML(row.title)}</b>
        <span class="meta"> · ${lang("云端保存于", "Cloud saved")} ${new Date(row.updated_at).toLocaleString()}</span>
        <button class="btn small" data-restore="${row.id}">${lang("从备份恢复", "Restore backup")}</button>
        ${cloud.conflicts.has(row.id) ? `<button class="btn small" data-keep-local="${row.id}">${lang("以浏览器版本更新云端", "Keep browser version")}</button>` : ""}
      </div>`).join("") || lang("尚无备份。登录后将自动保存当前浏览器项目。", "No backups yet; signing in backs up browser projects.")}</div>`;
  }
  html += `<h2 style="margin:24px 0 12px">${lang("教师批注与评价", "Teacher comments and reviews")}</h2>
    <div class="cloud-grid">${items || `<div class="card empty">${lang("暂无批注或任务。", "No comments or assignments yet.")}</div>`}</div>`;
  $("#cloudContent").innerHTML = html;
  $("#cloudCreate")?.addEventListener("submit", createAssignment);
  $("#cloudContent").querySelectorAll(".cloud-comment").forEach(form => form.addEventListener("submit", sendComment));
  $("#cloudContent").querySelectorAll("[data-approve]").forEach(button => button.onclick = () => approve(button.dataset.approve));
  $("#cloudContent").querySelectorAll("[data-revoke]").forEach(button => button.onclick = () => revoke(button.dataset.revoke));
  $("#cloudContent").querySelectorAll("[data-restore]").forEach(button => button.onclick = () => restoreOne(button.dataset.restore));
  $("#cloudContent").querySelectorAll("[data-keep-local]").forEach(button => button.onclick = () => uploadLocalVersion(button.dataset.keepLocal));
  $("#cloudContent").querySelectorAll("[data-reply]").forEach(button => button.onclick = () => replyTo(button.dataset.project, button.dataset.reply));
  $("#cloudContent").querySelectorAll("[data-annotate]").forEach(button => button.onclick = () => {
    const form = [...$("#cloudContent").querySelectorAll(".cloud-comment")]
      .find(item => item.elements.project.value === button.dataset.annotate);
    if (!form) return;
    form.elements.target.value = button.dataset.target;
    form.elements.targetKey.value = button.dataset.key;
    form.elements.body.focus();
  });
  $("#cloudContent").querySelectorAll("[data-open]").forEach(button => button.onclick = () => {
    const target = state().projects.find(p => p.id === button.dataset.open);
    if (target) window.openProject(target.id);
  });
}
$("#langToggle").addEventListener("click", () => requestAnimationFrame(draw));
db.auth.onAuthStateChange(() => setTimeout(initialize, 0));
initialize();
draw();
