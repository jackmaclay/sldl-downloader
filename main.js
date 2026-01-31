const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isDev = !app.isPackaged;
const sldlPath = isDev 
  ? 'sldl'  // Use system sldl in development
  : path.join(process.resourcesPath, 'sldl');  // Use bundled sldl in production

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 650,
        height: 750,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        backgroundColor: '#1a1a1a',
        titleBarStyle: 'hiddenInset',
        vibrancy: 'under-window',
        visualEffectState: 'active',
        title: 'SLDL Downloader'
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Handle folder selection
ipcMain.on('select-folder', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Download Folder',
        buttonLabel: 'Select Folder'
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        event.sender.send('selected-folder', result.filePaths[0]);
    }
});

// Read download path from config
function getDownloadPath() {
    const CONFIG_PATH = path.join(os.homedir(), '.config', 'sldl', 'sldl.conf');
    try {
        const config = fs.readFileSync(CONFIG_PATH, 'utf8');
        const lines = config.split('\n');
        for (const line of lines) {
            if (line.trim().startsWith('path')) {
                const [, ...valueParts] = line.split('=');
                return valueParts.join('=').trim();
            }
        }
    } catch (error) {
        console.error('Error reading config:', error);
    }
    return null;
}

// Handle download command
ipcMain.on('start-download', (event, data) => {
    const { url } = data;
    
    const basePath = getDownloadPath();
    if (!basePath) {
        event.sender.send('download-progress', 'Error: Could not read download path');
        event.sender.send('download-complete', false);
        return;
    }
    
    event.sender.send('download-progress', `Download path: ${basePath}\n`);
    
    // Get list of items before download
    let itemsBefore = [];
    try {
        itemsBefore = fs.readdirSync(basePath);
        event.sender.send('download-progress', `Items before: ${itemsBefore.length}\n`);
    } catch (error) {
        event.sender.send('download-progress', `Warning: Could not read directory before download\n`);
    }
    
    const itemsBeforeSet = new Set(itemsBefore);
    
    // Run sldl with bundled or system path
    const sldl = spawn(sldlPath, [url]);
    
    sldl.stdout.on('data', (data) => {
        event.sender.send('download-progress', data.toString());
    });
    
    sldl.stderr.on('data', (data) => {
        event.sender.send('download-progress', data.toString());
    });
    
    sldl.on('close', (code) => {
        event.sender.send('download-progress', '\n--- Organizing files ---\n');
        
        if (code === 0) {
            try {
                // Get new items after download
                const itemsAfter = fs.readdirSync(basePath);
                event.sender.send('download-progress', `Items after: ${itemsAfter.length}\n`);
                
                // Find new folder (likely the playlist folder)
                let playlistFolder = null;
                let playlistFolderName = null;
                
                for (const item of itemsAfter) {
                    if (!itemsBeforeSet.has(item)) {
                        const itemPath = path.join(basePath, item);
                        const stat = fs.statSync(itemPath);
                        
                        if (stat.isDirectory()) {
                            playlistFolder = itemPath;
                            playlistFolderName = item;
                            event.sender.send('download-progress', `Found new folder: ${item}\n`);
                            break;
                        }
                    }
                }
                
                if (playlistFolder) {
                    event.sender.send('download-progress', `Moving files into: ${playlistFolderName}\n`);
                    
                    // Move any loose music files into the playlist folder
                    let movedCount = 0;
                    for (const item of itemsAfter) {
                        if (!itemsBeforeSet.has(item) && item !== playlistFolderName) {
                            const itemPath = path.join(basePath, item);
                            
                            try {
                                const stat = fs.statSync(itemPath);
                                if (stat.isFile() && 
                                    (item.endsWith('.flac') || item.endsWith('.mp3') || item.endsWith('.m4a'))) {
                                    const destPath = path.join(playlistFolder, item);
                                    fs.renameSync(itemPath, destPath);
                                    event.sender.send('download-progress', `  ✓ Moved: ${item}\n`);
                                    movedCount++;
                                }
                            } catch (err) {
                                event.sender.send('download-progress', `  ✗ Could not move ${item}: ${err.message}\n`);
                            }
                        }
                    }
                    
                    event.sender.send('download-progress', `\n✓ Moved ${movedCount} files into ${playlistFolderName}\n`);
                } else {
                    event.sender.send('download-progress', 'No new folder found - files left in place\n');
                }
            } catch (error) {
                event.sender.send('download-progress', `Error organizing: ${error.message}\n`);
            }
        }
        
        event.sender.send('download-complete', code === 0);
    });
    
    sldl.on('error', (error) => {
        event.sender.send('download-progress', `Error: ${error.message}`);
        event.sender.send('download-complete', false);
    });
});