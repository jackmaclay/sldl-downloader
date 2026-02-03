# SLDL Downloader with iPod Companion Mode

A beautiful desktop app for downloading Spotify playlists via Soulseek (SLDL) with automatic iPod sync capabilities.

## ✨ Features

- **Download Spotify Playlists**: Download any public Spotify playlist via Soulseek
- **iPod Companion Mode**: Automatically organize, add to iTunes/Music, and sync to your iPod
- **Smart Organization**: Automatically organizes downloaded music into playlist folders
- **iTunes Integration**: Creates playlists in iTunes/Music matching your Spotify playlist order
- **Automatic Sync**: One-click sync to your connected iPod
- **Dark/Light Theme**: Beautiful interface with theme switching
- **Progress Tracking**: Real-time download progress with detailed logging

## 🚀 iPod Companion Mode

The iPod Companion Mode automates the entire workflow:

1. **Download** - Downloads all tracks from your Spotify playlist
2. **Organize** - Creates a dedicated folder and moves all files into it
3. **iTunes** - Automatically adds all tracks to iTunes/Music
4. **Playlist** - Creates a playlist matching your Spotify playlist order
5. **Sync** - Syncs the playlist to your connected iPod

### How It Works

When you enable iPod Companion Mode:

1. Enter your Spotify playlist URL
2. (Optional) Give your playlist a custom name
3. Check "Enable iPod Companion Mode"
4. Click "Start Download"
5. Connect your iPod when prompted
6. Sit back and relax! ☕

The app will:
- Download all tracks via Soulseek
- Create a dedicated folder for your playlist
- Add every track to iTunes/Music
- Create a playlist in iTunes/Music
- Sync the playlist to your iPod automatically

## 📋 Requirements

### For Basic Downloads
- macOS, Windows, or Linux
- [SLDL](https://github.com/fiso64/slsk-batchdl) installed and in PATH (or in resources folder)
- Soulseek account

### For iPod Companion Mode
- **macOS only** (uses AppleScript for iTunes/Music integration)
- iTunes or Music app
- iPod connected via USB

## 🛠️ Installation

### Option 1: Download Release (Easiest)
1. Download the latest `.dmg` from [Releases](releases)
2. Open the DMG and drag to Applications
3. Run SLDL Downloader

### Option 2: Build from Source

```bash
# Clone the repository
git clone <your-repo>
cd sldl-downloader

# Install dependencies
npm install

# For development
npm start

# Build for macOS
npm run build
```

## 📖 Setup

### First Time Setup

1. **Open Settings Tab**
   - Enter your Soulseek username and password
   - Select a download folder
   - Choose your preferred audio format (FLAC recommended for iPod)
   - Click "Save Settings"

2. **Install SLDL**
   - Download from: https://github.com/fiso64/slsk-batchdl
   - Install following their instructions
   - Make sure `sldl` is in your PATH or place in the app's resources folder

### For iPod Mode (macOS only)

1. **Open iTunes/Music**
   - Make sure the app is installed and working

2. **Connect Your iPod**
   - Connect via USB
   - Make sure it appears in iTunes/Music

3. **Grant Permissions**
   - The first time you run iPod mode, macOS may ask for automation permissions
   - Go to System Preferences → Security & Privacy → Privacy → Automation
   - Allow SLDL Downloader to control Music/iTunes

## 🎵 Usage

### Standard Download Mode

1. Copy a Spotify playlist URL
2. Paste into the "Spotify Playlist URL" field
3. Click "Start Download"
4. Wait for completion
5. Find your music in the download folder you configured

### iPod Companion Mode

1. Copy a Spotify playlist URL
2. Paste into the "Spotify Playlist URL" field
3. Check "Enable iPod Companion Mode"
4. (Optional) Enter a custom playlist name
5. Make sure your iPod is connected
6. Click "Start Download"
7. The app will:
   - Download all tracks
   - Add them to iTunes/Music
   - Create the playlist
   - Sync to your iPod
8. Check iTunes/Music to see sync progress

## 🔧 Configuration

### Config File Location
- macOS: `~/.config/sldl/sldl.conf`
- Linux: `~/.config/sldl/sldl.conf`
- Windows: `%USERPROFILE%\.config\sldl\sldl.conf`

### Audio Format Options
- **FLAC**: Lossless, best quality, largest files (recommended for iPod Classic)
- **MP3**: Lossy, good quality, smaller files
- **M4A/AAC**: Lossy, good quality, Apple-optimized
- **Opus**: Lossy, excellent quality, very small files
- **OGG**: Lossy, good quality, open source

## 🎨 Features Explained

### Automatic File Organization
Downloaded tracks are automatically organized into playlist-specific folders, with loose files moved into the appropriate directory.

### iTunes Integration (macOS only)
- Automatically adds tracks to your iTunes/Music library
- Creates playlists with the exact same name and order as Spotify
- Removes old playlists before creating new ones (no duplicates)
- Handles errors gracefully if tracks can't be added

### iPod Sync
- Detects connected iPods automatically
- Syncs newly created playlists
- Shows sync status in iTunes/Music
- Works with all iPod models supported by iTunes/Music

### Progress Tracking
- Real-time download progress
- Track-by-track status updates
- Detailed logging (expandable)
- Success animations

## 🐛 Troubleshooting

### "No iPod detected"
- Make sure your iPod is connected via USB
- Check that it appears in iTunes/Music
- Try disconnecting and reconnecting
- Restart iTunes/Music if needed

### "iTunes integration error"
- Grant automation permissions in System Preferences
- Make sure iTunes/Music is running
- Try quitting and reopening iTunes/Music

### "SLDL not found"
- Make sure SLDL is installed
- Check that `sldl` is in your PATH
- Or place the `sldl` binary in: `resources/sldl/` (for development) or next to the app

### Downloads failing
- Check your Soulseek credentials
- Make sure you have an active internet connection
- Verify the Spotify URL is correct and public
- Check download folder permissions

### Tracks not appearing in iTunes
- Check that iTunes/Music can play the file format
- Try converting FLAC files to M4A if needed
- Verify files aren't corrupted

## 🔐 Privacy & Security

- Your Soulseek credentials are stored locally only
- No data is sent to external servers (except Soulseek network)
- iTunes/Music integration uses local AppleScript only
- All operations happen on your computer

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Credits

- [SLDL](https://github.com/fiso64/slsk-batchdl) for the Spotify/Soulseek downloading
- Electron for the cross-platform framework
- All the amazing artists on Soulseek

## ⚠️ Disclaimer

This tool is for educational purposes and personal use only. Please support artists by purchasing their music legally. Respect copyright laws in your jurisdiction.

---

Made with ❤️ for music lovers and iPod enthusiasts
