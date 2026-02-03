# iPod Companion Mode - Complete Workflow Guide

This guide walks you through using the iPod Companion Mode to automatically download Spotify playlists and sync them to your iPod.

## 🎯 What This Solves

**Before:** Manual workflow requiring ~15+ steps
1. Find Spotify playlist
2. Download songs via SLDL
3. Wait for downloads
4. Find downloaded files
5. Create folder structure
6. Move files to correct locations
7. Open iTunes
8. Add songs to library
9. Create new playlist
10. Add songs to playlist in correct order
11. Connect iPod
12. Sync playlist
13. Wait for sync
14. Eject iPod

**After:** Automated workflow with 3 steps
1. Paste Spotify URL
2. Enable iPod Mode
3. Click Start Download ✨

## 📖 Step-by-Step Guide

### Prerequisites

Before you start, make sure you have:

- [x] SLDL Downloader installed
- [x] SLDL command-line tool installed
- [x] Soulseek account configured in settings
- [x] macOS computer (required for iTunes integration)
- [x] iTunes or Music app installed
- [x] iPod connected via USB cable

### First-Time Setup

#### 1. Configure SLDL Downloader

1. Open the app
2. Go to **Settings** tab
3. Enter your Soulseek credentials:
   - Username
   - Password
4. Choose a download folder (e.g., `~/Music/Downloads`)
5. Select audio format:
   - **FLAC** for best quality (recommended for iPod Classic)
   - **M4A** for better compatibility
6. Click **Save Settings**

#### 2. Grant Automation Permissions (macOS)

The first time you use iPod mode, macOS will ask for permissions:

1. When prompted, click **OK** to allow automation
2. If you miss the prompt, go to:
   - System Preferences → Security & Privacy → Privacy
   - Click **Automation** in the sidebar
   - Find **SLDL Downloader**
   - Check the box next to **Music** or **iTunes**

#### 3. Prepare Your iPod

1. Connect your iPod via USB
2. Open iTunes/Music
3. Wait for your iPod to appear in the sidebar
4. Make sure it's set to sync (not in disk mode)

### Using iPod Companion Mode

#### Standard Workflow

1. **Find Your Playlist**
   - Open Spotify on web or app
   - Navigate to the playlist you want
   - Click the share button (•••)
   - Select "Copy Playlist Link"

2. **Start Download**
   - Return to SLDL Downloader
   - Go to **Download** tab
   - Paste the Spotify URL into the text field
   - Check ☑️ **Enable iPod Companion Mode**
   - (Optional) Enter a custom playlist name
     - Leave blank to use the Spotify playlist name
   - Click **Start Download**

3. **Monitor Progress**
   - Watch the progress bar
   - Click "Show details" to see:
     - Individual track downloads
     - File organization
     - iTunes integration
     - Sync status
   
4. **Wait for Completion**
   The app will automatically:
   - ✓ Download all tracks from Spotify
   - ✓ Organize them into a playlist folder
   - ✓ Add tracks to iTunes/Music library
   - ✓ Create the playlist in iTunes/Music
   - ✓ Sync playlist to your iPod

5. **Check iTunes/Music**
   - Open iTunes/Music during or after download
   - You'll see your new playlist
   - Watch the sync progress in the top bar
   - Wait for "Sync Complete" message

6. **Eject and Enjoy**
   - Once sync is complete, safely eject your iPod
   - Disconnect and enjoy your music! 🎵

### Advanced Usage

#### Custom Playlist Names

You can override the Spotify playlist name:

1. Enable iPod Companion Mode
2. Enter your desired name in "Playlist Name" field
3. This name will be used in:
   - The download folder
   - iTunes/Music playlist
   - Your iPod

Example: "Summer 2024" instead of "My Summer Vibes Playlist 🌞"

#### Multiple Playlists

To download multiple playlists:

1. Download first playlist with iPod mode enabled
2. Wait for it to complete and sync
3. Download next playlist
4. Repeat as needed

Each playlist will:
- Have its own folder
- Have its own iTunes/Music playlist
- Sync to your iPod separately

#### Updating Existing Playlists

If you want to refresh a playlist:

1. The app will automatically:
   - Delete the old playlist in iTunes/Music
   - Create a new one with updated tracks
   - Sync the new version to your iPod

2. Old downloaded files remain in your download folder

### Tips & Tricks

#### 🎵 Audio Format Selection

**For iPod Classic (80GB, 160GB):**
- Use **FLAC** if you have space (best quality)
- Use **M4A** for balance of quality and space

**For iPod Nano/Shuffle:**
- Use **M4A** or **MP3** (more compatible)
- Avoid FLAC (may not be supported)

#### 📁 Folder Organization

Your downloads will be organized like this:

```
~/Music/Downloads/
  ├── Summer Vibes 2024/
  │   ├── Artist - Song 1.flac
  │   ├── Artist - Song 2.flac
  │   └── Artist - Song 3.flac
  ├── Workout Mix/
  │   ├── Artist - Song 1.flac
  │   └── Artist - Song 2.flac
  └── ...
```

#### ⚡ Speed Up Downloads

1. Use multiple Soulseek accounts (rotate credentials)
2. Download during peak hours (more users online)
3. Choose MP3/M4A instead of FLAC (smaller files)

#### 🔄 Handling Duplicates

If songs are already in iTunes:
- The app will add them again
- iTunes may show duplicates
- Manually remove duplicates in iTunes if needed

To avoid:
- Use iTunes smart playlists
- Or manually clean up library occasionally

### Troubleshooting

#### iPod Not Detected

**Problem:** "No iPod detected" message

**Solutions:**
1. Check USB cable connection
2. Try different USB port
3. Restart iTunes/Music
4. Check iPod appears in Finder
5. Disconnect and reconnect iPod
6. Update iTunes/Music to latest version

#### Tracks Not Adding to iTunes

**Problem:** Download completes but tracks don't appear in iTunes

**Solutions:**
1. Check iTunes/Music is running
2. Grant automation permissions (see setup above)
3. Try quitting and reopening iTunes/Music
4. Manually add one file to test permissions
5. Check the downloaded files aren't corrupted

#### Sync Takes Forever

**Problem:** Sync progress bar stuck

**Solutions:**
1. Check iPod has enough storage space
2. Disconnect other USB devices
3. Close other apps to free up system resources
4. Wait patiently (large FLAC files take time)
5. Check iTunes for any error messages

#### Wrong Track Order

**Problem:** Tracks appear in wrong order on iPod

**Solutions:**
1. In iTunes, check the playlist sort order
2. Make sure "Track Number" metadata is correct
3. Try re-syncing the playlist
4. Manually reorder in iTunes then sync again

### FAQ

**Q: Can I use this with Apple Music subscription?**  
A: Yes, but the app uses iTunes/Music as a separate library. Downloaded tracks won't appear in Apple Music cloud.

**Q: Does this work with iPhone?**  
A: No, this is specifically for iPod. iPhones use different sync methods.

**Q: Can I download private playlists?**  
A: No, only public Spotify playlists are supported.

**Q: Will this work on Windows?**  
A: Downloads work on Windows, but iPod Companion Mode (iTunes integration) requires macOS.

**Q: How much storage do I need?**  
A: Plan for:
- FLAC: ~30-50MB per song
- M4A/MP3: ~5-10MB per song
- 100 song playlist: 3-5GB (FLAC) or 500MB-1GB (MP3)

**Q: Can I cancel during download?**  
A: Yes, but:
- Partial downloads remain in folder
- iTunes playlist may not be created
- No sync will occur
- Manually clean up if needed

**Q: Does this drain iPod battery?**  
A: No more than normal iTunes syncing. Keep iPod plugged in during sync.

---

## 🎉 Success Stories

Share your success with:
- How many playlists you've synced
- Your favorite features
- Time saved compared to manual process

Happy listening! 🎵
