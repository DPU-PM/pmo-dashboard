// ═══════════════════════════════════════════════════════════
// PMO DASHBOARD — CORE LIBRARY
// Shared across admin.html, team.html, public.html
// ═══════════════════════════════════════════════════════════

// ── SUPABASE CONFIGURATION ──────────────────────────────────
const SUPABASE_URL  = 'https://ygrfxvsmdadxmanaqjka.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlncmZ4dnNtZGFkeG1hbmFxamthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTYzMDAsImV4cCI6MjA5NTAzMjMwMH0.B3dw5L6kRIOg72qV_-wyDmLX3Pukdxsqe587XkuGzhw';

const SB_HEADERS = {
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type':  'application/json'
};


// ── CACHE ────────────────────────────────────────────────────
const CACHE_KEY = 'pmo_data_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function sbFetch(path, options = {})

async function sbGetAllData() {
  // Single request gets all projects + tasks in one shot
  const [projects, tasks] = await Promise.all([
    sbFetch('projects?select=*&order=created_at.asc'),
    sbFetch('tasks?select=id,project_id,task_name,phase,task_type,status,progress,rag,responsible,milestone_date,depends_on,sort_order&order=sort_order.asc')
  ]);

  // Group tasks by project_id
  const tasksByProject = {};
  tasks.forEach(t => {
    if (!tasksByProject[t.project_id]) tasksByProject[t.project_id] = [];
    tasksByProject[t.project_id].push(t);
  });

  // Group projects by category (matching old format)
  const CATEGORY_KEYS = {
    'Content Projects':  'content',
    'Software Projects': 'software',
    'Marketing & Growth':'marketing',
    'Initiatives':       'initiatives',
    'Sales Projects':    'sales'
  };

  const result = { content:[], software:[], marketing:[], initiatives:[], sales:[] };

  projects.forEach(p => {
    const key = CATEGORY_KEYS[p.category] || 'software';
    const projectTasks = tasksByProject[p.id] || [];

    // Calculate progress from tasks
    const taskList = projectTasks.filter(t => t.task_type !== 'project');
    const avgProgress = taskList.length
      ? Math.round(taskList.reduce((s,t) => s + (t.progress||0), 0) / taskList.length)
      : p.progress;

    result[key].push({
      id:               p.id,
      projectName:      p.project_name,
      name:             p.project_name,
      status:           p.status,
      phase:            p.status,
      progress:         String(avgProgress),
      milestoneDate:    p.milestone_date || '',
      rag:              p.rag,
      responsible:      p.responsible || '',
      comment:          p.comment || '',
      publicVisibility: p.public_visibility ? 'Yes' : 'No',
      taskCount:        taskList.length,
      // tasks array for project detail view
      tasks:            projectTasks.map(t => ({
        id:            t.id,
        projectName:   p.project_name,
        taskName:      t.task_name,
        phase:         t.phase || '',
        taskType:      t.task_type || 'task',
        status:        t.status || 'Active',
        progress:      String(t.progress || 0),
        milestoneDate: t.milestone_date || '',
        rag:           t.rag || 'Green',
        responsible:   t.responsible || '',
        dependsOn:     t.depends_on || '',
        comment:       ''
      }))
    });
  });

  return { projects: result, resources: [], kpis: computeKPIs(result) };
}

async function sbGetProjectByName(projectName) {
  const projects = await sbFetch(
    `projects?project_name=eq.${encodeURIComponent(projectName)}&select=*`
  );
  if (!projects.length) return null;
  const p = projects[0];
  const tasks = await sbFetch(
    `tasks?project_id=eq.${p.id}&select=*&order=sort_order.asc`
  );
  return { project: { ...p, tasks: tasks.map(t=>({
    id: t.id, taskName: t.task_name, phase: t.phase||'',
    taskType: t.task_type||'task', progress: String(t.progress||0),
    rag: t.rag||'Green', responsible: t.responsible||'',
    milestoneDate: t.milestone_date||'', dependsOn: t.depends_on||''
  })) } };
}

function getCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch(e) { return null; }
}

function setCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch(e) {}
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function showToast(msg, type = 'success') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]||''}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function renderDonutChart(green, amber, red, containerId) {
  const total = green + amber + red || 1;
  const size = 120, cx = 60, cy = 60, r = 46, stroke = 16;
  const circ = 2 * Math.PI * r;
  const pcts = [
    { val:green, color:'var(--green)', label:'Green',  key:'green'  },
    { val:amber, color:'var(--amber)', label:'Amber',  key:'amber'  },
    { val:red,   color:'var(--red)',   label:'Red',    key:'red'    },
  ];
  let offset = 0;
  const arcs = pcts.map(p => {
    const dash = (p.val / total) * circ;
    const gap  = circ - dash;
    const arc  = `<circle cx="${cx}" cy="${cy}" r="${r}"
      fill="none" stroke="${p.color}" stroke-width="${stroke}"
      stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})"
      style="transition:stroke-dasharray .8s ease"/>`;
    offset += dash;
    return arc;
  }).join('');

  const legend = pcts.map(p => `
    <div class="donut-legend-item">
      <span class="donut-legend-dot" style="background:${p.color}"></span>
      <span class="donut-legend-label">${p.label}</span>
      <span class="donut-legend-val">${p.val}</span>
    </div>`).join('');

  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="donut-wrap">
      <svg class="donut-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#F1F5F9" stroke-width="${stroke}"/>
        ${arcs}
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
          style="font-size:18px;font-weight:700;fill:var(--navy);font-family:'IBM Plex Mono',monospace">${total}</text>
        <text x="${cx}" y="${cy+16}" text-anchor="middle"
          style="font-size:9px;fill:var(--text-muted);font-family:'IBM Plex Sans',sans-serif">projects</text>
      </svg>
      <div class="donut-legend">${legend}</div>
    </div>`;
}

function renderBarChart(categories, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const max = Math.max(...categories.map(c => c.avg), 1);
  el.innerHTML = `<div class="bar-chart-wrap">
    ${categories.map(c => {
      const w   = (c.avg / 100) * 100;
      const cls = c.avg >= 100 ? 'done' : c.avg < 30 ? 'warn' : '';
      return `<div class="bar-chart-row">
        <span class="bar-chart-label" title="${c.name}">${c.shortName}</span>
        <div class="bar-chart-bar">
          <div class="bar-chart-fill ${cls}" style="width:${w}%"></div>
        </div>
        <span class="bar-chart-pct">${c.avg}%</span>
      </div>`;
    }).join('')}
  </div>`;
}

function renderGantt(taskList) {
  const container = document.getElementById('pv-gantt');
  if (!container) return;
  document.getElementById('pv-gantt-range').textContent = '';

  const tasksWithDates = (taskList || []).filter(t =>
    t.milestoneDate && String(t.milestoneDate).trim() && t.taskName
  );

  if (!tasksWithDates.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:13px">📅 No milestone dates — add due dates to tasks.</div>';
    return;
  }

  // Map RAG → colour + priority
  const RAG_COLOR = { Red:'#DC2626', Amber:'#D97706', Green:'#16A34A' };

  // Build unique ID map for dependencies
  const idMap = {};
  tasksWithDates.forEach((t, i) => {
    idMap[t.taskName] = 'dt_' + i + '_' + (t.taskName||'').replace(/[^a-zA-Z0-9]/g,'_').substring(0,10);
  });

  const ganttTasks = tasksWithDates.map((t) => {
    const endDate   = new Date(t.milestoneDate + 'T00:00:00');
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);
    const fmt = d => d.toISOString().split('T')[0];
    const depId = (t.dependsOn && idMap[t.dependsOn]) ? idMap[t.dependsOn] : '';
    return {
      id:           idMap[t.taskName],
      swimlane:     t.phase || 'General',
      label:        (t.taskName||'').substring(0, 12),
      title:        t.taskName || '—',
      description:  t.responsible ? '👤 ' + t.responsible : '',
      start:        fmt(startDate),
      end:          fmt(endDate),
      progress:     parseInt(t.progress) || 0,
      priority:     t.rag === 'Red' ? 'Critical' : t.rag === 'Amber' ? 'High' : 'Low',
      ragColor:     RAG_COLOR[t.rag] || '#1A5FCC',
      dependencies: depId,
      rag:          t.rag || 'Green',
      responsible:  t.responsible || '',
    };
  });

  // Create or reuse the dashboard-timeline element
  let el = container.querySelector('dashboard-timeline');
  if (!el) {
    el = document.createElement('dashboard-timeline');
    el.id = 'pv-gantt-el';
    el.style.width  = '100%';
    el.style.height = '100%';
    el.style.display = 'block';
    container.innerHTML = '';
    container.appendChild(el);
  }

  // Set colour before data to avoid double-render
  el.config = el.config || {};
  el.config.barColor     = '#1A5FCC';
  el.config.zoomLevel    = (currentViewMode || 'month').toLowerCase();

  el.data = ganttTasks;
  ganttInstance = el;

  // Date range label
  const dates = tasksWithDates.map(t => new Date(t.milestoneDate + 'T00:00:00')).filter(d => !isNaN(d));
  if (dates.length) {
    const mn = new Date(Math.min(...dates)), mx = new Date(Math.max(...dates));
    const rangeEl = document.getElementById('pv-gantt-range');
    if (rangeEl) rangeEl.textContent =
      mn.toLocaleDateString('en-GB',{month:'short',year:'numeric'}) + ' – ' +
      mx.toLocaleDateString('en-GB',{month:'short',year:'numeric'});
  }
}

function changeGanttView(mode) {
  currentViewMode = (mode||'month').toLowerCase();
  document.querySelectorAll('.gantt-view-btn').forEach(b =>
    b.classList.toggle('active', (b.dataset.mode||'').toLowerCase() === currentViewMode)
  );
  if (ganttInstance && typeof ganttInstance.changeViewMode === 'function') {
    ganttInstance.changeViewMode(currentViewMode);
  }
}

function toggleGanttFullscreen() {
  const card = document.getElementById('gantt-card');
  const btn  = document.getElementById('gantt-fs-btn');
  if (!card) return;
  const isFs = card.classList.toggle('gantt-fullscreen');
  if (btn) btn.textContent = isFs ? '✕ Exit Full Screen' : '⛶ Expand';
  document.body.style.overflow = isFs ? 'hidden' : '';
  // Re-render after CSS transition so offsetWidth is accurate
  setTimeout(() => {
    if (ganttInstance && typeof ganttInstance.changeViewMode === 'function') {
      ganttInstance.changeViewMode(currentViewMode);
    }
  }, 120);
}

function renderProjectHeader(proj, taskList, sheetKey) {
  const pct = taskList.length
    ? Math.round(taskList.reduce((s,t) => s + (parseInt(t.progress)||0), 0) / taskList.length)
    : parseInt(proj.progress)||0;

  const rag = (proj.rag||'Green').toLowerCase();
  const done  = taskList.filter(t => parseInt(t.progress) === 100).length;
  const inprog = taskList.filter(t => { const p=parseInt(t.progress)||0; return p>0 && p<100; }).length;
  const todo  = taskList.filter(t => (parseInt(t.progress)||0) === 0).length;
  const late  = taskList.filter(t => {
    if (!t.milestoneDate || parseInt(t.progress)===100) return false;
    return new Date(t.milestoneDate) < new Date();
  }).length;

  // Header card RAG class
  const card = document.getElementById('pv-header-card');
  card.className = 'proj-header-card rag-' + rag;

  // Name
  document.getElementById('pv-name').textContent = proj.projectName;

  // Meta badges
  const TYPE_MAP = {'Content Projects':'type-content','Software Projects':'type-software','Marketing & Growth':'type-marketing','Initiatives':'type-initiatives','Sales Projects':'type-sales'};
  const TYPE_SHORT = {'Content Projects':'Content','Software Projects':'Software','Marketing & Growth':'Marketing','Initiatives':'Initiatives','Sales Projects':'Sales'};
  const STATUS_BADGE = {'Active':'badge-blue','Completed':'badge-green','On Hold':'badge-gray','Upcoming':'badge-purple','Cancelled':'badge-red'};
  const sheetName = SHEETS[sheetKey] || sheetKey;

  document.getElementById('pv-meta').innerHTML = `
    <span class="badge ${STATUS_BADGE[proj.status]||'badge-gray'}">${esc(proj.status||'Active')}</span>
    <span class="type-tag ${TYPE_MAP[sheetName]||''}" style="font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid">${TYPE_SHORT[sheetName]||esc(sheetName)}</span>
    <span class="rag"><span class="rag-dot ${rag}"></span>${esc(proj.rag||'Green')}</span>
    <span style="font-size:12px;color:var(--text-muted)">👤 ${esc(proj.responsible||'—')}</span>
    ${proj.milestoneDate ? `<span style="font-size:12px;color:var(--text-muted)">📅 ${esc(proj.milestoneDate)}</span>` : ''}
  `;

  // Actions — Edit button opens existing modal
  const canEdit = typeof ADMIN_PASSWORD !== 'undefined'; // admin always can; team uses hasPerm
  const canEditPerm = (typeof hasPerm === 'function') ? hasPerm('editProjects') : canEdit;
  document.getElementById('pv-actions').innerHTML = canEditPerm ? `
    <button class="btn btn-primary btn-sm" onclick="openEditProjectModal('${esc(sheetKey)}','${esc(proj.projectName)}')">✏️ Edit Project</button>
  ` : '';

  // Progress
  document.getElementById('pv-prog-pct').textContent = pct + '%';
  const fill = document.getElementById('pv-prog-fill');
  fill.style.width = pct + '%';
  fill.className = 'overall-prog-fill' + (pct>=100?' done':pct<30?' warn':'');

  // Stats
  document.getElementById('pv-total-tasks').textContent = taskList.length;
  document.getElementById('pv-done-tasks').textContent  = done;
  document.getElementById('pv-inprog-tasks').textContent = inprog;
  document.getElementById('pv-todo-tasks').textContent  = todo;

  // Summary chips
  let chips = '';
  if (done)   chips += `<span class="summary-chip chip-done">✅ ${done} Completed</span>`;
  if (inprog) chips += `<span class="summary-chip chip-prog">🔵 ${inprog} In Progress</span>`;
  if (todo)   chips += `<span class="summary-chip chip-todo">⬜ ${todo} Not Started</span>`;
  if (late)   chips += `<span class="summary-chip chip-late">⚠️ ${late} Overdue</span>`;
  document.getElementById('pv-summary-chips').innerHTML = chips;

  // Comment banner
  if (proj.comment) {
    document.getElementById('pv-summary-chips').innerHTML += `
      <div style="width:100%;background:#FFFBEB;border:1px solid #FEF08A;border-radius:6px;padding:8px 14px;font-size:12px;color:#854D0E;margin-top:4px">
        💬 ${esc(proj.comment)}
      </div>`;
  }
}

function renderVerticalTimeline(taskList) {
  const container = document.getElementById('pv-timeline');

  // Group by phase
  const phases = {};
  const phaseOrder = [];
  taskList.forEach(t => {
    const ph = t.phase || 'General';
    if (!phases[ph]) { phases[ph] = []; phaseOrder.push(ph); }
    phases[ph].push(t);
  });

  if (!phaseOrder.length) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📋</div><h3>No tasks yet</h3><p>Add tasks via the Edit Project button</p></div>';
    document.getElementById('pv-phase-count').textContent = '';
    return;
  }

  document.getElementById('pv-phase-count').textContent = phaseOrder.length + ' phase' + (phaseOrder.length!==1?'s':'');

  container.innerHTML = phaseOrder.map(ph => {
    const tasks = phases[ph];
    const phDone = tasks.filter(t=>parseInt(t.progress)===100).length;
    const phPct  = tasks.length ? Math.round(tasks.reduce((s,t)=>s+(parseInt(t.progress)||0),0)/tasks.length) : 0;
    const today  = new Date();

    const taskItems = tasks.map(t => {
      const p = parseInt(t.progress)||0;
      const isLate = t.milestoneDate && new Date(t.milestoneDate) < today && p < 100;
      const statusCls = p===100 ? 'done' : isLate ? 'late' : p>0 ? 'prog' : 'todo';
      const statusIcon = p===100 ? '✅' : isLate ? '⚠️' : p>0 ? '🔵' : '⬜';
      const ragCls = (t.rag||'Green').toLowerCase();
      const miniFillCls = p>=100?'done':p<30?'warn':'';

      return `
        <div class="task-timeline-item ${p===100?'done-task':''}">
          <div class="tti-left">
            <div class="tti-status-icon ${statusCls}">${statusIcon}</div>
          </div>
          <div class="tti-body">
            <div class="tti-name">${esc(t.taskName||'—')}</div>
            <div class="tti-meta">
              ${t.responsible ? `<span>👤 ${esc(t.responsible)}</span>` : ''}
              ${t.milestoneDate ? `<span>📅 ${esc(t.milestoneDate)}${isLate?' <span style="color:var(--red);font-weight:600">Overdue</span>':''}</span>` : ''}
              <span class="rag"><span class="rag-dot ${ragCls}" style="width:7px;height:7px"></span>${esc(t.rag||'Green')}</span>
              ${t.dependsOn ? `<span class="dep-tag">↳ ${esc(t.dependsOn.substring(0,18))}${t.dependsOn.length>18?'…':''}</span>` : ''}
            </div>
          </div>
          <div class="tti-right">
            <span class="tti-pct">${p}%</span>
            <div class="tti-mini-bar">
              <div class="tti-mini-fill ${miniFillCls}" style="width:${p}%"></div>
            </div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="phase-block">
        <div class="phase-title">
          <span class="phase-badge">${esc(ph)}</span>
          <span>${phDone}/${tasks.length} tasks done</span>
          <span class="phase-prog">${phPct}%</span>
        </div>
        ${taskItems}
      </div>`;
  }).join('');
}

async function loadProjectRisks() {
  const container = document.getElementById('risks-body');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner" style="margin:0 auto"></div></div>';

  try {
    const [risks, projects] = await Promise.all([
      sbFetch('notes?note_type=eq.risk&select=*&order=created_at.desc'),
      sbFetch('projects?select=id,project_name,category')
    ]);

    const projMap = {};
    projects.forEach(p => { projMap[p.id] = p; });

    allRisks = risks.map(r => ({
      ...r,
      projectName: projMap[r.project_id]?.project_name || 'Unknown',
      category:    projMap[r.project_id]?.category     || '',
    }));

    renderRisksTable();
    // Update badge counts
    const openCount = allRisks.filter(r => !r.content.startsWith('[CLOSED]')).length;
    ['risks-badge','sb-risks'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = openCount || '';
    });
  } catch(e) {
    if (container) container.innerHTML = `<div class="risks-empty"><div class="icon">⚠️</div><p>Could not load risks: ${e.message}</p></div>`;
  }
}

function renderRisksTable() {
  const container = document.getElementById('risks-body');
  if (!container) return;

  const filtered = allRisks.filter(r => {
    const closed = r.content.startsWith('[CLOSED]');
    if (risksFilter === 'open')   return !closed;
    if (risksFilter === 'closed') return  closed;
    return true;
  });

  if (!filtered.length) {
    const msgs = { open:'No open risks 🎉', closed:'No closed risks yet', all:'No risks logged yet' };
    container.innerHTML = `<div class="risks-empty">
      <div class="icon">🛡️</div>
      <h3>${msgs[risksFilter]||'No risks'}</h3>
      <p>Risks added via project Decisions & Actions appear here</p>
    </div>`;
    return;
  }

  const CAT_KEY = {'Content Projects':'content','Software Projects':'software',
    'Marketing & Growth':'marketing','Initiatives':'initiatives','Sales Projects':'sales'};

  container.innerHTML = filtered.map(r => {
    const isClosed  = r.content.startsWith('[CLOSED]');
    const rawContent = isClosed ? r.content.replace('[CLOSED] ','') : r.content;

    // Extract response if stored in content as "[CLOSED] riskText |RESP| responseText"
    let riskText = rawContent, responseText = '';
    if (rawContent.includes('|RESP|')) {
      [riskText, responseText] = rawContent.split('|RESP|');
    }

    const d = new Date(r.created_at);
    const dateStr = d.toLocaleString('en-GB',{
      timeZone:'Africa/Cairo', day:'2-digit', month:'short',
      year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true
    });
    const catKey = CAT_KEY[r.category] || 'software';

    // Can current user respond? admin always yes; team checks hasPerm
    const canRespond = !isClosed && (
      typeof ADMIN_PASSWORD !== 'undefined' ||
      (typeof hasPerm === 'function' ? hasPerm('editProjects') : true)
    );

    return `<div class="risk-card ${isClosed?'responded':''}" id="risk-${r.id}">
      <div class="risk-header">
        <div class="risk-content">${esc(riskText.trim())}</div>
        <span class="risk-project-badge"
          onclick="event.stopPropagation();openProjectView('${catKey}','${esc(r.projectName)}')"
          title="Open project">📂 ${esc(r.projectName)}</span>
      </div>
      <div class="risk-meta">
        <span>⚠️ Risk</span>
        <span>👤 ${esc(r.author||'Admin')}</span>
        <span>🕐 ${dateStr}</span>
        ${isClosed
          ? '<span style="color:var(--green);font-weight:600">✅ Closed</span>'
          : '<span style="color:var(--red);font-weight:600">🔴 Open</span>'}
      </div>
      ${responseText ? `<div class="risk-response-preview">${esc(responseText.trim())}</div>` : ''}
      ${canRespond ? `
        <div id="resp-form-${r.id}" style="display:none;margin-top:10px">
          <div class="risk-add-response">
            <textarea id="resp-text-${r.id}" placeholder="Enter your response to this risk..."></textarea>
            <button class="btn btn-primary btn-sm" onclick="submitRiskResponse('${r.id}','${r.project_id}','${esc(r.content)}')">
              ✅ Respond & Close
            </button>
          </div>
        </div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="toggleRespForm('${r.id}')">💬 Add Response</button>
          <button class="btn btn-sm" style="background:#EFF6FF;color:var(--blue);border:1px solid #BFDBFE"
            onclick="openProjectView('${catKey}','${esc(r.projectName)}')">📂 Open Project</button>
        </div>
      ` : `
        <div style="margin-top:8px">
          <button class="btn btn-sm" style="background:#EFF6FF;color:var(--blue);border:1px solid #BFDBFE"
            onclick="openProjectView('${catKey}','${esc(r.projectName)}')">📂 View Project</button>
        </div>
      `}
    </div>`;
  }).join('');
}

function filterRisks(filter, el) { setRisksFilter(filter); }

async function submitRiskResponse(riskId, projectId) {
  const textarea = document.getElementById('resp-text-' + riskId);
  const text = textarea ? textarea.value.trim() : '';
  if (!text) { showToast('Please enter a response', 'error'); return; }

  const risk = allRisks.find(r => r.id === riskId);
  if (!risk) { showToast('Risk not found', 'error'); return; }

  const author = (typeof currentUser !== 'undefined' && currentUser)
    ? (currentUser.name || 'Admin') : 'Admin';

  // Optimistic UI — mark responded immediately
  risk.response_text = text;
  risk.responded_by  = author;
  risksFilter = 'closed';
  renderRisksTable();
  showToast('✅ Risk closed', 'success');

  try {
    // Persist response on the risk note
    await sbFetch('notes?id=eq.' + riskId, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ response_text: text, responded_by: author })
    });
    // Log as action note in project decisions
    await sbFetch('notes', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        content:    'Risk Response: ' + text,
        author:     author,
        note_type:  'action'
      })
    });
  } catch(e) {
    showToast('Sync error: ' + e.message, 'error');
    // Revert optimistic update on failure
    delete risk.response_text;
    delete risk.responded_by;
    renderRisksTable();
  }
}

function toggleRespForm(riskId) {
  const form = document.getElementById('resp-form-' + riskId);
  if (!form) return;
  const isOpen = form.style.display !== 'none';
  form.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) document.getElementById('resp-text-' + riskId)?.focus();
}

function renderAlertBanner(bannerId, projects) {
  const banner = document.getElementById(bannerId);
  if (!banner) return;
  const { overdue, critical } = checkOverdueTasks(projects);
  if (!overdue.length && !critical.length) { banner.classList.remove('show'); return; }

  const parts = [];
  if (overdue.length) parts.push(`<strong>${overdue.length} overdue task${overdue.length!==1?'s':''}</strong>`);
  if (critical.length) parts.push(`<strong>${critical.length} critical project${critical.length!==1?'s':''}</strong>`);

  const tags = [
    ...overdue.slice(0,4).map(o =>
      `<span class="alert-tag" title="${esc(o.project)}: ${esc(o.task)} (due ${esc(o.due)})">${esc(o.task.length>18?o.task.substring(0,17)+'…':o.task)}</span>`
    ),
    ...critical.slice(0,3).map(p =>
      `<span class="alert-tag red-tag">🔴 ${esc(p.length>18?p.substring(0,17)+'…':p)}</span>`
    ),
    (overdue.length > 4 || critical.length > 3) ?
      `<span class="alert-tag">+${overdue.length + critical.length - 4} more</span>` : ''
  ].filter(Boolean).join('');

  banner.innerHTML = `
    <span class="alert-icon">⚠️</span>
    <div class="alert-text">
      ${parts.join(' · ')} detected
      <div class="alert-list">${tags}</div>
    </div>
    <button class="alert-close no-print" onclick="this.closest('.alert-banner').classList.remove('show')" title="Dismiss">✕</button>
  `;
  banner.classList.add('show');
}

function checkOverdueTasks(projects) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const overdue = [];
  const critical = []; // RAG Red projects

  for (const [key, list] of Object.entries(projects)) {
    (list||[]).forEach(p => {
      // Check project-level RAG
      if (p.rag === 'Red') critical.push(p.projectName || p.name);
      // Check task-level overdue
      (p.tasks||[]).forEach(t => {
        if (t.taskType === 'project') return;
        if (!t.milestoneDate) return;
        const due = new Date(t.milestoneDate);
        due.setHours(0,0,0,0);
        if (due < today && parseInt(t.progress||0) < 100) {
          overdue.push({ project: p.projectName||p.name, task: t.taskName, due: t.milestoneDate });
        }
      });
    });
  }
  return { overdue, critical };
}

function computeKPIs(projects) {
  let total=0, active=0, completed=0, green=0, amber=0, red=0, progSum=0;
  Object.values(projects).forEach(list => {
    list.forEach(p => {
      total++; progSum += parseInt(p.progress)||0;
      if (p.status==='Active') active++;
      if (p.status==='Completed') completed++;
      if (p.rag==='Green') green++;
      if (p.rag==='Amber') amber++;
      if (p.rag==='Red')   red++;
    });
  });
  return { total, active, completed, green, amber, red,
           avgProgress: total ? Math.round(progSum/total) : 0 };
}

function exportToExcel(filtered) {
  const projects = filtered || (typeof getAllProjects === 'function' ? getAllProjects() : []);
  if (!projects.length) { showToast('No projects to export', 'error'); return; }

  const date = new Date().toISOString().slice(0,10);

  // Always export clean CSV — universally compatible, opens in Excel natively
  const headers = ['Project Name','Category','Status','Health','Progress %',
                   'Owner','Next Milestone','Comment','Escalated'];
  const dataRows = projects.map(p => [
    p.projectName || p.name || '',
    p.sheetName   || p.category || '',
    p.status      || '',
    p.rag         || '',
    (parseInt(p.progress) || 0) + '%',
    p.responsible || '',
    p.milestoneDate || '',
    (p.comment || '').replace(/\n/g,' '),
    p.escalate ? 'Yes' : 'No'
  ]);

  const all = [headers, ...dataRows];

  // BOM + CSV so Excel opens with correct encoding
  const bom = '\uFEFF';
  const csv = bom + all.map(row =>
    row.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')
  ).join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'PMO_Projects_' + date + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('✅ Exported ' + projects.length + ' projects', 'success');
}

function triggerKPICountUp() {
  // Admin KPIs
  const adminKPIs = ['kpi-total','kpi-active','kpi-completed','kpi-avg','kpi-res',
                     'kpi-at-risk','sc-escalated','sc-at-risk','sc-critical','sc-overdue'];
  // Team KPIs
  const teamKPIs  = ['k-total','k-active','k-completed','k-risk','k-avg','k-team'];
  // Public KPIs
  const pubKPIs   = ['h-total','h-active','h-green','h-amber','h-avg'];
  const allKPIs   = [...adminKPIs, ...teamKPIs, ...pubKPIs];

  allKPIs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.textContent.trim();
    if (val && val !== '—' && val !== '') {
      animateCountUp(el, val, 900);
    }
  });
}

function animateCountUp(el, target, duration) {
  if (!el) return;
  const isPercent = String(target).includes('%');
  const num = parseInt(String(target).replace('%','')) || 0;
  if (num === 0) { el.textContent = target; return; }
  const start = performance.now();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(eased * num);
    el.textContent = isPercent ? current + '%' : current;
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
}

async function openProjectView(sheetKey, projectName) {
  currentProjView = { sheetKey, projectName };

  // Show view, hide projects list
  document.getElementById('tab-projects').style.display = 'none';
  const pv = document.getElementById('proj-view');
  pv.classList.add('active');

  // Set breadcrumb immediately
  document.getElementById('pv-breadcrumb').textContent = projectName;

  // Show loading state
  document.getElementById('pv-name').textContent = projectName;
  document.getElementById('pv-timeline').innerHTML =
    '<div style="text-align:center;padding:40px;color:var(--text-muted)"><div class="spinner" style="margin:0 auto 12px"></div>Loading project...</div>';
  document.getElementById('pv-gantt').innerHTML =
    '<div style="text-align:center;padding:30px;color:var(--text-muted)">Loading timeline...</div>';

  // Fetch full project details (with tasks)
  let tasks = [];
  let proj = null;
  try {
    const data = await sbGetProjectByName(projectName);
    tasks = (data?.project?.tasks || []);
    proj  = tasks.find(t => t.taskType === 'project');
  } catch(e) {
    const all = getAllProjects();
    proj = all.find(p => p.sheetKey === sheetKey && p.projectName === projectName);
    tasks = proj?.tasks || [];
  }

  if (!proj) {
    // Build proj from allProjectsData summary
    const all = getAllProjects();
    proj = all.find(p => p.sheetKey === sheetKey && p.projectName === projectName) || { projectName, rag:'Green', status:'Active', responsible:'', progress:'0', comment:'' };
  }

  const taskList = tasks.filter(t => t.taskType === 'task');
  renderProjectHeader(proj, taskList, sheetKey);
  renderGantt(taskList);
  renderVerticalTimeline(taskList);
  // Load additional features
  if (proj.id) {
    renderRAGTrend(proj.id, proj.projectName);
    loadDecisions(proj.id, proj.projectName, 'pv-decisions');
  }
  renderMilestoneSlippage('pv-slippage', { _: [{ projectName: proj.projectName, tasks: taskList }] });
}

function closeProjectView() {
  ganttInstance = null; currentViewMode = 'Month';
  document.getElementById('proj-view').classList.remove('active');
  document.getElementById('tab-projects').style.display = '';
  currentProjView = null;
}

// ── GANTT WEB COMPONENT ─────────────────────────────────────
class DashboardTimeline extends HTMLElement {
    constructor() {
        super();
        this._rawData = [];
        this._pendingData = null;
        this._connected  = false;
        this.config = {
            barColor:'#1A5FCC', barHoverColor:'#1348A0', progressColor:'#0D3A9E',
            barHeight:26, rowHeight:78, paddingTop:140, theme:'light',
            zoomLevel:'month', showTodayLine:true,
            enableDragAndDrop:false, snapToGrid:true,
        };
        this.timelineBounds = { start:null, end:null, totalDuration:null };
        this._boundMM = this._onMouseMove.bind(this);
        this._boundMU = this._onMouseUp.bind(this);
        this.dragState = { active:false, resizing:false, idx:null, startX:0, scrollStart:0, origStart:'', origEnd:'', wasDrag:false };
    }

    static get observedAttributes() { return ['theme','zoom','color']; }

    attributeChangedCallback(n, ov, nv) {
        if (ov===nv) return;
        if (n==='theme') this.config.theme = nv;
        if (n==='zoom')  this.config.zoomLevel = (nv||'month').toLowerCase();
        if (n==='color') {
            this.config.barColor = nv;
            this.config.progressColor = this._dim(nv,-35);
        }
        if (this._connected) this.render();
    }

    connectedCallback() {
        this._connected = true;
        this._injectStyles();
        this._initTooltip();
        if (this._pendingData) { this._rawData = this._pendingData; this._pendingData = null; }
        // Use rAF so offsetWidth is real
        requestAnimationFrame(() => this.render());
    }

    disconnectedCallback() { this._connected = false; }

    set data(v) {
        const d = Array.isArray(v) ? v : [];
        if (this._connected) { this._rawData = d; requestAnimationFrame(() => this.render()); }
        else { this._pendingData = d; }
    }
    get data() { return this._rawData; }

    changeViewMode(mode) {
        this.config.zoomLevel = (mode||'month').toLowerCase();
        this.render();
        requestAnimationFrame(() => this._scrollToToday());
    }

    // ── RENDER ──────────────────────────────────────────────────────────────────
    render() {
        if (!this._connected) return;
        if (!this._rawData || !this._rawData.length) {
            this.innerHTML = `<div style="text-align:center;padding:48px 20px;color:#94A3B8;font-size:13px">
                📅 No tasks with milestone dates to display</div>`;
            return;
        }

        this._calcBounds(this._rawData);
        const { start:tS, end:tE, totalDuration:tD } = this.timelineBounds;

        // CRITICAL: get real width. Fall back to parent or 800
        const containerW = Math.max(
            this.offsetWidth || this.parentElement?.offsetWidth || 800, 400
        );

        const totalDays = tD / 86400000;
        const z = this.config.zoomLevel;
        const canvasW = z==='day'  ? Math.max(containerW, totalDays*65+150) :
                        z==='week' ? Math.max(containerW, totalDays*22+150) :
                        z==='year' ? Math.max(containerW, totalDays*4 +150) :
                                     Math.max(containerW, totalDays*13+150);

        const isDark  = this.config.theme === 'dark';
        const bg      = isDark ? '#1A1A2E' : '#FFFFFF';
        const grid    = isDark ? '#2D2D45' : '#EAEAEA';
        const laneAlt = isDark ? '#1E1E30' : '#FAFBFC';
        const txt     = isDark ? '#9090AA' : '#64748B';
        const bH      = this.config.barHeight;
        const rH      = this.config.rowHeight;
        const pT      = this.config.paddingTop;
        const LW      = 130; // label column width

        const getX  = d => LW + ((d-tS)/tD) * (canvasW-LW-20);
        const getFmt = d => d.toISOString().split('T')[0];
        this.getX    = getX;
        this.getDate = x => new Date(tS.getTime()+((x-LW)/(canvasW-LW-20))*tD);

        // Tiers
        const tiers = z==='day'  ? ['year','month','week','day'] :
                      z==='week' ? ['year','month','week'] :
                      z==='year' ? ['year'] : ['year','month'];
        const tH    = 28;
        const hTop  = 8;
        const hBot  = hTop + tiers.length * tH;

        // Swimlanes
        const lanes = {};
        this._rawData.forEach((t,i) => {
            const ln = t.swimlane||'Tasks';
            if (!lanes[ln]) lanes[ln]=[];
            lanes[ln].push({t,i});
        });
        const rows = [];
        Object.keys(lanes).forEach(ln => lanes[ln].forEach(item => rows.push({...item,ln})));
        const svgH = Math.max(hBot + rows.length*rH + 40, 220);

        // Priority/RAG colours
        const PRI_COL = {Critical:'#EF4444',High:'#F97316',Medium:'#1A5FCC',Low:'#16A34A'};

        let s = `<div class="dt-scroll"><svg class="dt-svg"
            viewBox="0 0 ${canvasW} ${svgH}"
            style="background:${bg};width:${canvasW}px;display:block;font-family:inherit"
            xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="dt-sh"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="${isDark?'.3':'.08'}"/></filter>
            <marker id="dt-ar" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="${this.config.barColor}" opacity=".7"/>
            </marker>
          </defs>`;

        // ── Header lines ─────────────────────────────────────────────────────────
        for (let i=0;i<=tiers.length;i++) {
            s += `<line x1="${LW}" y1="${hTop+i*tH}" x2="${canvasW-10}" y2="${hTop+i*tH}" stroke="${grid}" stroke-width="1"/>`;
        }

        // ── Year tier ────────────────────────────────────────────────────────────
        if (tiers.includes('year')) {
            let d = new Date(tS.getFullYear(),0,1);
            while (d < tE) {
                const nd = new Date(d.getFullYear()+1,0,1);
                const x1=Math.max(getX(d),LW), x2=Math.min(getX(nd),canvasW-10);
                if (getX(nd)<=canvasW-10) s += `<line x1="${getX(nd)}" y1="${hTop}" x2="${getX(nd)}" y2="${hTop+tH}" stroke="${grid}" stroke-width="1.5"/>`;
                if (x2-x1>40) s += `<text x="${x1+(x2-x1)/2}" y="${hTop+tH-8}" fill="${this.config.barColor}" font-size="13" font-weight="700" text-anchor="middle">${d.getFullYear()}</text>`;
                d = nd;
            }
        }

        // ── Month tier ───────────────────────────────────────────────────────────
        if (tiers.includes('month')) {
            const ty = hTop + tiers.indexOf('month')*tH;
            let d = new Date(tS.getFullYear(),tS.getMonth(),1);
            while (d < tE) {
                const nd = new Date(d.getFullYear(),d.getMonth()+1,1);
                const x1=Math.max(getX(d),LW), x2=Math.min(getX(nd),canvasW-10);
                const btm = tiers.length===2 ? svgH-10 : ty+tH;
                if (getX(nd)<=canvasW-10) s += `<line x1="${getX(nd)}" y1="${ty}" x2="${getX(nd)}" y2="${btm}" stroke="${grid}" stroke-width="1"/>`;
                if (x2-x1>24) {
                    const lbl = (x2-x1>64) ? d.toLocaleString('default',{month:'long'}) : d.toLocaleString('default',{month:'short'});
                    s += `<text x="${x1+(x2-x1)/2}" y="${ty+tH-7}" fill="${txt}" font-size="11" font-weight="600" text-anchor="middle">${lbl}</text>`;
                }
                d = nd;
            }
        }

        // ── Week tier ────────────────────────────────────────────────────────────
        if (tiers.includes('week')) {
            const ty = hTop + tiers.indexOf('week')*tH;
            let d = new Date(tS); d.setDate(d.getDate()-d.getDay()); d.setHours(0,0,0,0);
            while (d < tE) {
                const nd = new Date(d); nd.setDate(d.getDate()+7);
                const x1=Math.max(getX(d),LW), x2=Math.min(getX(nd),canvasW-10);
                if (getX(nd)>=LW && getX(nd)<=canvasW-10) s += `<line x1="${getX(nd)}" y1="${ty}" x2="${getX(nd)}" y2="${svgH-10}" stroke="${grid}" stroke-width="1"/>`;
                if (x2-x1>36) {
                    const u=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
                    u.setUTCDate(u.getUTCDate()+4-(u.getUTCDay()||7));
                    const wn=Math.ceil((((u-new Date(Date.UTC(u.getUTCFullYear(),0,1)))/86400000)+1)/7);
                    s += `<text x="${x1+(x2-x1)/2}" y="${ty+tH-7}" fill="${txt}" font-size="11" font-weight="500" text-anchor="middle">W${wn}</text>`;
                }
                d = nd;
            }
        }

        // ── Day tier ─────────────────────────────────────────────────────────────
        if (tiers.includes('day')) {
            const ty = hTop + tiers.indexOf('day')*tH;
            let d = new Date(tS); d.setHours(0,0,0,0);
            while (d < tE) {
                const nd = new Date(d); nd.setDate(d.getDate()+1);
                const dx = getX(d);
                if (dx>=LW && dx<=canvasW-10) {
                    s += `<line x1="${dx}" y1="${ty}" x2="${dx}" y2="${svgH-10}" stroke="${grid}" stroke-width="1" stroke-dasharray="2 2"/>`;
                    if ((getX(nd)-dx)>18) s += `<text x="${dx+(getX(nd)-dx)/2}" y="${ty+tH-7}" fill="${txt}" font-size="11" font-weight="600" text-anchor="middle">${d.getDate()}</text>`;
                }
                d = nd;
            }
        }

        // ── Swimlane bands ───────────────────────────────────────────────────────
        let rc = 0;
        Object.keys(lanes).forEach((ln,li) => {
            const cnt = lanes[ln].length;
            const topY = hBot + rc*rH;
            if (li%2===0) s += `<rect x="0" y="${topY}" width="${canvasW}" height="${cnt*rH}" fill="${laneAlt}" opacity=".55"/>`;
            s += `<line x1="0" y1="${topY}" x2="${canvasW}" y2="${topY}" stroke="${grid}" stroke-width="1.5"/>`;
            // Sticky label
            s += `<text x="${LW-10}" y="${topY+18}" fill="${this.config.barColor}" font-size="10" font-weight="700" letter-spacing=".5" text-anchor="end" opacity=".85">${ln.length>14?ln.substring(0,13)+'…':ln}</text>`;
            rc += cnt;
        });

        // ── Today line ───────────────────────────────────────────────────────────
        const todayX = getX(new Date());
        if (this.config.showTodayLine && todayX>=LW && todayX<=canvasW-10) {
            s += `<line x1="${todayX}" y1="${hBot}" x2="${todayX}" y2="${svgH-10}" stroke="#EF4444" stroke-width="1.5" stroke-dasharray="4 2"/>`;
            s += `<rect x="${todayX-22}" y="${hBot+3}" width="44" height="18" rx="4" fill="#EF4444"/>`;
            s += `<text x="${todayX}" y="${hBot+15}" fill="#fff" font-size="9" font-weight="700" text-anchor="middle">TODAY</text>`;
        }

        // ── Task bars + popup cards ───────────────────────────────────────────────
        const taskPos = {};
        rows.forEach(({t,i,ln}, vi) => {
            const se = new Date(t.start+'T00:00:00');
            const ee = new Date(t.end+'T00:00:00');
            const sx = getX(se), ex = getX(ee);
            const bW = Math.max(ex-sx, 36);
            const bY = hBot + vi*rH + Math.round((rH-bH)/2);
            const isMilestone = t.start===t.end;
            const col = PRI_COL[t.priority] || t.ragColor || this.config.barColor;
            const progW = bW * ((t.progress||0)/100);
            const dur = Math.round((ee-se)/86400000);
            taskPos[t.id] = { cx:sx, cy:bY+bH/2, x2:sx+bW };

            // Connector line card→bar
            const cardH=78, cardW=Math.max(bW*0.9,170);
            const cardY = vi%2===0 ? bY-cardH-8 : bY-cardH/2-4;
            s += `<line x1="${sx+10}" y1="${cardY+cardH}" x2="${sx+10}" y2="${bY}" stroke="${col}" stroke-width="1" opacity=".25"/>`;

            if (isMilestone) {
                const mx=sx, my=bY+bH/2;
                s += `<g class="dt-bar" data-i="${i}" data-tip="${t.title} — Milestone — ${t.end}">
                    <path d="M ${mx} ${my-11} L ${mx+11} ${my} L ${mx} ${my+11} L ${mx-11} ${my} Z"
                        fill="${col}" filter="url(#dt-sh)" style="cursor:pointer"/>
                </g>`;
            } else {
                s += `<g class="dt-bar ${this.config.enableDragAndDrop?'dt-drag':''}"
                    data-i="${i}" data-tip="${t.title} · ${dur}d · ${t.progress||0}%" filter="url(#dt-sh)">
                    <rect x="${sx}" y="${bY}" width="${bW}" height="${bH}" fill="${col}" rx="5"/>
                    <rect x="${sx}" y="${bY}" width="${progW}" height="${bH}" fill="${this._dim(col,-28)}" rx="5" opacity=".9"/>
                    <text x="${sx+9}" y="${bY+bH-7}" fill="#fff" font-size="11" font-weight="700"
                        style="user-select:none;pointer-events:none">${(t.label||'').substring(0,14)}</text>
                </g>`;
            }

            // Popup card (foreignObject)
            const cardBg   = isDark ? '#1E1E2E' : '#FFFFFF';
            const cardBdr  = isDark ? '#2D2D45' : '#E2E8F0';
            const cardTxt  = isDark ? '#F1F5F9' : '#0F172A';
            const cardSub  = isDark ? '#94A3B8' : '#64748B';
            const pillBg   = col;
            s += `<foreignObject x="${sx}" y="${cardY}" width="${cardW}" height="${cardH}">
                <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;padding:2px">
                    <div style="background:${cardBg};border:1px solid ${cardBdr};border-top:3px solid ${pillBg};
                        border-radius:8px;padding:9px 11px;box-shadow:0 3px 10px rgba(0,0,0,${isDark?'.3':'.09'});
                        height:calc(100% - 4px);box-sizing:border-box;overflow:hidden">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;gap:4px">
                            <span style="font-weight:700;font-size:12px;color:${cardTxt};overflow:hidden;
                                text-overflow:ellipsis;white-space:nowrap;max-width:110px">${t.title}</span>
                            ${t.priority?`<span style="font-size:9px;padding:1px 5px;background:${pillBg};
                                color:#fff;border-radius:3px;font-weight:700;white-space:nowrap">${t.priority}</span>`:''}
                        </div>
                        <div style="font-size:11px;color:${cardSub};line-height:1.3;overflow:hidden;
                            text-overflow:ellipsis;white-space:nowrap">${t.description||''}</div>
                        ${t.progress>0?`<div style="margin-top:6px;height:4px;background:${isDark?'#2D2D45':'#E2E8F0'};border-radius:2px;overflow:hidden">
                            <div style="width:${t.progress}%;height:100%;background:${pillBg};border-radius:2px;opacity:.8"></div>
                        </div>`:''}
                    </div>
                </div>
            </foreignObject>`;
        });

        // ── Dependency arrows ────────────────────────────────────────────────────
        this._rawData.forEach(t => {
            if (t.dependencies && taskPos[t.dependencies] && taskPos[t.id]) {
                const from = taskPos[t.dependencies], to = taskPos[t.id];
                if (to.cx >= from.x2) {
                    const mx = from.x2 + (to.cx-from.x2)/2;
                    s += `<path d="M ${from.x2} ${from.cy} C ${mx} ${from.cy} ${mx} ${to.cy} ${to.cx} ${to.cy}"
                        stroke="${this.config.barColor}" stroke-width="1.5" fill="none"
                        opacity=".55" stroke-dasharray="3 2" marker-end="url(#dt-ar)"/>`;
                }
            }
        });

        s += `</svg></div>`;
        this.innerHTML = s;
        this._bindBars();
        // scroll to today after paint
        requestAnimationFrame(() => this._scrollToToday());
    }

    // ── Scroll to today ──────────────────────────────────────────────────────────
    _scrollToToday() {
        const w = this.querySelector('.dt-scroll');
        if (!w || !this.getX) return;
        const tx = this.getX(new Date());
        w.scrollTo({ left: tx - w.clientWidth/2, behavior:'smooth' });
    }

    // ── Event bindings ───────────────────────────────────────────────────────────
    _bindBars() {
        this.querySelectorAll('.dt-bar').forEach(el => {
            const i = parseInt(el.dataset.i);
            el.addEventListener('mousemove', e => {
                if (!this._tt) return;
                this._tt.textContent = el.dataset.tip;
                this._tt.style.cssText = `opacity:1;top:${e.pageY-14}px;left:${e.pageX}px`;
            });
            el.addEventListener('mouseleave', () => { if(this._tt) this._tt.style.opacity='0'; });
            el.addEventListener('click', () => {
                if (!this.dragState.wasDrag) this.dispatchEvent(new CustomEvent('task-click',{detail:this._rawData[i],bubbles:true}));
            });
            if (this.config.enableDragAndDrop) {
                el.addEventListener('mousedown', e => {
                    const sw = this.querySelector('.dt-scroll');
                    if(this._tt) this._tt.style.opacity='0';
                    this.dragState = { active:true, wasDrag:false, idx:i, startX:e.clientX,
                        scrollStart:sw?sw.scrollLeft:0,
                        origStart:this._rawData[i].start, origEnd:this._rawData[i].end };
                    window.addEventListener('mousemove', this._boundMM);
                    window.addEventListener('mouseup', this._boundMU);
                    e.preventDefault(); e.stopPropagation();
                });
            }
        });
    }

    _onMouseMove(e) {
        if (!this.dragState.active) return;
        const sw = this.querySelector('.dt-scroll');
        const svg = this.querySelector('.dt-svg');
        if (!sw || !svg) return;
        const scale = (this._rawData.length ? svg.getBoundingClientRect().width / svg.viewBox.baseVal.width : 1);
        const dScroll = sw.scrollLeft - this.dragState.scrollStart;
        const dx = ((e.clientX - this.dragState.startX) + dScroll) / scale;
        const snap = d => { if(this.config.snapToGrid) d.setHours(0,0,0,0); return d; };
        const fmt  = d => d.toISOString().split('T')[0];
        const t = this._rawData[this.dragState.idx];
        const origSX = this.getX(new Date(this.dragState.origStart+'T00:00:00'));
        const origEX = this.getX(new Date(this.dragState.origEnd+'T00:00:00'));
        t.start = fmt(snap(this.getDate(origSX+dx)));
        t.end   = fmt(snap(this.getDate(origEX+dx)));
        this.dragState.wasDrag = true;
        this.render();
    }

    _onMouseUp() {
        window.removeEventListener('mousemove', this._boundMM);
        window.removeEventListener('mouseup', this._boundMU);
        if (this.dragState.active) {
            this.dispatchEvent(new CustomEvent('task-date-change',{detail:this._rawData[this.dragState.idx],bubbles:true}));
        }
        this.dragState.active = false;
        setTimeout(() => { this.dragState.wasDrag = false; }, 60);
    }

    // ── Bounds calculation ───────────────────────────────────────────────────────
    _calcBounds(data) {
        const dates = [];
        data.forEach(t => {
            dates.push(new Date(t.start+'T00:00:00'), new Date(t.end+'T00:00:00'));
        });
        if (this.config.showTodayLine) dates.push(new Date());
        const min = new Date(Math.min(...dates)), max = new Date(Math.max(...dates));
        const pad = this.config.zoomLevel === 'day' || this.config.zoomLevel === 'week';
        const tS = pad ? new Date(min.getFullYear(),min.getMonth(),min.getDate()-5)
                       : new Date(min.getFullYear(),min.getMonth(),1);
        const tE = pad ? new Date(max.getFullYear(),max.getMonth(),max.getDate()+12)
                       : new Date(max.getFullYear(),max.getMonth()+2,1);
        this.timelineBounds = { start:tS, end:tE, totalDuration:tE-tS };
    }

    // ── Styles ───────────────────────────────────────────────────────────────────
    _injectStyles() {
        if (document.getElementById('dt-styles-v2')) return;
        const style = document.createElement('style');
        style.id = 'dt-styles-v2';
        style.textContent = `
            dashboard-timeline { display:block; width:100%; height:100%; }
            .dt-scroll { width:100%; height:100%; overflow:auto; -webkit-overflow-scrolling:touch; }
            .dt-svg { display:block; }
            .dt-bar { cursor:pointer; }
            .dt-drag { cursor:grab; user-select:none; }
            .dt-drag:active { cursor:grabbing; }
            #dt-tooltip-v2 { position:fixed; background:rgba(15,23,42,.92); color:#fff;
                padding:6px 10px; border-radius:5px; font-size:11px; font-weight:500;
                pointer-events:none; opacity:0; z-index:99999; white-space:nowrap;
                box-shadow:0 3px 8px rgba(0,0,0,.25); font-family:inherit; transition:opacity .1s; }
        `;
        document.head.appendChild(style);
    }

    _initTooltip() {
        let tt = document.getElementById('dt-tooltip-v2');
        if (!tt) {
            tt = document.createElement('div');
            tt.id = 'dt-tooltip-v2';
            document.body.appendChild(tt);
        }
        this._tt = tt;
    }

    // ── Colour helper ────────────────────────────────────────────────────────────
    _dim(hex, pct) {
        if (!hex || !hex.startsWith('#') || hex.length < 7) return hex||'#1A5FCC';
        const clamp = n => Math.min(255, Math.max(0, Math.round(n*(100+pct)/100)));
        const R=clamp(parseInt(hex.slice(1,3),16));
        const G=clamp(parseInt(hex.slice(3,5),16));
        const B=clamp(parseInt(hex.slice(5,7),16));
        return '#'+R.toString(16).padStart(2,'0')+G.toString(16).padStart(2,'0')+B.toString(16).padStart(2,'0');
    }
}


if (!customElements.get('dashboard-timeline')) {
    customElements.define('dashboard-timeline', DashboardTimeline);
}