const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 700,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        backgroundColor: '#667eea',
        titleBarStyle: 'default',
        title: 'SLDL Downloader'
    });

    mainWindow.loadFile('index.html');
    
    // Uncomment next line for debugging
    // mainWindow.webContents.openDevTools();
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

// Handle download command
ipcMain.on('start-download', (event, url) => {
    const sldl = spawn('sldl', [url]);
    
    sldl.stdout.on('data', (data) => {
        event.sender.send('download-progress', data.toString());
    });
    
    sldl.stderr.on('data', (data) => {
        event.sender.send('download-progress', data.toString());
    });
    
    sldl.on('close', (code) => {
        event.sender.send('download-complete', code === 0);
    });
    
    sldl.on('error', (error) => {
        event.sender.send('download-progress', `Error: ${error.message}`);
        event.sender.send('download-complete', false);
    });
});
