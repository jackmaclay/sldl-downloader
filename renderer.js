const { ipcRenderer } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_PATH = path.join(os.homedir(), '.config', 'sldl', 'sldl.conf');

// Tab switching
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
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
        return;
    }
    
    const downloadBtn = document.getElementById('download-btn');
    const progressContainer = document.getElementById('progress-container');
    const progressText = document.getElementById('progress-text');
    
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Downloading...';
    progressContainer.classList.add('active');
    progressText.textContent = 'Starting download...\n';
    document.getElementById('status').style.display = 'none';
    
    // Send download command to main process
    ipcRenderer.send('start-download', url);
}

// Listen for download progress
ipcRenderer.on('download-progress', (event, data) => {
    const progressText = document.getElementById('progress-text');
    progressText.textContent += data + '\n';
    progressText.scrollTop = progressText.scrollHeight;
});

// Listen for download complete
ipcRenderer.on('download-complete', (event, success) => {
    const downloadBtn = document.getElementById('download-btn');
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Start Download';
    
    if (success) {
        showStatus('status', '✓ Download completed successfully!', 'success');
    } else {
        showStatus('status', '✗ Download failed. Check the progress log above.', 'error');
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

// Load settings on startup
window.addEventListener('DOMContentLoaded', () => {
    loadSettings();
});
