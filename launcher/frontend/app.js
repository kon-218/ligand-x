// ============================================================
// Ligand-X Launcher - Frontend Application
// ============================================================

let statusInterval = null;
const MAX_LOGS = 500;
let logs = [];

const CORE_SERVICES = ['postgres', 'redis', 'rabbitmq', 'gateway', 'frontend', 'structure'];

const SERVICE_PRESETS = {
    'full': null,
    'core': [],
    'docking': ['ketcher', 'docking', 'worker-cpu'],
    'md': ['ketcher', 'md', 'worker-gpu-short'],
    'qc': ['ketcher', 'qc', 'worker-qc'],
    'free-energy': ['ketcher', 'docking', 'md', 'abfe', 'rbfe', 'worker-cpu', 'worker-gpu-short', 'worker-gpu-long'],
    'gpu': ['ketcher', 'docking', 'md', 'abfe', 'rbfe', 'boltz2', 'admet', 'worker-cpu', 'worker-gpu-short', 'worker-gpu-long'],
    'custom': null
};

// Initialize on load
document.addEventListener('DOMContentLoaded', init);

async function init() {
    // Check Docker status
    await checkDocker();
    
    // Get initial status
    await updateStatus();
    
    // Get project path
    await updateProjectPath();
    
    // Start polling for status updates
    statusInterval = setInterval(updateStatus, 5000);
    
    // Subscribe to log events
    window.runtime.EventsOn('log', handleLogEvent);

    // Start streaming logs for the default selection (All Services)
    changeLogService();
}

// ============================================================
// Docker & Status
// ============================================================

async function checkDocker() {
    try {
        const [ok, message] = await window.go.main.App.CheckDocker();
        updateDockerStatus(ok, message);
        return ok;
    } catch (err) {
        updateDockerStatus(false, err.message);
        return false;
    }
}

function updateDockerStatus(running, message) {
    const indicator = document.getElementById('dockerStatus');
    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('.status-text');
    
    dot.classList.remove('running', 'stopped');
    dot.classList.add(running ? 'running' : 'stopped');
    text.textContent = running ? 'Docker Running' : 'Docker Not Running';
    
    // Enable/disable controls based on Docker status
    const buttons = ['startBtn', 'stopBtn', 'restartBtn'];
    buttons.forEach(id => {
        document.getElementById(id).disabled = !running;
    });
}

async function updateStatus() {
    try {
        const status = await window.go.main.App.GetSystemStatus();
        
        // Update docker status
        updateDockerStatus(status.dockerRunning, '');
        
        // Update count
        document.getElementById('runningCount').textContent = status.totalRunning;
        
        // Update services grid
        const grid = document.getElementById('servicesGrid');
        if (status.services && status.services.length > 0) {
            grid.innerHTML = status.services.map(svc => `
                <div class="service-badge ${svc.running ? 'running' : 'stopped'}">
                    <span class="dot"></span>
                    <span>${svc.name}</span>
                </div>
            `).join('');
        } else {
            grid.innerHTML = '<span style="color: var(--text-muted); font-size: 12px;">No services running</span>';
        }
        
    } catch (err) {
        console.error('Failed to update status:', err);
    }
}

async function updateProjectPath() {
    try {
        const path = await window.go.main.App.GetProjectPath();
        document.getElementById('projectPath').textContent = path || 'Not set';
    } catch (err) {
        document.getElementById('projectPath').textContent = 'Error';
    }
}

// ============================================================
// Service Controls
// ============================================================

function setControlButtonsLoading(activeIcon) {
    ['startBtn', 'stopBtn', 'restartBtn'].forEach(id => {
        document.getElementById(id).disabled = true;
    });
    activeIcon.innerHTML = '<circle cx="12" cy="12" r="9" stroke-dasharray="28 29" stroke-linecap="round" fill="none"/>';
    activeIcon.style.animation = 'spin 0.8s linear infinite';
}

function clearControlButtonLoading(activeIcon, originalIconHtml) {
    activeIcon.innerHTML = originalIconHtml;
    activeIcon.style.animation = '';
}

async function startServices() {
    const env = document.getElementById('envMode').value;
    const preset = document.getElementById('servicePreset').value;
    const btn = document.getElementById('startBtn');
    const icon = btn.querySelector('svg');
    const originalIcon = icon.innerHTML;
    setControlButtonsLoading(icon);

    try {
        const services = getSelectedServices();
        if (services === null) {
            await window.go.main.App.StartServices(env);
        } else {
            await window.go.main.App.StartServicesCustom(env, services);
        }
        await updateStatus();
        const label = services === null ? 'all' : `${services.length}`;
        addLog('launcher', `Services started in ${env} mode (${label} services)`);
    } catch (err) {
        addLog('launcher', `Error: ${err.message}`, 'error');
    } finally {
        clearControlButtonLoading(icon, originalIcon);
        await updateStatus();
    }
}

function getSelectedServices() {
    const preset = document.getElementById('servicePreset').value;
    
    if (preset === 'full') {
        return null;
    }
    
    if (preset === 'custom') {
        const checkboxes = document.querySelectorAll('#customServices input[data-service]:checked');
        const selected = Array.from(checkboxes).map(cb => cb.value);
        return [...CORE_SERVICES, ...selected];
    }
    
    const presetServices = SERVICE_PRESETS[preset];
    return [...CORE_SERVICES, ...presetServices];
}

function onPresetChange() {
    const preset = document.getElementById('servicePreset').value;
    const customDiv = document.getElementById('customServices');
    
    if (preset === 'custom') {
        customDiv.classList.remove('hidden');
    } else {
        customDiv.classList.add('hidden');
    }
}

function selectAllServices() {
    document.querySelectorAll('#customServices input[data-service]').forEach(cb => {
        cb.checked = true;
    });
}

function selectNoServices() {
    document.querySelectorAll('#customServices input[data-service]').forEach(cb => {
        cb.checked = false;
    });
}

async function stopServices() {
    const btn = document.getElementById('stopBtn');
    const icon = btn.querySelector('svg');
    const originalIcon = icon.innerHTML;
    setControlButtonsLoading(icon);

    try {
        await window.go.main.App.StopServices();
        await updateStatus();
        addLog('launcher', 'Services stopped');
    } catch (err) {
        addLog('launcher', `Error: ${err.message}`, 'error');
    } finally {
        clearControlButtonLoading(icon, originalIcon);
        await updateStatus();
    }
}

async function restartServices() {
    const btn = document.getElementById('restartBtn');
    const icon = btn.querySelector('svg');
    const originalIcon = icon.innerHTML;
    setControlButtonsLoading(icon);

    try {
        await window.go.main.App.RestartServices();
        await updateStatus();
        addLog('launcher', 'Services restarted');
    } catch (err) {
        addLog('launcher', `Error: ${err.message}`, 'error');
    } finally {
        clearControlButtonLoading(icon, originalIcon);
        await updateStatus();
    }
}

async function pullImages() {
    const btn = document.getElementById('pullBtn');
    const icon = document.getElementById('pullIcon');
    btn.disabled = true;
    icon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
    icon.style.animation = 'spin 0.8s linear infinite';
    addLog('launcher', 'Pulling latest images...');

    try {
        await window.go.main.App.PullImages();
        addLog('launcher', 'Images updated successfully');
    } catch (err) {
        addLog('launcher', `Error: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        icon.innerHTML = '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>';
        icon.style.animation = '';
    }
}

// ============================================================
// Quick Links
// ============================================================

async function openFrontend() {
    await window.go.main.App.OpenFrontend();
}

async function openAPI() {
    await window.go.main.App.OpenAPI();
}

async function openFlower() {
    await window.go.main.App.OpenFlower();
}

// ============================================================
// Project & Maintenance
// ============================================================

async function selectProjectFolder() {
    try {
        const path = await window.go.main.App.SelectProjectFolder();
        if (path) {
            document.getElementById('projectPath').textContent = path;
            addLog('launcher', `Project path set to: ${path}`);
        }
    } catch (err) {
        addLog('launcher', `Error: ${err.message}`, 'error');
    }
}

async function cleanDocker() {
    const btn = document.querySelector('.footer-btn[onclick="cleanDocker()"]');
    const icon = btn.querySelector('svg');
    const originalIcon = icon.innerHTML;
    btn.disabled = true;
    icon.innerHTML = '<circle cx="12" cy="12" r="9" stroke-dasharray="28 29" stroke-linecap="round" fill="none"/>';
    icon.style.animation = 'spin 0.8s linear infinite';

    try {
        await window.go.main.App.CleanDocker();
        addLog('launcher', 'Docker cleanup completed');
    } catch (err) {
        addLog('launcher', `Error: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        icon.innerHTML = originalIcon;
        icon.style.animation = '';
    }
}

// ============================================================
// Logs
// ============================================================

function handleLogEvent(entry) {
    addLog(entry.service, entry.message);
}

function addLog(service, message, type = 'info') {
    const container = document.getElementById('logsContainer');
    const placeholder = container.querySelector('.log-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    
    logs.push({ timestamp, service, message, type });
    
    // Trim logs if too many
    if (logs.length > MAX_LOGS) {
        logs = logs.slice(-MAX_LOGS);
    }
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type} fade-in`;
    entry.innerHTML = `
        <span class="log-time">${timestamp}</span>
        <span class="log-service">[${service}]</span>
        <span class="log-message">${escapeHtml(message)}</span>
    `;
    
    container.appendChild(entry);
    
    // Auto-scroll to bottom
    container.scrollTop = container.scrollHeight;
    
    // Remove old entries from DOM if too many
    while (container.children.length > MAX_LOGS) {
        container.removeChild(container.firstChild);
    }
}

function clearLogs() {
    logs = [];
    const container = document.getElementById('logsContainer');
    container.innerHTML = '<div class="log-placeholder">Logs will appear here...</div>';
}

async function changeLogService() {
    const service = document.getElementById('logService').value;
    try {
        await window.go.main.App.ViewLogs(service);
        addLog('launcher', `Now viewing logs for: ${service}`);
    } catch (err) {
        addLog('launcher', `Error: ${err.message}`, 'error');
    }
}

// ============================================================
// Utilities
// ============================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    if (statusInterval) {
        clearInterval(statusInterval);
    }
});
