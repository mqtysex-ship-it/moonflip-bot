// State
let currentTab = 'overview';
let wealthChart = null;
let gamesChart = null;
let currentDepartments = [];
let studioFields = [];

// Initialize Lucide Icons
function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// 1. Luxury Theme Management
function changeTheme(themeName) {
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem('moonflip_theme', themeName);
  document.getElementById('theme-selector').value = themeName;
  updateChartColors();
}

function initTheme() {
  const saved = localStorage.getItem('moonflip_theme') || 'gold';
  changeTheme(saved);
}

// Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-600 border-emerald-500 text-white',
    error: 'bg-red-600 border-red-500 text-white',
    info: 'bg-blue-600 border-blue-500 text-white',
  };

  toast.className = `pointer-events-auto px-4 py-3 rounded-2xl border shadow-2xl flex items-center space-x-2 text-sm font-semibold transition-all transform duration-300 translate-y-2 opacity-0 ${colors[type] || colors.info}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Tab Switching
document.querySelectorAll('.nav-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    switchTab(tabName);
  });
});

function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.nav-tab').forEach((t) => {
    if (t.dataset.tab === tabName) {
      t.className = 'nav-tab active flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold transition bg-slate-800 text-white border border-surface-border shadow-sm';
    } else {
      t.className = 'nav-tab flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold transition text-slate-400 hover:text-white hover:bg-slate-800/40';
    }
  });

  document.querySelectorAll('.tab-content').forEach((content) => {
    if (content.id === `tab-${tabName}`) {
      content.classList.remove('hidden');
    } else {
      content.classList.add('hidden');
    }
  });

  refreshIcons();

  if (tabName === 'overview') {
    loadCharts();
  } else if (tabName === 'tickets') {
    loadTickets();
    loadDepartmentsUI();
  } else if (tabName === 'settings') {
    loadSettingsUI();
  } else if (tabName === 'roles') {
    loadRoles();
  } else if (tabName === 'economy') {
    loadEconomy();
  } else if (tabName === 'embed-studio') {
    loadChannels();
    updateStudioPreview();
  }
}

// Format Seconds into readable uptime string
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}

// 2. Fetch & Update Status
async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    if (data.online) {
      document.getElementById('bot-name').innerText = data.bot.tag;
      document.getElementById('bot-avatar').src = data.bot.avatarUrl;
      document.getElementById('mock-avatar').src = data.bot.avatarUrl;
      document.getElementById('bot-status-dot').className = 'absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-surface-bg rounded-full shadow-sm animate-pulse';
      document.getElementById('bot-ping').innerText = `${data.ping} ms`;
      document.getElementById('bot-uptime').innerText = formatUptime(data.uptime);

      if (data.guild) {
        document.getElementById('guild-status').innerText = `${data.guild.name} • ${data.guild.memberCount} members • ${data.guild.channelsCount} channels`;
        document.getElementById('stat-members').innerText = data.guild.memberCount;
        document.getElementById('stat-guild-name').innerText = data.guild.name;
      }
    } else {
      document.getElementById('bot-status-dot').className = 'absolute bottom-0 right-0 w-3 h-3 bg-red-500 border-2 border-surface-bg rounded-full';
      document.getElementById('guild-status').innerText = 'Offline or disconnected';
    }
  } catch (err) {
    console.error('Failed to load status:', err);
  }
}

// 3. Fetch & Update Aggregated Stats
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();

    if (data.economy) {
      document.getElementById('stat-tokens').innerText = `${data.economy.totalTokens.toLocaleString()} 🪙`;
      document.getElementById('stat-players-count').innerText = `Across ${data.economy.totalUsers} registered player(s)`;
    }

    if (data.tickets) {
      document.getElementById('stat-active-tickets').innerText = data.tickets.activeTicketsCount;
      document.getElementById('stat-total-tickets').innerText = `Total tickets created: #${data.tickets.totalTickets}`;
      document.getElementById('tab-tickets-badge').innerText = data.tickets.activeTicketsCount;
      document.getElementById('active-tickets-counter').innerText = `${data.tickets.activeTicketsCount} Open`;
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// 4. Live Charts with Chart.js
async function loadCharts() {
  try {
    const res = await fetch('/api/charts');
    const data = await res.json();
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#f1c40f';

    // 1. Wealth Chart
    const ctxWealth = document.getElementById('chart-wealth')?.getContext('2d');
    if (ctxWealth) {
      if (wealthChart) wealthChart.destroy();
      wealthChart = new Chart(ctxWealth, {
        type: 'bar',
        data: {
          labels: data.wealthDistribution.labels,
          datasets: [
            {
              label: 'Members in Bracket',
              data: data.wealthDistribution.data,
              backgroundColor: accentColor,
              borderRadius: 8,
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 11 } },
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#94a3b8', stepSize: 1, font: { family: 'Plus Jakarta Sans', size: 11 } },
            },
          },
        },
      });
    }

    // 2. Games Chart
    const ctxGames = document.getElementById('chart-games')?.getContext('2d');
    if (ctxGames) {
      if (gamesChart) gamesChart.destroy();
      gamesChart = new Chart(ctxGames, {
        type: 'doughnut',
        data: {
          labels: data.gamesBreakdown.labels,
          datasets: [
            {
              data: data.gamesBreakdown.data,
              backgroundColor: [
                '#10b981', // Mines
                '#8b5cf6', // Crash
                '#3b82f6', // Keno
                '#f59e0b', // Slots
                '#ec4899', // Coinflip
                '#06b6d4', // Blackjack
              ],
              borderWidth: 2,
              borderColor: '#0f1420',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: '#cbd5e1',
                boxWidth: 12,
                font: { family: 'Plus Jakarta Sans', size: 11 },
              },
            },
          },
        },
      });
    }
  } catch (err) {
    console.error('Failed to load charts:', err);
  }
}

function updateChartColors() {
  if (wealthChart) {
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#f1c40f';
    wealthChart.data.datasets[0].backgroundColor = accentColor;
    wealthChart.update();
  }
}

// 5. Ticket System & Department Studio
async function loadTickets() {
  try {
    const res = await fetch('/api/tickets');
    const data = await res.json();
    const tbody = document.getElementById('tickets-table-body');

    if (!data.activeTickets || data.activeTickets.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="px-5 py-8 text-center text-slate-500">
            <div class="flex flex-col items-center justify-center space-y-1">
              <i data-lucide="inbox" class="w-8 h-8 text-slate-600 mb-1"></i>
              <span class="font-medium text-slate-400">No active tickets open right now</span>
              <span class="text-xs text-slate-500">Tickets will show up here when members click department buttons in #create-ticket</span>
            </div>
          </td>
        </tr>
      `;
      refreshIcons();
      return;
    }

    tbody.innerHTML = data.activeTickets
      .map((t) => {
        const openedDate = new Date(t.openedAt).toLocaleTimeString();
        const statusBadge = t.claimedBy
          ? `<span class="px-2 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Claimed</span>`
          : `<span class="px-2 py-0.5 text-xs rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Open</span>`;

        return `
          <tr class="hover:bg-slate-800/40 transition">
            <td class="px-5 py-3 font-mono font-bold text-accent">#${t.id}</td>
            <td class="px-5 py-3">
              <span class="font-bold text-white">${t.userName}</span>
              <div class="text-[11px] font-mono text-slate-500">${t.userId}</div>
            </td>
            <td class="px-5 py-3 font-medium text-slate-200">${t.title}</td>
            <td class="px-5 py-3">
              <code class="text-xs text-purple-400 font-mono font-semibold">#${t.channelName}</code>
            </td>
            <td class="px-5 py-3">${statusBadge}</td>
            <td class="px-5 py-3 text-xs text-slate-400">${openedDate}</td>
            <td class="px-5 py-3 text-right">
              <button onclick="closeTicket('${t.channelId}')" class="py-1 px-3 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-semibold transition inline-flex items-center gap-1">
                <i data-lucide="lock" class="w-3.5 h-3.5"></i>
                <span>Close</span>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    refreshIcons();
  } catch (err) {
    console.error('Failed to load tickets:', err);
  }
}

async function closeTicket(channelId) {
  if (!confirm('Are you sure you want to close and permanently remove this ticket channel?')) return;
  try {
    const res = await fetch('/api/tickets/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('Ticket channel closed.', 'success');
      loadTickets();
      loadStats();
    } else {
      showToast(data.error || 'Failed to close ticket.', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Department Customizer UI
async function loadDepartmentsUI() {
  try {
    const res = await fetch('/api/tickets/departments');
    const data = await res.json();
    currentDepartments = data.departments || [];
    renderDepartmentsGrid();
  } catch (err) {
    console.error('Failed to load departments:', err);
  }
}

function renderDepartmentsGrid() {
  const container = document.getElementById('departments-grid');
  container.innerHTML = currentDepartments
    .map((d, index) => {
      return `
        <div class="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3 relative group">
          <div class="flex justify-between items-center">
            <div class="flex items-center space-x-2">
              <input type="text" value="${d.emoji || '🎫'}" onchange="updateDeptProp(${index}, 'emoji', this.value)" class="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-center text-sm focus:outline-none focus:border-accent">
              <input type="text" value="${d.title}" onchange="updateDeptProp(${index}, 'title', this.value)" class="bg-transparent font-bold text-sm text-white focus:outline-none focus:border-b focus:border-accent">
            </div>
            <div class="flex items-center space-x-2">
              <input type="color" value="${d.color || '#2ecc71'}" onchange="updateDeptProp(${index}, 'color', this.value)" class="w-6 h-6 rounded cursor-pointer border border-slate-700 bg-transparent">
              <button onclick="deleteDepartment(${index})" class="text-slate-500 hover:text-red-400 p-1">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Instructions for Opener</label>
            <textarea rows="2" onchange="updateDeptProp(${index}, 'instructions', this.value)" class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 focus:outline-none focus:border-accent">${d.instructions}</textarea>
          </div>

          <div class="flex items-center justify-between text-xs text-slate-400 pt-1">
            <span class="font-mono text-[11px]">id: ${d.id}</span>
            <select onchange="updateDeptProp(${index}, 'buttonStyle', this.value)" class="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-white">
              <option value="Primary" ${d.buttonStyle === 'Primary' ? 'selected' : ''}>Blurple Button</option>
              <option value="Success" ${d.buttonStyle === 'Success' ? 'selected' : ''}>Green Button</option>
              <option value="Secondary" ${d.buttonStyle === 'Secondary' ? 'selected' : ''}>Grey Button</option>
              <option value="Danger" ${d.buttonStyle === 'Danger' ? 'selected' : ''}>Red Button</option>
            </select>
          </div>
        </div>
      `;
    })
    .join('');

  refreshIcons();
}

function updateDeptProp(index, prop, value) {
  if (currentDepartments[index]) {
    currentDepartments[index][prop] = value;
  }
}

function deleteDepartment(index) {
  if (currentDepartments.length <= 1) {
    return showToast('You must have at least 1 ticket department.', 'error');
  }
  currentDepartments.splice(index, 1);
  renderDepartmentsGrid();
}

function openAddDeptModal() {
  document.getElementById('modal-dept').classList.remove('hidden');
}

function closeDeptModal() {
  document.getElementById('modal-dept').classList.add('hidden');
}

function confirmAddDepartment() {
  const id = document.getElementById('new-dept-id').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const emoji = document.getElementById('new-dept-emoji').value.trim() || '🎫';
  const title = document.getElementById('new-dept-title').value.trim();
  const color = document.getElementById('new-dept-color').value;
  const buttonStyle = document.getElementById('new-dept-style').value;
  const instructions = document.getElementById('new-dept-instructions').value.trim();

  if (!id || !title) {
    return showToast('Unique key and title are required.', 'error');
  }

  currentDepartments.push({
    id,
    prefix: id,
    title,
    emoji,
    color,
    buttonStyle,
    instructions: instructions || 'Please describe your request in detail.',
  });

  closeDeptModal();
  renderDepartmentsGrid();
  showToast(`Added department: ${title}`, 'success');
}

async function saveDepartmentsFromGrid() {
  showToast('Saving ticket departments...', 'info');
  try {
    const res = await fetch('/api/tickets/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departments: currentDepartments }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('Departments saved! Click "Deploy to Discord" to update the panel.', 'success');
    } else {
      showToast(data.error || 'Failed to save departments', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 6. Bot & Server Config (Settings Tab)
async function loadSettingsUI() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    const s = data.settings || {};

    if (s.general) {
      document.getElementById('setting-bot-activity').value = s.general.botActivity || '';
      document.getElementById('setting-bot-acttype').value = s.general.activityType || 'Custom';
      document.getElementById('setting-bot-status').value = s.general.status || 'online';
      document.getElementById('setting-currency-symbol').value = s.general.currencySymbol || '🪙';
      document.getElementById('setting-currency-name').value = s.general.currencyName || 'Tokens';
    }

    if (s.economy) {
      document.getElementById('setting-eco-daily').value = s.economy.dailyAmount || 500;
      document.getElementById('setting-eco-cooldown').value = s.economy.dailyCooldownHours || 24;
      document.getElementById('setting-eco-deposit').value = s.economy.testDepositAmount || 1000;
      document.getElementById('setting-xp-min').value = s.economy.xpPerMessageMin || 15;
      document.getElementById('setting-xp-max').value = s.economy.xpPerMessageMax || 25;
    }

    if (s.casino) {
      document.getElementById('setting-rtp-mines').value = s.casino.minesRtp || 97;
      document.getElementById('setting-rtp-keno').value = s.casino.kenoRtp || 95;
      document.getElementById('setting-edge-crash').value = s.casino.crashHouseEdge || 3;
      document.getElementById('setting-rtp-slots').value = s.casino.slotsRtp || 96;
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

async function saveAllSettings() {
  const settings = {
    general: {
      botActivity: document.getElementById('setting-bot-activity').value.trim(),
      activityType: document.getElementById('setting-bot-acttype').value,
      status: document.getElementById('setting-bot-status').value,
      currencySymbol: document.getElementById('setting-currency-symbol').value.trim() || '🪙',
      currencyName: document.getElementById('setting-currency-name').value.trim() || 'Tokens',
    },
    economy: {
      dailyAmount: parseInt(document.getElementById('setting-eco-daily').value, 10) || 500,
      dailyCooldownHours: parseInt(document.getElementById('setting-eco-cooldown').value, 10) || 24,
      testDepositAmount: parseInt(document.getElementById('setting-eco-deposit').value, 10) || 1000,
      xpPerMessageMin: parseInt(document.getElementById('setting-xp-min').value, 10) || 15,
      xpPerMessageMax: parseInt(document.getElementById('setting-xp-max').value, 10) || 25,
    },
    casino: {
      minesRtp: parseInt(document.getElementById('setting-rtp-mines').value, 10) || 97,
      kenoRtp: parseInt(document.getElementById('setting-rtp-keno').value, 10) || 95,
      crashHouseEdge: parseInt(document.getElementById('setting-edge-crash').value, 10) || 3,
      slotsRtp: parseInt(document.getElementById('setting-rtp-slots').value, 10) || 96,
    },
  };

  showToast('Saving settings and updating presence...', 'info');
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (data.success) {
      showToast('Settings saved & applied to Discord!', 'success');
      loadStatus();
    } else {
      showToast(data.error || 'Failed to save settings', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 7. Roles Tab & Inline Editor
let currentRoles = [];

async function loadRoles() {
  try {
    const res = await fetch('/api/roles');
    const data = await res.json();
    currentRoles = data.roles || [];
    const tbody = document.getElementById('roles-table-body');

    // Audit banner
    const banner = document.getElementById('roles-audit-banner');
    if (data.audit.isSecure) {
      banner.className = 'p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between';
      banner.innerHTML = `
        <div class="flex items-center space-x-3">
          <div class="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
            <i data-lucide="shield-check" class="w-6 h-6"></i>
          </div>
          <div>
            <h4 class="text-sm font-bold text-white">Role Security Audit: Fully Secured</h4>
            <p class="text-xs text-slate-400">All member roles and @everyone are properly restricted. Regular users cannot tamper with roles or channels.</p>
          </div>
        </div>
      `;
    } else {
      banner.className = 'p-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-between';
      banner.innerHTML = `
        <div class="flex items-center space-x-3">
          <div class="p-2 rounded-xl bg-red-500/20 text-red-400">
            <i data-lucide="alert-triangle" class="w-6 h-6"></i>
          </div>
          <div>
            <h4 class="text-sm font-bold text-red-400">Security Warning: ${data.audit.vulnerabilitiesCount} Role(s) Have Excessive Permissions</h4>
            <p class="text-xs text-slate-300">Vulnerable: ${data.audit.vulnerableRoles.join(', ')}. Click "Enforce Anti-Tamper Security" to fix.</p>
          </div>
        </div>
      `;
    }

    tbody.innerHTML = currentRoles
      .map((r, idx) => {
        const flagBadges = [];
        if (r.isAdmin) flagBadges.push(`<span class="px-2 py-0.5 text-[11px] rounded bg-red-500/20 text-red-400 border border-red-500/30 font-semibold">Administrator</span>`);
        if (r.canManageGuild) flagBadges.push(`<span class="px-2 py-0.5 text-[11px] rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold">ManageServer</span>`);
        if (r.canManageRoles) flagBadges.push(`<span class="px-2 py-0.5 text-[11px] rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold">ManageRoles</span>`);
        if (r.canManageChannels) flagBadges.push(`<span class="px-2 py-0.5 text-[11px] rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold">ManageChannels</span>`);
        if (r.canMentionEveryone) flagBadges.push(`<span class="px-2 py-0.5 text-[11px] rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 font-semibold">MentionEveryone</span>`);
        if (r.canModerate) flagBadges.push(`<span class="px-2 py-0.5 text-[11px] rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Moderator</span>`);
        if (flagBadges.length === 0) flagBadges.push(`<span class="px-2 py-0.5 text-[11px] rounded bg-slate-800 text-slate-400">Safe Member</span>`);

        return `
          <tr class="hover:bg-slate-800/40 transition">
            <td class="px-5 py-3 font-mono font-bold text-slate-400">#${r.position}</td>
            <td class="px-5 py-3">
              <span class="font-bold text-white">${r.name}</span>
              ${r.managed ? '<span class="ml-1 text-[10px] text-slate-500 uppercase">(Managed Bot)</span>' : ''}
            </td>
            <td class="px-5 py-3">
              <div class="flex items-center space-x-2">
                <span class="w-3.5 h-3.5 rounded-full inline-block" style="background-color: ${r.color}"></span>
                <span class="font-mono text-xs text-slate-300">${r.color}</span>
              </div>
            </td>
            <td class="px-5 py-3 font-mono text-xs text-slate-400">${r.memberCount} members</td>
            <td class="px-5 py-3">
              <div class="flex flex-wrap gap-1">${flagBadges.join('')}</div>
            </td>
            <td class="px-5 py-3">
              ${r.hoist ? '<span class="text-emerald-400 font-semibold text-xs">Yes</span>' : '<span class="text-slate-500 text-xs">No</span>'}
            </td>
            <td class="px-5 py-3 text-right">
              ${
                !r.managed && r.position > 0
                  ? `<button onclick="openRoleModal('${r.id}')" class="py-1 px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1 border border-slate-700">
                      <i data-lucide="edit-2" class="w-3 h-3 text-accent"></i>
                      <span>Edit</span>
                    </button>`
                  : '<span class="text-slate-600 text-xs">Locked</span>'
              }
            </td>
          </tr>
        `;
      })
      .join('');

    refreshIcons();
  } catch (err) {
    console.error('Failed to load roles:', err);
  }
}

function openRoleModal(roleId) {
  const role = currentRoles.find((r) => r.id === roleId);
  if (!role) return;

  document.getElementById('edit-role-id').value = role.id;
  document.getElementById('edit-role-name').value = role.name;
  document.getElementById('edit-role-color').value = role.color || '#99aab5';
  document.getElementById('edit-role-color-hex').value = role.color || '#99aab5';
  document.getElementById('edit-role-hoist').checked = Boolean(role.hoist);
  document.getElementById('edit-role-mentionable').checked = Boolean(role.canMentionEveryone);

  document.getElementById('modal-role').classList.remove('hidden');
}

function closeRoleModal() {
  document.getElementById('modal-role').classList.add('hidden');
}

// Sync color inputs
document.getElementById('edit-role-color')?.addEventListener('input', (e) => {
  document.getElementById('edit-role-color-hex').value = e.target.value.toUpperCase();
});
document.getElementById('edit-role-color-hex')?.addEventListener('input', (e) => {
  if (e.target.value.startsWith('#') && e.target.value.length === 7) {
    document.getElementById('edit-role-color').value = e.target.value;
  }
});

async function saveRoleEdit() {
  const roleId = document.getElementById('edit-role-id').value;
  const name = document.getElementById('edit-role-name').value.trim();
  const color = document.getElementById('edit-role-color').value;
  const hoist = document.getElementById('edit-role-hoist').checked;
  const mentionable = document.getElementById('edit-role-mentionable').checked;

  showToast('Updating role in Discord...', 'info');
  try {
    const res = await fetch('/api/roles/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId, name, color, hoist, mentionable }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeRoleModal();
      loadRoles();
    } else {
      showToast(data.error || 'Failed to update role', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 8. Economy Tab
async function loadEconomy() {
  try {
    const res = await fetch('/api/economy/players');
    const data = await res.json();
    const tbody = document.getElementById('players-table-body');
    document.getElementById('player-count-badge').innerText = `${data.players.length} Players`;

    if (data.players.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500">No players registered yet.</td></tr>`;
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    tbody.innerHTML = data.players
      .map((p, idx) => {
        const medal = medals[idx] || `<span class="text-slate-500 font-mono text-xs">#${idx + 1}</span>`;
        return `
          <tr class="hover:bg-slate-800/40 transition">
            <td class="px-4 py-3 font-medium">${medal}</td>
            <td class="px-4 py-3">
              <button onclick="fillUserId('${p.userId}')" class="font-mono text-xs text-blue-400 hover:underline text-left">
                ${p.userId}
              </button>
            </td>
            <td class="px-4 py-3 text-right font-mono font-bold text-accent">${p.balance.toLocaleString()} 🪙</td>
            <td class="px-4 py-3 text-right font-mono text-slate-300">${p.gamesPlayed.toLocaleString()}</td>
            <td class="px-4 py-3 text-right font-mono text-slate-400">${p.totalBet.toLocaleString()} 🪙</td>
            <td class="px-4 py-3 text-center">
              <button onclick="fillUserId('${p.userId}')" class="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold">
                Select
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    refreshIcons();
  } catch (err) {
    console.error('Failed to load economy:', err);
  }
}

function fillUserId(id) {
  document.getElementById('input-eco-userid').value = id;
  document.getElementById('input-eco-amount').focus();
}

function setAmountQuick(amt) {
  document.getElementById('input-eco-amount').value = amt;
}

async function handleBalanceSubmit(event) {
  event.preventDefault();
  const userId = document.getElementById('input-eco-userid').value.trim();
  const action = document.getElementById('select-eco-action').value;
  const amount = parseInt(document.getElementById('input-eco-amount').value, 10);

  if (!userId || isNaN(amount)) {
    return showToast('Please enter a valid User ID and Amount.', 'error');
  }

  try {
    const res = await fetch('/api/economy/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action, amount }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Balance updated for ${userId}: now ${data.newBalance.toLocaleString()} 🪙`, 'success');
      loadEconomy();
      loadStats();
      loadCharts();
      document.getElementById('input-eco-amount').value = '';
    } else {
      showToast(data.error || 'Failed to adjust balance', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 9. Advanced Embed Studio
async function loadChannels() {
  try {
    const res = await fetch('/api/channels');
    const data = await res.json();
    const select = document.getElementById('studio-channel');

    select.innerHTML = data.channels
      .map((c) => `<option value="${c.id}">#${c.name} (${c.categoryName})</option>`)
      .join('');
  } catch (err) {
    console.error('Failed to load channels:', err);
  }
}

function addStudioField() {
  studioFields.push({ name: 'Field Title', value: 'Field value', inline: true });
  renderStudioFields();
  updateStudioPreview();
}

function removeStudioField(index) {
  studioFields.splice(index, 1);
  renderStudioFields();
  updateStudioPreview();
}

function renderStudioFields() {
  const container = document.getElementById('studio-fields-container');
  container.innerHTML = studioFields
    .map((f, i) => {
      return `
        <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2 text-xs">
          <input type="text" value="${f.name}" placeholder="Name" oninput="studioFields[${i}].name = this.value; updateStudioPreview();" class="w-1/3 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white">
          <input type="text" value="${f.value}" placeholder="Value" oninput="studioFields[${i}].value = this.value; updateStudioPreview();" class="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white">
          <label class="flex items-center space-x-1 text-slate-400 cursor-pointer">
            <input type="checkbox" ${f.inline ? 'checked' : ''} onchange="studioFields[${i}].inline = this.checked; updateStudioPreview();" class="rounded bg-slate-950 border-slate-700">
            <span>Inline</span>
          </label>
          <button type="button" onclick="removeStudioField(${i})" class="text-slate-500 hover:text-red-400 px-1">✕</button>
        </div>
      `;
    })
    .join('');
}

function updateStudioPreview() {
  const authorName = document.getElementById('studio-author-name').value.trim();
  const authorIcon = document.getElementById('studio-author-icon').value.trim();
  const title = document.getElementById('studio-title').value.trim() || 'Announcement Title';
  const desc = document.getElementById('studio-desc').value || 'Embed description will dynamically appear here...';
  const color = document.getElementById('studio-color').value;
  const thumbnail = document.getElementById('studio-thumbnail').value.trim();
  const image = document.getElementById('studio-image').value.trim();
  const footerText = document.getElementById('studio-footer-text').value.trim();
  const footerIcon = document.getElementById('studio-footer-icon').value.trim();
  const ping = document.getElementById('studio-ping').value;

  document.getElementById('studio-color-label').innerText = color.toUpperCase();
  document.getElementById('mock-embed-card').style.borderLeftColor = color;
  document.getElementById('mock-title').innerText = title;
  document.getElementById('mock-desc').innerText = desc;

  // Author
  const authorRow = document.getElementById('mock-author-row');
  if (authorName) {
    authorRow.classList.remove('hidden');
    document.getElementById('mock-author-name').innerText = authorName;
    const authorImg = document.getElementById('mock-author-icon');
    if (authorIcon) {
      authorImg.src = authorIcon;
      authorImg.classList.remove('hidden');
    } else {
      authorImg.classList.add('hidden');
    }
  } else {
    authorRow.classList.add('hidden');
  }

  // Ping Mention
  const mentionText = document.getElementById('mock-mention-text');
  if (ping === 'everyone') {
    mentionText.innerText = '@everyone';
    mentionText.classList.remove('hidden');
  } else if (ping === 'here') {
    mentionText.innerText = '@here';
    mentionText.classList.remove('hidden');
  } else {
    mentionText.classList.add('hidden');
  }

  // Thumbnail
  const thumbImg = document.getElementById('mock-thumbnail');
  if (thumbnail) {
    thumbImg.src = thumbnail;
    thumbImg.classList.remove('hidden');
  } else {
    thumbImg.classList.add('hidden');
  }

  // Banner Image
  const bannerImg = document.getElementById('mock-image');
  if (image) {
    bannerImg.src = image;
    bannerImg.classList.remove('hidden');
  } else {
    bannerImg.classList.add('hidden');
  }

  // Footer
  const footerLabel = document.getElementById('mock-footer-text');
  const footerImg = document.getElementById('mock-footer-icon');
  footerLabel.innerText = footerText || 'Moonflip Official • Today';
  if (footerIcon) {
    footerImg.src = footerIcon;
    footerImg.classList.remove('hidden');
  } else {
    footerImg.classList.add('hidden');
  }

  // Fields Grid
  const fieldsGrid = document.getElementById('mock-fields-grid');
  fieldsGrid.innerHTML = studioFields
    .map((f) => {
      const colSpan = f.inline ? 'sm:col-span-1' : 'col-span-full';
      return `
        <div class="${colSpan}">
          <div class="text-[11px] font-bold text-white uppercase">${f.name || 'Field'}</div>
          <div class="text-xs text-slate-300 whitespace-pre-line">${f.value || 'Value'}</div>
        </div>
      `;
    })
    .join('');
}

async function dispatchAdvancedEmbed() {
  const channelId = document.getElementById('studio-channel').value;
  const authorName = document.getElementById('studio-author-name').value.trim();
  const authorIconUrl = document.getElementById('studio-author-icon').value.trim();
  const title = document.getElementById('studio-title').value.trim();
  const titleUrl = document.getElementById('studio-title-url').value.trim();
  const description = document.getElementById('studio-desc').value.trim();
  const colorHex = document.getElementById('studio-color').value;
  const thumbnailUrl = document.getElementById('studio-thumbnail').value.trim();
  const imageUrl = document.getElementById('studio-image').value.trim();
  const footerText = document.getElementById('studio-footer-text').value.trim();
  const footerIconUrl = document.getElementById('studio-footer-icon').value.trim();
  const mention = document.getElementById('studio-ping').value;

  if (!channelId || (!title && !description)) {
    return showToast('Target Channel and Title/Description are required.', 'error');
  }

  showToast('Publishing embed to Discord...', 'info');
  try {
    const res = await fetch('/api/channels/send-advanced-embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId,
        authorName,
        authorIconUrl,
        title,
        titleUrl,
        description,
        colorHex,
        fields: studioFields,
        thumbnailUrl,
        imageUrl,
        footerText,
        footerIconUrl,
        timestamp: true,
        mention,
      }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
    } else {
      showToast(data.error || 'Failed to dispatch embed', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 10. Deployment Triggers
async function triggerDeploy(type) {
  showToast(`Deploying ${type} to Discord...`, 'info');
  try {
    const res = await fetch(`/api/deploy/${type}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadStats();
    } else {
      showToast(data.error || `Failed to deploy ${type}`, 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function triggerHardenRoles() {
  showToast('Locking down permissions & securing roles...', 'info');
  try {
    const res = await fetch('/api/roles/fix-permissions', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadRoles();
    } else {
      showToast(data.error || 'Failed to harden roles', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 11. Logs Viewer
async function loadLogs() {
  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    const container = document.getElementById('logs-container');

    if (!data.logs || data.logs.length === 0) return;

    container.innerHTML = data.logs
      .map((l) => {
        const color = l.level === 'error' ? 'text-red-400' : 'text-slate-300';
        return `<div class="${color}"><span class="text-slate-500 font-mono">[${l.time}]</span> ${escapeHtml(l.message)}</div>`;
      })
      .join('');

    container.scrollTop = container.scrollHeight;
  } catch {}
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}

// Manual Refresh Button
document.getElementById('btn-manual-refresh').addEventListener('click', () => {
  loadStatus();
  loadStats();
  if (currentTab === 'overview') loadCharts();
  if (currentTab === 'tickets') loadTickets();
  if (currentTab === 'roles') loadRoles();
  if (currentTab === 'economy') loadEconomy();
  loadLogs();
  showToast('Dashboard data refreshed.', 'info');
});

// Initial boot
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadStatus();
  loadStats();
  loadCharts();
  loadLogs();
  refreshIcons();

  // Auto polling every 5s
  setInterval(() => {
    loadStatus();
    loadStats();
    loadLogs();
    if (currentTab === 'tickets') loadTickets();
  }, 5000);
});
