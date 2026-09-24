import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  "https://uluimdlelbqjjzefvdsw.supabase.co",
  "sb_publishable_Fz_z5YgMpqCrCZnNIUeJ3g_FVGzhdNw"
);
const adminEmail = "hdzt_dc@outlook.com";
const cloud = { user: null, role: null, rows: [], comments: [], profile: null, busy: false, dirty: new Set(), timer: null };
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
#cloudBar{margin:0 0 18px;padding:12px 16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}
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
bar.innerHTML = '<span id="cloudIdentity"></span><div class="actions"><span id="cloudStatus"></span><button class="btn" id="cloudRetry" hidden>重试同步</button><button class="btn" id="cloudLogin">邮箱登录</button><button class="btn" id="cloudLogout" hidden>退出登录</button></div>';
$(".main").prepend(bar);
const page = document.createElement("section");
page.id = "cloudPage";
page.className = "page";
page.innerHTML = '<header class="top"><div><h1>云端项目与评价</h1><p id="cloudSubtitle">登录后查看老师布置的项目、批注和评价。</p></div></header><div id="cloudContent"></div>';
$(".main").append(page);
const nav = document.createElement("button");
nav.type = "button"; nav.dataset.p = "cloud"; nav.textContent = "☁　云端项目";
$(".nav").prepend(nav);
nav.addEventListener("click", () => {
  window.showPage("cloud");
  draw();
});
$("#cloudLogin").onclick = () => {
  const email = prompt(lang("请输入登录邮箱，系统会向邮箱发送登录链接：", "Enter your email to receive a sign-in link:"), adminEmail);
  if (!email) return;
  db.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: "https://hdzt-dc.github.io/projectlog/" }
  }).then(({ error }) => {
    if (error) report(error.message, true);
    else report(lang("已发送登录邮件，请点击邮箱中的链接。", "Sign-in email sent. Open its link."));
  }).catch(error => report(error.message, true));
};
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
    for (const row of cloud.rows) {
      const i = state().projects.findIndex(p => p.id === row.id);
      if (i >= 0) {
        if (!cloud.dirty.has(row.id)) { state().projects[i] = rowProject(row); changed = true; }
      } else { state().projects.push(rowProject(row)); changed = true; }
    }
    if (changed) { localStorage.setItem("ProjectLogV2", JSON.stringify(state())); window.render(); }
  }
  draw();
}

async function initialize() {
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) { report(lang("当前仅保存在此浏览器。请登录以启用云端保存。", "Saved in this browser only. Sign in for cloud sync.")); return; }
  cloud.user = data.user;
  $("#cloudIdentity").textContent = data.user.email;
  $("#cloudLogin").hidden = true; $("#cloudLogout").hidden = false;
  await refresh();
}

const originalSave = window.save;
window.save = function () {
  originalSave();
  if (cloud.role !== "admin" || !cloud.user) return;
  let touched = false;
  for (const row of cloud.rows) {
    const p = state().projects.find(project => project.id === row.id);
    if (!p) continue;
    if (p.id === state().active || p.name !== row.title || p.category !== row.category) {
      cloud.dirty.add(p.id); touched = true;
    }
  }
  if (!touched) return;
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
      if (!p) continue;
      const payload = {
        title: p.name, category: p.category || "", status: p.cloudStatus || "in_progress",
        work_data: {
          stages: p.stages, logs: p.logs, experiments: p.experiments,
          issues: p.issues, summary: p.summary, projectStatus: p.projectStatus
        }
      };
      const result = await db.from("projects").update(payload).eq("id", projectId).select("id,updated_at").single();
      if (result.error) { cloud.dirty.add(projectId); throw result.error; }
      const row = cloud.rows.find(item => item.id === projectId);
      if (row) Object.assign(row, payload, result.data);
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
  if (cloud.dirty.size) { event.preventDefault(); event.returnValue = ""; }
});
const editLocalProject = window.projectModal;
window.projectModal = function (projectId) {
  if (!projectId && cloud.role === "admin") {
    window.showPage("cloud");
    draw().then(() => $("#cloudCreate [name=title]")?.focus());
    return;
  }
  editLocalProject(projectId);
};
const removeLocalProject = window.deleteProject;
window.deleteProject = function (projectId) {
  if (cloud.rows.some(row => row.id === projectId)) {
    alert(lang("云端项目不能通过浏览器的“删除”按钮移除。数据与批注已归档保留。", "Cloud projects cannot be removed with the browser delete button; work and comments are archived."));
    return;
  }
  removeLocalProject(projectId);
};

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
async function uploadLocal(projectId) {
  const p = state().projects.find(item => item.id === projectId);
  if (!p || cloud.role !== "admin") return;
  if (!confirm(lang("先导出 JSON 备份了吗？确认后会将此项目复制到云端，旧浏览器记录继续保留。", "Exported a JSON backup? This copies the project to cloud; browser data remains."))) return;
  const { data, error } = await db.from("projects").insert({
    title: p.name, requirements: p.goal || "", category: p.category || "",
    created_by: cloud.user.id, assigned_to: cloud.user.id,
    status: "in_progress", is_public: false,
    work_data: {
      stages: p.stages || [], logs: p.logs || [], experiments: p.experiments || [],
      issues: p.issues || [], summary: p.summary || {}, projectStatus: p.projectStatus
    }
  }).select().single();
  if (error) return report(error.message, true);
  // Retain the old ID and browser copy as a fallback until the user exports a backup.
  cloud.rows.push(data);
  report(lang("项目已复制到云端。原浏览器版本仍保留。", "Project copied to cloud; original browser copy remains."));
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
    ${summary ? `<div class="item"><b>${lang("项目总结", "Project summary")}</b>
      <div class="body">${escapeHTML(summary)}</div><button class="btn small" data-annotate="${projectId}" data-target="summary" data-key="">${lang("批注总结", "Comment on summary")}</button></div>` : ""}</div>
  </details>`;
}

async function draw() {
  nav.textContent = lang("☁　云端项目", "☁  Cloud projects");
  if (!cloud.user) {
    $("#cloudContent").innerHTML = `<div class="card panel">${lang("登录后可查看云端项目。现有浏览器记录不会自动上传。", "Sign in to view cloud projects. Browser records are not uploaded automatically.")}</div>`;
    return;
  }
  $("#cloudSubtitle").textContent = cloud.role === "pending"
    ? lang("账号已注册，正在等待管理员批准教师权限。", "Account registered; awaiting teacher approval.")
    : lang("项目由老师布置；作品由你维护；老师可批注和评价。", "Teachers assign projects and provide comments; you maintain your work.");
  const items = cloud.rows.map(row => {
    const p = rowProject(row);
    const count = p.stages.reduce((n, s) => n + (s.tasks || []).length, 0);
    return `<article class="card cloud-card">
      <div class="meta">${escapeHTML(row.category || lang("工程项目", "Project"))} · ${escapeHTML(row.status)}
      ${row.deadline ? " · " + lang("截止", "Due") + " " + escapeHTML(row.deadline) : ""}</div>
      <h3>${escapeHTML(row.title)}</h3><div class="body">${escapeHTML(row.requirements || lang("尚未填写要求", "No requirements yet"))}</div>
      <p class="meta">${count} ${lang("条内容", "items")} · ${p.logs.length} ${lang("条日志", "logs")}</p>
      ${cloud.role === "admin" ? `<button class="btn primary" data-open="${row.id}">${lang("进入项目", "Open project")}</button>` : ""}
      ${workPreview(p, row.id)}
      ${renderComments(row)}
    </article>`;
  }).join("");
  let html = "";
  if (cloud.role === "admin" || cloud.role === "teacher") {
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
    const localOnly = state().projects.filter(p => !cloud.rows.some(row => row.id === p.id));
    html += `<div class="card panel"><h2>${lang("导入浏览器项目到云端", "Copy browser projects to cloud")}</h2>
      <p class="muted">${lang("先点击页面“数据管理”里的“导出 JSON”备份，再逐个复制。原浏览器记录会保留。", "Export a JSON backup first, then copy each project. Browser copies are retained.")}</p>
      ${localOnly.map(p => `<div class="item">${escapeHTML(p.name)}
        <button class="btn small" data-upload="${p.id}">${lang("复制到云端", "Copy to cloud")}</button></div>`).join("") || lang("所有项目均已关联云端。", "All projects linked.")}</div>`;
  }
  html += `<div class="cloud-grid">${items || `<div class="card empty">${lang("还没有云端项目。", "No cloud projects yet.")}</div>`}</div>`;
  $("#cloudContent").innerHTML = html;
  $("#cloudCreate")?.addEventListener("submit", createAssignment);
  $("#cloudContent").querySelectorAll(".cloud-comment").forEach(form => form.addEventListener("submit", sendComment));
  $("#cloudContent").querySelectorAll("[data-approve]").forEach(button => button.onclick = () => approve(button.dataset.approve));
  $("#cloudContent").querySelectorAll("[data-revoke]").forEach(button => button.onclick = () => revoke(button.dataset.revoke));
  $("#cloudContent").querySelectorAll("[data-upload]").forEach(button => button.onclick = () => uploadLocal(button.dataset.upload));
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
