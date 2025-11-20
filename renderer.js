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
    // Will update toggle in DOMContentLoaded
}

// Check if settings exist on startup
window.addEventListener('DOMContentLoaded', () => {
    if (!fs.existsSync(CONFIG_PATH)) {
        // No config found, switch to settings tab
        switchTab('settings', true);
    } else {
        loadSettings();
    }
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
    
    // Activate the correct tab button
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach((tab, index) => {
        const expectedTab = index === 0 ? 'download' : 'settings';
        if (expectedTab === tabName) {
            tab.classList.add('active');
        }
    });
    
    // Show the correct content
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
    
    if (!username || !password || !downloadPath) {
        showStatus('settings-status', 'Please fill in all fields', 'error');
        return;
    }
    
    const config = `user = ${username}
pass = ${password}
path = ${downloadPath}
name-format = {artist} - {title}
pref-format = flac`;
    
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
    
    const downloadBtn = document.getElementById('download-btn');
    const progressContainer = document.getElementById('progress-container');
    const progressText = document.getElementById('progress-text');
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Downloading...';
    progressContainer.classList.add('active');
    progressText.textContent = '';
    progressBar.style.width = '0%';
    progressStatus.textContent = 'Starting download...';
    document.getElementById('status').style.display = 'none';
    
    // Reset counters
    totalTracks = 0;
    completedTracks = 0;
    
    // Send download command with playlist ID to main process
    ipcRenderer.send('start-download', { url });
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
            progressStatus.textContent = `Downloading ${totalTracks} tracks...`;
        }
    }
    
    if (data.includes('Succeeded:')) {
        completedTracks++;
        if (totalTracks > 0) {
            const percentage = (completedTracks / totalTracks) * 100;
            progressBar.style.width = percentage + '%';
            progressStatus.textContent = `Downloaded ${completedTracks} of ${totalTracks} tracks (${Math.round(percentage)}%)`;
        }
    }
});

// Listen for download complete
ipcRenderer.on('download-complete', (event, success) => {
    const downloadBtn = document.getElementById('download-btn');
    const progressBar = document.getElementById('progress-bar');
    
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Start Download';
    
    if (success) {
        progressBar.style.width = '100%';
        showStatus('status', '✓ Download completed successfully!', 'success');
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
