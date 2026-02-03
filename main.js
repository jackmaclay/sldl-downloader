const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const util = require('util');

const execPromise = util.promisify(exec);

const isDev = !app.isPackaged;
const sldlPath = isDev 
  ? 'sldl'
  : path.join(process.resourcesPath, 'sldl');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 750,
        height: 850,
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

// Get Spotify playlist info
async function getSpotifyPlaylistInfo(url) {
    event.sender.send('download-progress', 'Fetching playlist information from Spotify...\n');
    
    // Extract playlist ID from URL
    const playlistIdMatch = url.match(/playlist\/([a-zA-Z0-9]+)/);
    if (!playlistIdMatch) {
        throw new Error('Invalid Spotify playlist URL');
    }
    
    return {
        id: playlistIdMatch[1],
        url: url
    };
}

// AppleScript helper for iTunes/Music app
async function runAppleScript(script) {
    if (process.platform !== 'darwin') {
        throw new Error('iTunes integration only works on macOS');
    }
    
    try {
        const { stdout, stderr } = await execPromise(`osascript -e '${script.replace(/'/g, "\\'")}'`);
        if (stderr) console.error('AppleScript stderr:', stderr);
        return stdout.trim();
    } catch (error) {
        console.error('AppleScript error:', error);
        throw error;
    }
}

// Add tracks to iTunes/Music and create playlist
async function addToiTunes(playlistName, musicFolder, trackList, event) {
    event.sender.send('download-progress', '\n--- Adding to iTunes/Music ---\n');
    event.sender.send('download-progress', `Creating playlist: ${playlistName}\n`);
    
    // Check if Music app or iTunes exists
    const appName = await runAppleScript('try\ntell application "Music" to return name\non error\ntell application "iTunes" to return name\nend try');
    
    const musicApp = appName.includes('Music') ? 'Music' : 'iTunes';
    event.sender.send('download-progress', `Using ${musicApp} app\n`);
    
    // Create or clear playlist
    await runAppleScript(`
        tell application "${musicApp}"
            try
                delete playlist "${playlistName}"
            end try
            make new user playlist with properties {name:"${playlistName}"}
        end tell
    `);
    
    // Get all music files from the folder
    const files = fs.readdirSync(musicFolder)
        .filter(f => f.match(/\.(mp3|flac|m4a|aac)$/i))
        .map(f => path.join(musicFolder, f));
    
    event.sender.send('download-progress', `Found ${files.length} music files to add\n`);
    
    // Add each track to iTunes and to the playlist in order
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = path.basename(file);
        
        try {
            event.sender.send('download-progress', `Adding ${i + 1}/${files.length}: ${fileName}\n`);
            
            // Add to library and playlist
            await runAppleScript(`
                tell application "${musicApp}"
                    set theTrack to add POSIX file "${file}"
                    duplicate theTrack to playlist "${playlistName}"
                end tell
            `);
            
            // Small delay to avoid overwhelming iTunes
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            event.sender.send('download-progress', `  Warning: Could not add ${fileName}: ${error.message}\n`);
        }
    }
    
    event.sender.send('download-progress', `\n✓ Playlist "${playlistName}" created with ${files.length} tracks\n`);
}

// Sync to iPod
async function syncToiPod(playlistName, event) {
    event.sender.send('download-progress', '\n--- Syncing to iPod ---\n');
    
    const musicApp = await runAppleScript('try\ntell application "Music" to return name\non error\ntell application "iTunes" to return name\nend try');
    const appName = musicApp.includes('Music') ? 'Music' : 'iTunes';
    
    // Get iPod name
    try {
        const ipodName = await runAppleScript(`
            tell application "${appName}"
                set deviceList to name of sources whose kind is iPod
                if length of deviceList > 0 then
                    return item 1 of deviceList
                else
                    return "none"
                end if
            end tell
        `);
        
        if (ipodName === 'none') {
            event.sender.send('download-progress', '⚠ No iPod detected. Please connect your iPod and try again.\n');
            return false;
        }
        
        event.sender.send('download-progress', `Found iPod: ${ipodName}\n`);
        event.sender.send('download-progress', `Syncing playlist "${playlistName}" to ${ipodName}...\n`);
        
        // Trigger sync
        await runAppleScript(`
            tell application "${appName}"
                tell source "${ipodName}"
                    update
                end tell
            end tell
        `);
        
        event.sender.send('download-progress', '✓ Sync started! Check iTunes/Music for progress.\n');
        return true;
    } catch (error) {
        event.sender.send('download-progress', `✗ Sync error: ${error.message}\n`);
        return false;
    }
}

// Enhanced download command with iPod mode
ipcMain.on('start-download', async (event, data) => {
    const { url, ipodMode, playlistName } = data;
    
    const basePath = getDownloadPath();
    if (!basePath) {
        event.sender.send('download-progress', 'Error: Could not read download path');
        event.sender.send('download-complete', false);
        return;
    }
    
    event.sender.send('download-progress', `Download path: ${basePath}\n`);
    
    if (ipodMode) {
        event.sender.send('download-progress', '🎵 iPod Companion Mode Enabled\n');
        event.sender.send('download-progress', `Playlist: ${playlistName || 'Spotify Playlist'}\n\n`);
    }
    
    // Get list of items before download
    let itemsBefore = [];
    try {
        itemsBefore = fs.readdirSync(basePath);
        event.sender.send('download-progress', `Items before: ${itemsBefore.length}\n`);
    } catch (error) {
        event.sender.send('download-progress', `Warning: Could not read directory before download\n`);
    }
    
    const itemsBeforeSet = new Set(itemsBefore);
    
    // Run sldl
    const sldl = spawn(sldlPath, [url]);
    
    sldl.stdout.on('data', (data) => {
        event.sender.send('download-progress', data.toString());
    });
    
    sldl.stderr.on('data', (data) => {
        event.sender.send('download-progress', data.toString());
    });
    
    sldl.on('close', async (code) => {
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
                    
                    // iPod Mode: Add to iTunes and sync
                    if (ipodMode && process.platform === 'darwin') {
                        try {
                            const finalPlaylistName = playlistName || playlistFolderName;
                            await addToiTunes(finalPlaylistName, playlistFolder, [], event);
                            await syncToiPod(finalPlaylistName, event);
                        } catch (error) {
                            event.sender.send('download-progress', `\n✗ iTunes/iPod error: ${error.message}\n`);
                        }
                    } else if (ipodMode && process.platform !== 'darwin') {
                        event.sender.send('download-progress', '\n⚠ iTunes integration only works on macOS\n');
                    }
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
