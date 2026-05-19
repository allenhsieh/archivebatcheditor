# Archive.org Batch Metadata Editor

🎵 **A beginner-friendly web app for managing your Archive.org collection**

Easily edit metadata for hundreds of Archive.org items at once, with YouTube integration and real-time progress tracking.

<!-- TODO: Add demo screenshot here showing the main interface -->

## ✨ What This App Does

**Perfect for content creators who upload to Archive.org regularly!**

✅ **Load your entire collection** - See all your Archive.org items in one place  
✅ **Batch edit metadata** - Update 50+ items with just a few clicks  
✅ **YouTube auto-matching** - Automatically find matching YouTube videos  
✅ **Real-time progress** - Watch each item update live with green ✅ or red ❌  
✅ **Sequential processing** - Handles each item one by one for reliability  
✅ **Beginner-friendly** - No coding required, just point and click!  

**Use cases:**
- Concert recordings: Add band names, venues, dates consistently  
- Podcast collections: Standardize titles and descriptions  
- Video archives: Link to YouTube versions and extract metadata  
- Any large Archive.org collection that needs consistent formatting

## 🚀 Quick Start Guide

**New to web development? No problem!** Follow these simple steps:

### Step 1: Install Node.js
- Go to [nodejs.org](https://nodejs.org/) and download the **LTS version** (18+)
- Install it (just click through the installer)
- Test it worked: Open terminal and type `node --version`

### Step 2: Get Your API Keys
You need these to connect to Archive.org (and optionally YouTube):

**Required:** Archive.org credentials  
**Optional:** YouTube API (for auto-matching features)

## 🔑 Getting Your API Credentials

<!-- TODO: Add screenshot showing Archive.org credentials page -->

### 📁 Archive.org Credentials (Required)

**Super easy! Just 2 steps:**

1. **Go to:** [archive.org/account/s3.php](https://archive.org/account/s3.php)
2. **Log in** with your Archive.org account
3. **Copy these 3 things:**
   - ✅ **Access Key** (looks like: `ABC123XYZ456`)  
   - ✅ **Secret Key** (looks like: `abcdef1234567890`)  
   - ✅ **Email** (your Archive.org login email)

**That's it!** Keep these safe - you'll paste them in Step 4.

---

### 🎥 YouTube API (Optional - for auto-matching)

**Want YouTube integration?** Here's how to get a free API key:

<!-- TODO: Add screenshot of Google Cloud Console -->

**Step 2A: Create Google Cloud Project**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Create Project"** (top of page)  
3. Give it any name like "Archive YouTube Matcher"
4. Click **"Create"**

**Step 2B: Enable YouTube API**
1. Search for **"YouTube Data API v3"** in the search bar
2. Click on it, then click **"Enable"**
3. Wait 30 seconds for it to activate

**Step 2C: Get Your API Key**
1. Go to **"Credentials"** (left sidebar)
2. Click **"+ Create Credentials"** → **"API Key"**  
3. Copy the key (starts with `AIzaS...`)
4. **Optional:** Click "Restrict Key" for security

**Step 2D: Find Your YouTube Channel ID**
1. Go to your YouTube channel  
2. Copy your handle (like `@YourChannelName`)
3. Use [commentpicker.com/youtube-channel-id.php](https://commentpicker.com/youtube-channel-id.php)
4. Paste your handle, get your Channel ID (starts with `UC...`)

**Step 2E: OAuth 2.0 Credentials (only if you want to bulk-edit YouTube videos)**

The API key from Step 2C only allows **reading** YouTube data. To bulk-update recording dates or tags on your own videos, you also need an OAuth client:

1. In the same Google Cloud project, go to **"Credentials"** → **"+ Create Credentials"** → **"OAuth client ID"**
2. If prompted, configure the OAuth consent screen (choose **"External"**, add yourself as a test user)
3. Application type: **"Web application"**
4. Authorized redirect URI: `http://localhost:3001/auth/youtube/callback`
5. Copy the **Client ID** and **Client Secret** — you'll paste them into `.env` in Step 4

---

**💡 Pro Tip:** YouTube integration is completely optional! The app works great for metadata editing without it. The OAuth step (2E) is only needed if you plan to push updates back to YouTube.

## 💻 Step 3: Download & Install

### 3A. Download the Code
**Option 1: Download ZIP (Easiest)**
- Click the green **"Code"** button on this page
- Click **"Download ZIP"**
- Extract it to your Desktop or Documents folder

**Option 2: Use Git (if you know git)**
```bash
git clone <repository-url>
cd archivebatcheditor
```

### 3B. Install App Dependencies
1. **Open terminal** in your project folder
2. **Run this command:**
```bash
npm install
```
3. **Wait 2-3 minutes** while it downloads everything needed
4. **You should see:** "added XXX packages" when done ✅

---

## 🔧 Step 4: Add Your API Keys

**Create your secret configuration file:**

### 4A. Create .env File
1. **In your project folder**, create a new file called `.env` (exactly that name)
2. **Copy and paste this template:**

```bash
# 🔐 Archive.org credentials (REQUIRED - get from step 2)
ARCHIVE_ACCESS_KEY=paste_your_access_key_here
ARCHIVE_SECRET_KEY=paste_your_secret_key_here  
ARCHIVE_EMAIL=paste_your_email_here

# 🎥 YouTube integration (OPTIONAL - get from step 2)
YOUTUBE_API_KEY=paste_your_youtube_api_key_here
YOUTUBE_CHANNEL_ID=paste_your_channel_id_here

# 🔑 YouTube OAuth (ONLY if you did step 2E — required for bulk-editing YouTube videos)
YOUTUBE_CLIENT_ID=paste_your_oauth_client_id_here
YOUTUBE_CLIENT_SECRET=paste_your_oauth_client_secret_here
YOUTUBE_REDIRECT_URI=http://localhost:3001/auth/youtube/callback

# ⚙️ Server settings (leave these as-is)
PORT=3001
NODE_ENV=development
```

### 4B. Replace the Placeholders
- **Replace** `paste_your_access_key_here` with your real Archive.org access key
- **Replace** `paste_your_secret_key_here` with your real Archive.org secret key  
- **Replace** `paste_your_email_here` with your Archive.org email
- **If you got YouTube keys:** replace those placeholders too
- **If no YouTube:** just leave those lines as-is or delete them

### 4C. Save and Secure
✅ **Save the file**  
🔒 **Never share this file** - it contains your passwords!  
🚫 **Don't post it online** - the app automatically keeps it private

---

## 🚀 Step 5: Start the App

**You need TWO terminal windows:**

<!-- TODO: Add screenshot showing two terminals running -->

### Terminal 1: Start the Server
```bash
npm run server:dev
```
**You should see:**
- "Server running on port 3001" ✅
- "Server ready with quota-aware YouTube integration" ✅  
- "Archive.org credentials loaded successfully" ✅

### Terminal 2: Start the Website  
```bash
npm run dev
```
**You should see:**
- "Local: http://localhost:3000" ✅

---

## 🎉 Step 6: Open the App

**Go to:** [http://localhost:3000](http://localhost:3000)

**You should see the Archive.org Batch Editor interface!** 

<!-- TODO: Add screenshot of the main app interface -->

## 📖 How to Use the App

**Perfect for beginners! Just follow these simple steps:**

<!-- TODO: Add demo video or GIF showing the full workflow -->

---

### 🔄 Step 1: Load Your Archive.org Collection

1. **Click the big "Load My Items" button**  
2. **Wait 5-10 seconds** while it fetches your uploads  
3. **See all your Archive.org items** appear in the list ✅

<!-- TODO: Add screenshot showing the Load My Items button and resulting list -->

**What happens behind the scenes:**
- 🔄 **Fresh data:** Loads your items directly from Archive.org each time
- 🔐 **Secure:** Only shows YOUR items (filtered by your email automatically)  
- 📊 **Sequential:** Processes items one by one for reliability

---

### ✏️ Step 2: Basic Metadata Editing

**Want to update titles, descriptions, or other info? Here's how:**

1. **☑️ Check the boxes** next to items you want to edit
2. **➕ Click "Add Field"** and pick what to change (title, creator, description, etc.)
3. **✏️ Type your new value** in the text box
4. **🚀 Click "Update X Items"** button  
5. **👀 Watch the magic!** Each item updates with live progress:
   - 🔄 **Blue spinning** = currently updating
   - ✅ **Green checkmark** = success!  
   - ❌ **Red X** = error (shows why)

<!-- TODO: Add screenshot showing the metadata editing interface -->

**Pro Tips:**
- ⚡ **Batch power:** Select 50+ items and update them all at once!
- 🎯 **Replace mode:** Your new value completely replaces the old one
- 📝 **Test first:** Try with 1-2 items before doing large batches

---

### 🎥 Step 3: YouTube Auto-Matching (Optional)

**Have YouTube videos of the same content? Auto-match them!**

**How it works:**
1. **☑️ Select Archive.org items** you want to match
2. **🔍 Click "Get YouTube Match"** button  
3. **⏳ Wait while it searches** YouTube for matching videos
4. **👁️ Review suggestions** - it extracts band names, venues, dates automatically!
5. **Choose what to apply:**
   - 🔗 **"Add YouTube Links"** = Just adds the YouTube URL  
   - ✅ **"Apply All Selected Fields"** = Adds URL + extracted metadata

<!-- TODO: Add screenshot showing YouTube matching interface with suggestions -->

**What gets extracted:**
- 🎸 **Band/Artist name** from video titles  
- 🏛️ **Venue name** (like "The Fillmore")  
- 📅 **Date** from video descriptions  
- 🔗 **YouTube URL** for cross-referencing

---

### 🎬 Step 4: Bulk-Edit YouTube Videos (Optional)

**Push recording dates and tags back to your own YouTube videos** — pairing with Archive.org items that already have YouTube URLs.

**One-time setup: Authorize the app**

1. Make sure you completed **Step 2E** (OAuth credentials) and filled out `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` / `YOUTUBE_REDIRECT_URI` in `.env`
2. Start the app (both `npm run server:dev` and `npm run dev`)
3. Open [http://localhost:3001/auth/youtube](http://localhost:3001/auth/youtube) in your browser
4. Sign in with the Google account that owns the YouTube channel, click **Allow**
5. You should see "YouTube OAuth Successful! Tokens saved." — a file called `.youtube-tokens.json` is now saved locally (gitignored)

You only need to do this once. If you later see "YouTube not authenticated", revoke at [myaccount.google.com/permissions](https://myaccount.google.com/permissions) and repeat.

**📅 Bulk-update recording dates**

Use the **🎵 YouTube Recording Date Editor** section:
1. Select Archive.org items (they must already have a `youtube` metadata field)
2. Pick a date, or click **🔍 Auto-Detect Date** to infer from titles/metadata
3. Click **Update Recording Dates for N Items** — progress streams live

This writes to `recordingDetails.recordingDate` on each video. (The "location" half of YouTube Studio's "Recording date and location" is not writable via the public API — deprecated since 2017 — so the app doesn't touch it.)

**🏷️ Bulk-sync tags from Archive.org subjects**

Use the **🏷️ YouTube Tags Sync** section:
1. Select items
2. Optionally check **Include Archive.org `venue` as a tag**
3. Optionally add extra tags (comma-separated)
4. Click **Sync Tags for N Items**

The app pulls each item's `subject` field, optionally adds `venue`, **merges with the video's existing tags** (case-insensitive dedupe), and trims to YouTube's 500-character limit.

**⚠️ Quota notes**

- Each recording-date update costs ~50 YouTube API quota units; each tag update costs ~51 (list + update)
- The default daily quota is 10,000 units → about **200 writes/day**
- Each batch is capped at 100 items to stay well under the limit
- If quota exhausts mid-run, you'll see errors in the log — retry tomorrow

---

### ⚡ Pro Features

**🔄 Sequential Processing**
- **One at a time:** Processes items sequentially for reliability
- **Fail-fast:** Stops on first error to preserve API quota
- **Fresh data:** Always fetches latest information from APIs
- **Status:** See real-time processing updates in the server terminal

**📊 Real-Time Progress**
- **Live updates:** Watch each item process in real-time
- **Error handling:** See exactly which items failed and why
- **Streaming:** Progress updates even if you have 100+ items
- **Quota-aware:** Stops immediately on YouTube API quota exhaustion to preserve usage

**🔒 Security & Privacy**  
- **Local only:** Runs on your computer, not in the cloud
- **API keys:** Stored securely in .env file  
- **No tracking:** Your data stays with you

**✨ Code Quality & Reliability**
- **TypeScript:** Full type safety prevents runtime errors
- **Comprehensive testing:** 127 tests ensure reliability
- **Robust error handling:** Graceful failure with detailed logging
- **API documentation:** Self-documenting endpoints with examples

## 🚨 Help! Something's Not Working

**Don't panic! Here are the most common fixes:**

---

### 😵 "No Items Loading" or Empty List

**Most common fixes:**
1. **Check your .env file:**
   - Is your Archive.org email correct?
   - Did you paste the right access/secret keys?  
   - No extra spaces or quotes around your keys?

2. **Try refreshing:**
   - Click the **"🔄 Refresh"** button
   - Wait 10-15 seconds for fresh data

3. **Check the server terminal:**
   - Look for red error messages  
   - Common: "Invalid credentials" or "Access denied"

**Still not working?** Your Archive.org account might not have any public items, or your credentials expired.

---

### 🎥 "YouTube Match Not Found" or "Rate Limit"

**Don't worry - YouTube is optional!** Your main app still works perfectly.

**Common YouTube issues:**
- **Quota exhausted:** YouTube API has daily limits. The app automatically detects quota exhaustion and stops immediately to preserve remaining quota
- **No matches:** Not all Archive items have YouTube versions - totally normal!
- **Wrong Channel ID:** Double-check it starts with `UC` and matches your actual channel

**Quick fix:** Just use the app without YouTube matching - still super powerful!

---

### 💻 "Server Won't Start" or Terminal Errors

**Check these basics:**
1. **Node.js installed?** Type `node --version` - should show v18+
2. **Wrong folder?** Make sure you're in the project folder
3. **Ports busy?** Close other apps using ports 3000/3001
4. **Try reinstalling:** Run `npm install` again

**Mac users with SQLite errors:**
```bash
xcode-select --install
```

**Still stuck?** Delete the whole folder, re-download, and start over - sometimes that's fastest!

---

### 🔄 "Items Stuck Processing" or Updates Not Showing

**Quick fixes:**
1. **Refresh the webpage** (F5 or Cmd+R)
2. **Check your internet** - updates stream live
3. **Look at server terminal** - shows detailed progress even if UI breaks
4. **Wait it out** - large batches can take 5-10 minutes

---

### 🗄️ "Database or Server Errors"

**Nuclear option (fixes most issues):**
1. **Close both terminals** (Ctrl+C)
2. **Clear any temporary files:** Delete any old cache files if they exist
3. **Restart everything:** `npm run server:dev` and `npm run dev`
4. **Server starts fresh** ✅

---

### 🆘 Still Need Help?

**Before asking for help, gather this info:**
- What error message do you see exactly?
- What step were you on when it broke?
- Are both terminals still running?
- What does your `.env` file look like? (**Don't share the actual keys!**)

**Where to get help:**
- Open a GitHub Issue with your error details
- Check if others had the same problem in existing Issues

---

## 🔐 Important Security Reminders

**Keep your API keys safe:**
- 🚫 **Never share your `.env` file** - treat it like your password
- 🚫 **Don't post screenshots** of your `.env` file  
- 🚫 **Don't commit it to git** - the app automatically ignores it
- ✅ **Test with 1-2 items first** before doing big batches

**The app is secure by design:**
- 🏠 **Runs locally** - your keys never leave your computer  
- 🎯 **Surgical updates** - only changes the metadata you specify
- 👁️ **Transparent** - you see exactly what changes before applying

---

## 🛠️ For Developers (Optional Reading)

**Want to understand how it works or contribute? Here's the technical details:**

### 📁 Project Structure
```
archivebatcheditor/
├── 🖥️ src/             # Frontend React app (what you see in browser)
├── ⚙️ server/          # Backend Express server (handles API calls)  
├── 🔐 .env            # Your secret keys (never commit this!)
├── 📦 package.json    # List of dependencies and scripts
└── 📖 README.md      # This guide
```

### 🏗️ Tech Stack Used
- **Frontend:** React 18 + TypeScript + Vite (modern web framework)
- **Backend:** Node.js + Express + TypeScript (server technology)
- **Real-time:** Server-Sent Events (live progress updates)
- **APIs:** Archive.org + YouTube Data API v3

### 🔧 Development Commands
```bash
npm run dev          # Start the website (port 3000)
npm run server:dev   # Start the API server (port 3001)  
npm run build        # Build for production hosting
npm run preview      # Test the production build
npm test            # Run the comprehensive test suite (127 tests)
npm run type-check  # Verify TypeScript compilation
```

### 🧪 **Testing & Quality Assurance**
This project includes a comprehensive test suite ensuring reliability:

- **📊 127 passing tests** across 7 test suites (100% pass rate)
- **🔧 Integration tests** for all API endpoints
- **🔐 Authentication regression tests** to prevent auth bugs  
- **🌐 End-to-end testing** with real server interactions
- **⚡ TypeScript compilation** with zero errors

**Run tests before contributing:**
```bash
npm test                    # Full test suite
npm test -- --watch        # Watch mode for development  
npm run type-check         # TypeScript validation
```

---

## 🤝 Contributing & Support

**Found a bug or want a new feature?**
- 🐛 **Report bugs:** [Open a GitHub Issue](../../issues)
- 💡 **Request features:** [Open a GitHub Issue](../../issues) with "Feature Request"
- 🔧 **Submit fixes:** [Open a Pull Request](../../pulls)

**Before contributing:**
- ✅ **Run tests:** `npm test` to ensure all 127 tests pass
- ✅ **Check types:** `npm run type-check` for TypeScript validation
- ✅ **Test with real data:** Test your changes with real Archive.org items
- 🚫 **Don't include:** Your `.env` file in commits
- 📝 **Document:** Add comments explaining complex code
- 📖 **Update docs:** Update this README if you change how things work

---

## 📄 License

**MIT License** - This means:
- ✅ Use it for personal projects  
- ✅ Use it for commercial projects
- ✅ Modify it however you want
- ✅ Share your improvements back (but not required)

---

## 🎉 Final Notes

**Congratulations on setting up your Archive.org Batch Editor!** 

This tool can save you **hours** of manual work when managing large media collections. Whether you're organizing concert recordings, podcasts, or any other Archive.org uploads, you now have the power to update hundreds of items with just a few clicks.

**Remember:**
- 🧪 **Start small** - test with a few items first
- 🔄 **Sequential processing** - items are handled one by one for reliability
- 📝 **Backup important data** before large changes
- 🆘 **Ask for help** if you get stuck - we're here to help!

**Happy archiving!** 🎵📚🎬

---

*Last updated: September 2024* 