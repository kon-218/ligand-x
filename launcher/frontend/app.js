// ============================================================
// Ligand-X Launcher - Frontend Application
// ============================================================

let statusInterval = null;
const MAX_LOGS = 500;
let logs = [];

const CORE_SERVICES = ['postgres', 'redis', 'rabbitmq', 'gateway', 'frontend', 'structure'];

// Initialize on load
document.addEventListener('DOMContentLoaded', init);

async function init() {
    // Setup tab switching
    setupTabSwitching();

    // Check for first-run wizard
    await initializeWizard();

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
    window.runtime.EventsOn('pullProgress', handlePullProgress);
    window.runtime.EventsOn('pullComplete', handlePullComplete);

    // Start streaming logs for the default selection (All Services)
    changeLogService();
}

// ============================================================
// Tab Switching
// ============================================================

function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-button');

    tabButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const tabName = button.getAttribute('data-tab');

            // Remove active from all buttons
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Remove active from all content panels
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });

            // Add active to selected content panel
            const activeContent = document.querySelector(`.tab-content[data-tab="${tabName}"]`);
            if (activeContent) {
                activeContent.classList.add('active');
            }

            // Render Services tab if clicked
            if (tabName === 'services') {
                await renderServicesTab();
            }
        });
    });
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
    icon.style.animation = 'spin 0.8s linear infinite';

    try {
        const config = await window.go.main.App.GetLauncherConfig();
        if (!config.selectedGroups || config.selectedGroups.length === 0) {
            addLog('launcher', 'No services selected. Please configure services in the Services tab.');
            return;
        }

        addLog('launcher', `Pulling services: ${config.selectedGroups.join(', ')}...`);
        window.go.main.App.PullServiceGroups(config.selectedGroups);
    } catch (err) {
        addLog('launcher', `Error: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
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

function handlePullProgress(event) {
    const data = event.detail;

    // Update wizard progress if visible (only show progress for wizard, not for re-pulls)
    if (!document.getElementById('firstRunWizard').classList.contains('hidden')) {
        document.getElementById('pullOverallBar').style.width = data.overallPercent.toFixed(1) + '%';
        document.getElementById('pullImageCounter').textContent = (data.imageIndex + 1) + ' / ' + data.totalImages;

        const imageName = data.currentImage.split('/').pop();
        document.getElementById('pullCurrentImage').textContent = imageName;

        document.getElementById('pullImageBar').style.width = data.imagePercent.toFixed(1) + '%';
        document.getElementById('pullStatusText').textContent = data.status || 'Downloading...';
    }
}

function addLog(service, message, type = 'info') {
    const container = document.getElementById('logsContainer');

    // If we're pulling, only show logs for the group being pulled
    if (window.isPulling && service !== window.currentPullingGroup && service !== 'launcher') {
        return;
    }

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

// ============================================================
// First-Run Wizard
// ============================================================

let wizardServiceGroups = [];
let wizardSelectedGroups = [];
let failedPullGroups = [];

async function initializeWizard() {
    try {
        const config = await window.go.main.App.GetLauncherConfig();

        if (!config.firstRunDone) {
            // Get service groups and check image presence
            wizardServiceGroups = await window.go.main.App.GetServiceGroups();
            const imageStatus = await window.go.main.App.CheckImagePresence();

            // Check if default groups are already pulled
            const defaultGroups = wizardServiceGroups
                .filter(g => g.defaultOn || g.required)
                .map(g => g.id);

            const allDefaultsPresent = defaultGroups.every(groupId => imageStatus[groupId]);

            if (allDefaultsPresent) {
                // All default images already present - skip wizard and mark as done
                const newConfig = {
                    firstRunDone: true,
                    selectedGroups: defaultGroups,
                    configVersion: 1
                };
                await window.go.main.App.SaveLauncherConfig(newConfig);
            } else {
                // Some images missing - show wizard
                wizardSelectedGroups = defaultGroups;
                showWizard();
            }
        }
    } catch (err) {
        console.error('Failed to initialize wizard:', err);
    }
}

function showWizard() {
    const wizard = document.getElementById('firstRunWizard');
    wizard.classList.remove('hidden');

    // Render service cards for step 2
    renderWizardServiceCards();
    updateEstimatedSize();
}

function renderWizardServiceCards() {
    const container = document.getElementById('wizardServiceCards');
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    wizardServiceGroups.forEach(group => {
        const isSelected = wizardSelectedGroups.includes(group.id);
        const isDisabled = group.required;

        const card = document.createElement('div');
        card.className = `wizard-card ${isDisabled ? 'disabled' : ''}`;
        if (!isDisabled) {
            card.onclick = () => toggleWizardGroup(group.id);
        }

        const toggle = document.createElement('div');
        toggle.className = `wizard-card-toggle ${isSelected ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}`;

        const info = document.createElement('div');
        info.className = 'wizard-card-info';

        const name = document.createElement('p');
        name.className = 'wizard-card-name';
        name.textContent = group.name;

        const desc = document.createElement('p');
        desc.className = 'wizard-card-desc';
        desc.textContent = group.description;

        const size = document.createElement('p');
        size.className = 'wizard-card-size';
        size.textContent = `~${(group.sizeMb / 1000).toFixed(1)} GB`;

        info.appendChild(name);
        info.appendChild(desc);
        info.appendChild(size);

        card.appendChild(toggle);
        card.appendChild(info);
        container.appendChild(card);
    });
}

function toggleWizardGroup(groupId) {
    const idx = wizardSelectedGroups.indexOf(groupId);
    if (idx > -1) {
        wizardSelectedGroups.splice(idx, 1);
    } else {
        wizardSelectedGroups.push(groupId);
    }
    renderWizardServiceCards();
    updateEstimatedSize();
}

function updateEstimatedSize() {
    let total = 0;
    wizardServiceGroups.forEach(group => {
        if (wizardSelectedGroups.includes(group.id)) {
            total += group.sizeMb;
        }
    });
    const gb = (total / 1000).toFixed(1);
    document.getElementById('estimatedSize').textContent = gb;
}

function nextWizardStep() {
    const steps = document.querySelectorAll('.wizard-step');
    const activeStep = document.querySelector('.wizard-step.active');
    const activeIndex = Array.from(steps).indexOf(activeStep);

    if (activeIndex < steps.length - 1) {
        activeStep.classList.remove('active');
        steps[activeIndex + 1].classList.add('active');
    }
}

function previousWizardStep() {
    const steps = document.querySelectorAll('.wizard-step');
    const activeStep = document.querySelector('.wizard-step.active');
    const activeIndex = Array.from(steps).indexOf(activeStep);

    if (activeIndex > 0) {
        activeStep.classList.remove('active');
        steps[activeIndex - 1].classList.add('active');
    }
}

async function startWizardPull() {
    // Hide actions, show progress
    document.getElementById('pullSetupBtn').style.display = 'none';
    document.getElementById('pullProgressContainer').classList.remove('hidden');
    document.getElementById('pullErrorBanner').classList.add('hidden');

    failedPullGroups = [];

    // Clear progress logs
    const logsContainer = document.getElementById('wizardLogsContainer');
    while (logsContainer.firstChild) {
        logsContainer.removeChild(logsContainer.firstChild);
    }

    // Start pull
    window.go.main.App.PullServiceGroups(wizardSelectedGroups);
}

function handlePullComplete(event) {
    const data = event.detail;

    // Clear pulling state
    window.isPulling = false;

    if (data.success) {
        // Check if this was a wizard pull or a service tab pull
        if (wizardSelectedGroups && wizardSelectedGroups.length > 0 && document.getElementById('firstRunWizard').classList.contains('hidden') === false) {
            // This is a wizard pull
            saveWizardConfig();
        } else {
            // This is a service tab pull - refresh the tab
            if (window.currentPullingGroup) {
                const button = document.querySelector(`[data-group="${window.currentPullingGroup}"] button`);
                if (button) {
                    button.disabled = false;
                    button.textContent = 'Re-pull';
                }

                window.currentPullingGroup = null;
            }

            // Refresh services tab to show updated status
            renderServicesTab();
        }
    } else {
        // Pull failed
        failedPullGroups = data.failedGroups || wizardSelectedGroups;

        // Check if this was a wizard pull or service tab pull
        if (wizardSelectedGroups && wizardSelectedGroups.length > 0 && document.getElementById('firstRunWizard').classList.contains('hidden') === false) {
            // Wizard pull failed
            const errorBanner = document.getElementById('pullErrorBanner');
            const errorMsg = document.getElementById('errorMessage');

            if (data.reason === 'gpu_not_found') {
                errorMsg.textContent = 'NVIDIA GPU not detected. Deselect GPU services and retry.';
            } else {
                errorMsg.textContent = `Failed to pull: ${failedPullGroups.join(', ')}. Check your connection and retry.`;
            }

            errorBanner.classList.remove('hidden');

            // Reset button
            document.getElementById('pullSetupBtn').style.display = 'block';
            document.getElementById('pullProgressContainer').classList.add('hidden');
        } else {
            // Service tab pull failed - re-enable button with error state
            if (window.currentPullingGroup) {
                const button = document.querySelector(`[data-group="${window.currentPullingGroup}"] button`);
                if (button) {
                    button.disabled = false;
                    button.textContent = 'Pull Failed - Retry';
                }

                window.currentPullingGroup = null;
            }

            // Re-enable logs from all services
            window.isPulling = false;
        }
    }
}

function retryPullFailed() {
    startWizardPull();
}

async function saveWizardConfig() {
    try {
        const config = {
            firstRunDone: true,
            selectedGroups: wizardSelectedGroups,
            configVersion: 1
        };

        await window.go.main.App.SaveLauncherConfig(config);

        // Close wizard
        const wizard = document.getElementById('firstRunWizard');
        wizard.classList.add('hidden');

        // Update status to show selected services
        await updateStatus();
    } catch (err) {
        console.error('Failed to save config:', err);
    }
}

// ============================================================
// Services Tab
// ============================================================

async function renderServicesTab() {
    try {
        const [allGroups, imageStatus, config] = await Promise.all([
            window.go.main.App.GetServiceGroups(),
            window.go.main.App.CheckImagePresence(),
            window.go.main.App.GetLauncherConfig()
        ]);

        const container = document.getElementById('servicesTabContent');
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        const grid = document.createElement('div');
        grid.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

        allGroups.forEach(group => {
            const isPulled = imageStatus[group.id];
            const isSelected = config.selectedGroups && config.selectedGroups.includes(group.id);
            const isPulling = window.currentPullingGroup === group.id;

            const card = document.createElement('div');
            card.setAttribute('data-group', group.id);
            card.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md);';

            // Status badge
            const badge = document.createElement('div');
            if (isPulling) {
                badge.textContent = '⟳';
                badge.style.cssText = 'width: 24px; height: 24px; background: var(--accent-warning); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; animation: spin 0.8s linear infinite;';
            } else if (isPulled) {
                badge.textContent = '✓';
                badge.style.cssText = 'width: 24px; height: 24px; background: var(--accent-success); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;';
            } else {
                badge.textContent = '✗';
                badge.style.cssText = 'width: 24px; height: 24px; background: var(--accent-danger); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;';
            }

            // Info
            const info = document.createElement('div');
            info.style.cssText = 'flex: 1;';

            const name = document.createElement('p');
            name.style.cssText = 'margin: 0; font-size: 14px; font-weight: 500; color: var(--text-primary);';
            name.textContent = group.name;

            const desc = document.createElement('p');
            desc.style.cssText = 'margin: 4px 0 0; font-size: 12px; color: var(--text-muted);';
            desc.textContent = group.description;

            info.appendChild(name);
            info.appendChild(desc);

            // Pull button
            const button = document.createElement('button');
            button.className = 'btn btn-sm btn-secondary';
            button.style.flexShrink = '0';

            if (isPulling) {
                button.textContent = 'Pulling...';
                button.disabled = true;
            } else {
                button.textContent = isPulled ? 'Re-pull' : 'Pull';
                button.disabled = false;
                button.onclick = () => pullServiceGroup(group.id);
            }

            card.appendChild(badge);
            card.appendChild(info);
            card.appendChild(button);
            grid.appendChild(card);
        });

        container.appendChild(grid);
    } catch (err) {
        console.error('Failed to render Services tab:', err);
        const container = document.getElementById('servicesTabContent');
        container.textContent = 'Error loading services: ' + err.message;
    }
}

async function pullServiceGroup(groupId) {
    // Find and disable the button for this group
    const button = document.querySelector(`[data-group="${groupId}"] button`);
    if (button) {
        button.disabled = true;
        button.textContent = 'Pulling...';
    }

    // Store which group we're pulling for completion handling
    window.currentPullingGroup = groupId;
    window.isPulling = true;

    // Start pull
    window.go.main.App.PullServiceGroups([groupId]);
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    if (statusInterval) {
        clearInterval(statusInterval);
    }
});
