const { ipcRenderer } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_PATH = path.join(os.homedir(), '.config', 'sldl', 'sldl.conf');

let totalTracks = 0;
let completedTracks = 0;

// Theme toggle
function toggleTheme() {
    const body = document.body;
    const toggle = document.getElementById('theme-toggle');
    
    body.classList.toggle('dark');
    body.classList.toggle('light');
    toggle.classList.toggle('active');
    
    // Save preference
    const isDark = body.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// Load theme preference on startup
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'light') {
    document.body.classList.remove('dark');
    document.body.classList.add('light');
}

// Check if settings exist on startup
window.addEventListener('DOMContentLoaded', () => {
    // Update theme toggle state
    const toggle = document.getElementById('theme-toggle');
    if (savedTheme === 'light') {
        toggle.classList.remove('active');
    }
    
    if (!fs.existsSync(CONFIG_PATH)) {
        switchTab('settings', true);
    } else {
        loadSettings();
    }
    
    // Load iPod mode preference
    const ipodMode = localStorage.getItem('ipodMode') === 'true';
    document.getElementById('ipod-mode').checked = ipodMode;
    
    const savedPlaylistName = localStorage.getItem('playlistName') || '';
    document.getElementById('playlist-name').value = savedPlaylistName;
});

// Save iPod preferences when changed
document.addEventListener('DOMContentLoaded', () => {
    const ipodCheckbox = document.getElementById('ipod-mode');
    const playlistNameInput = document.getElementById('playlist-name');
    
    ipodCheckbox.addEventListener('change', (e) => {
        localStorage.setItem('ipodMode', e.target.checked);
    });
    
    playlistNameInput.addEventListener('blur', (e) => {
        localStorage.setItem('playlistName', e.target.value);
    });
});

// Select folder dialog
function selectFolder() {
    console.log('selectFolder called');
    ipcRenderer.send('select-folder');
}

// Listen for selected folder
ipcRenderer.on('selected-folder', (event, folderPath) => {
    console.log('Folder selected:', folderPath);
    if (folderPath) {
        document.getElementById('download-path').value = folderPath;
        document.getElementById('current-path').textContent = `Selected: ${folderPath}`;
    }
});

// Toggle progress details
function toggleDetails() {
    const toggle = document.getElementById('details-toggle');
    const details = document.getElementById('progress-details');
    
    toggle.classList.toggle('open');
    details.classList.toggle('open');
    
    if (details.classList.contains('open')) {
        toggle.textContent = 'Hide details';
    } else {
        toggle.textContent = 'Show details';
    }
}

// Tab switching
function switchTab(tabName, skipEvent = false) {
    console.log('Switching to tab:', tabName);
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach((tab, index) => {
        const expectedTab = index === 0 ? 'download' : 'settings';
        if (expectedTab === tabName) {
            tab.classList.add('active');
        }
    });
    
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    if (tabName === 'settings') {
        loadSettings();
    }
}

// Load settings from config file
function loadSettings() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const config = fs.readFileSync(CONFIG_PATH, 'utf8');
            const lines = config.split('\n');
            
            lines.forEach(line => {
                const [key, ...valueParts] = line.split('=');
                const value = valueParts.join('=').trim();
                
                if (key.trim() === 'user') {
                    document.getElementById('username').value = value;
                }
                if (key.trim() === 'pass') {
                    document.getElementById('password').value = value;
                }
                if (key.trim() === 'path') {
                    document.getElementById('download-path').value = value;
                    document.getElementById('current-path').textContent = `Current: ${value}`;
                }
                if (key.trim() === 'pref-format') {
                    document.getElementById('audio-format').value = value;
                }
            });
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Save settings to config file
function saveSettings() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const downloadPath = document.getElementById('download-path').value;
    const audioFormat = document.getElementById('audio-format').value;
    
    if (!username || !password || !downloadPath) {
        showStatus('settings-status', 'Please fill in all fields', 'error');
        return;
    }
    
    const config = `user = ${username}
pass = ${password}
path = ${downloadPath}
name-format = {artist} - {title}
pref-format = ${audioFormat}`;
    
    try {
        const configDir = path.dirname(CONFIG_PATH);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        fs.writeFileSync(CONFIG_PATH, config, 'utf8');
        showStatus('settings-status', '✓ Settings saved successfully!', 'success');
        
        // Create download folder if it doesn't exist
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }
    } catch (error) {
        showStatus('settings-status', `Error saving settings: ${error.message}`, 'error');
    }
}

// Start download
async function startDownload() {
    const url = document.getElementById('playlist-url').value.trim();
    const ipodMode = document.getElementById('ipod-mode').checked;
    const playlistName = document.getElementById('playlist-name').value.trim();
    
    if (!url) {
        showStatus('status', 'Please enter a Spotify playlist URL', 'error');
        return;
    }
    
    if (!url.includes('spotify.com')) {
        showStatus('status', 'Please enter a valid Spotify URL', 'error');
        return;
    }
    
    // Check if settings exist
    if (!fs.existsSync(CONFIG_PATH)) {
        showStatus('status', 'Please configure your settings first', 'error');
        setTimeout(() => switchTab('settings', true), 2000);
        return;
    }
    
    // Check macOS for iPod mode
    if (ipodMode && process.platform !== 'darwin') {
        showStatus('status', '⚠ iPod Companion Mode only works on macOS', 'error');
        return;
    }
    
    const downloadBtn = document.getElementById('download-btn');
    const progressContainer = document.getElementById('progress-container');
    const progressText = document.getElementById('progress-text');
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    
    downloadBtn.disabled = true;
    downloadBtn.textContent = ipodMode ? 'Downloading & Syncing...' : 'Downloading...';
    progressContainer.classList.add('active');
    progressContainer.classList.remove('complete');
    progressText.textContent = '';
    progressBar.style.width = '0%';
    progressStatus.textContent = ipodMode ? 'Starting download with iPod sync...' : 'Starting download...';
    document.getElementById('status').style.display = 'none';
    
    // Reset counters
    totalTracks = 0;
    completedTracks = 0;
    
    // Send download command with iPod mode settings
    ipcRenderer.send('start-download', { 
        url, 
        ipodMode,
        playlistName 
    });
}

// Listen for download progress
ipcRenderer.on('download-progress', (event, data) => {
    const progressText = document.getElementById('progress-text');
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    
    progressText.textContent += data + '\n';
    progressText.scrollTop = progressText.scrollHeight;
    
    // Parse progress from output
    if (data.includes('Downloading') && data.includes('tracks:')) {
        const match = data.match(/Downloading (\d+) tracks:/);
        if (match) {
            totalTracks = parseInt(match[1]);
            progressStatus.textContent = `Found ${totalTracks} tracks to download...`;
            progressBar.style.width = '5%';
        }
    }
    
    // Track searching progress
    if (data.includes('Searching:')) {
        const searchingCount = (data.match(/Searching:/g) || []).length;
        if (totalTracks > 0) {
            const searchProgress = Math.min(30, (searchingCount / totalTracks) * 30);
            progressBar.style.width = searchProgress + '%';
            progressStatus.textContent = `Searching for tracks... (${searchingCount}/${totalTracks})`;
        }
    }
    
    // Track download progress
    if (data.includes('InProgress:')) {
        if (totalTracks > 0) {
            const downloadProgress = 30 + ((completedTracks / totalTracks) * 40);
            progressBar.style.width = downloadProgress + '%';
            progressStatus.textContent = `Downloading... ${completedTracks}/${totalTracks} completed`;
        }
    }
    
    if (data.includes('Succeeded:')) {
        completedTracks++;
        if (totalTracks > 0) {
            const percentage = 30 + ((completedTracks / totalTracks) * 40);
            progressBar.style.width = percentage + '%';
            progressStatus.textContent = `Downloaded ${completedTracks} of ${totalTracks} tracks (${Math.round((completedTracks/totalTracks)*100)}%)`;
        }
    }
    
    // Organizing files
    if (data.includes('--- Organizing files ---')) {
        progressBar.style.width = '75%';
        progressStatus.textContent = 'Organizing files...';
    }
    
    // iTunes integration
    if (data.includes('--- Adding to iTunes/Music ---')) {
        progressBar.style.width = '80%';
        progressStatus.textContent = 'Adding to iTunes/Music...';
    }
    
    if (data.includes('Creating playlist:')) {
        progressBar.style.width = '85%';
    }
    
    if (data.includes('--- Syncing to iPod ---')) {
        progressBar.style.width = '90%';
        progressStatus.textContent = 'Syncing to iPod...';
    }
    
    if (data.includes('Sync started!')) {
        progressBar.style.width = '95%';
    }
});

// Listen for download complete
ipcRenderer.on('download-complete', (event, success) => {
    const downloadBtn = document.getElementById('download-btn');
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const progressContainer = document.getElementById('progress-container');
    const ipodMode = document.getElementById('ipod-mode').checked;
    
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Start Download';
    
    if (success) {
        progressBar.style.width = '100%';
        
        if (ipodMode) {
            progressStatus.textContent = '🎉 Download complete! Check iTunes/Music for sync status.';
            showStatus('status', `✓ Successfully synced ${completedTracks} track${completedTracks !== 1 ? 's' : ''} to iPod!`, 'success');
        } else {
            progressStatus.textContent = '🎉 Download completed successfully!';
            showStatus('status', `✓ Successfully downloaded ${completedTracks} track${completedTracks !== 1 ? 's' : ''}!`, 'success');
        }
        
        // Add success animation
        progressContainer.classList.add('complete');
        setTimeout(() => {
            progressContainer.classList.remove('complete');
        }, 3000);
    } else {
        showStatus('status', '✗ Download failed. Check the details above.', 'error');
    }
});

// Show status message
function showStatus(elementId, message, type) {
    const statusEl = document.getElementById(elementId);
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    
    if (type === 'success') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
}
