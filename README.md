# Archive.org Batch Metadata Editor

A modern web application for batch editing metadata on Archive.org items with YouTube integration.

## What This Does

This tool allows you to:
- **Load all your Archive.org items** at once (with smart caching)
- **Batch edit metadata** for multiple items simultaneously 
- **Auto-match with YouTube videos** to extract band names, venues, and dates
- **Update Archive.org records** with consistent, clean metadata

Perfect for managing large collections of concert recordings, podcasts, or other media archives.

## Prerequisites

You'll need:
1. **Node.js** (version 18 or higher) - Download from [nodejs.org](https://nodejs.org/)
2. **Archive.org account** with API credentials
3. **YouTube Data API key** (optional, for YouTube integration)

## Getting Your API Credentials

### Archive.org API Credentials

1. Go to [archive.org/account/s3.php](https://archive.org/account/s3.php)
2. Log in to your Archive.org account
3. You'll see your credentials:
   - **Access Key** (example format: starts with letters and numbers)
   - **Secret Key** (example format: alphanumeric string)
4. Your **email** is the email address associated with your Archive.org account

### YouTube Data API Key (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the **YouTube Data API v3**
4. Create credentials → **API Key**
5. Copy the API key (example format: starts with `AIza` followed by characters)

### Finding Your YouTube Channel ID

1. Go to your YouTube channel
2. Copy the part after `@` in your URL (e.g., `@DJPandaExpress`)
3. Use a tool like [commentpicker.com/youtube-channel-id.php](https://commentpicker.com/youtube-channel-id.php) to convert it to a channel ID
4. Channel ID (example format: starts with `UC` followed by characters)

## Installation & Setup

### 1. Download the Code
```bash
git clone <repository-url>
cd archivebatcheditor
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Your Credentials

Create a file called `.env` in the main folder and add your credentials:

```
# Archive.org credentials (REQUIRED)
ARCHIVE_ACCESS_KEY=your_access_key_here
ARCHIVE_SECRET_KEY=your_secret_key_here
ARCHIVE_EMAIL=your_email@example.com

# YouTube integration (OPTIONAL)
YOUTUBE_API_KEY=your_youtube_api_key_here
YOUTUBE_CHANNEL_ID=your_channel_id_here

# Server configuration
PORT=3001
NODE_ENV=development
```

**⚠️ Important:** 
- Replace the placeholder values with your actual credentials
- Never share this `.env` file or commit it to version control
- The `.env` file is already ignored by git for security

### 4. Start the Application

Run both the server and web interface:

```bash
# Terminal 1 - Start the backend server
npm run server:dev

# Terminal 2 - Start the web interface  
npm run dev
```

### 5. Open in Browser

Go to: **http://localhost:3000**

## How to Use

### Loading Your Items

1. Click **"Load My Items"** to fetch all your Archive.org uploads
2. The first load takes a few seconds, then it's cached for 30 minutes
3. Use **"🔄 Refresh"** to force reload fresh data from Archive.org

### Editing Metadata

1. **Select items** by checking the boxes next to items you want to edit
2. **Add metadata fields** using the dropdown (title, creator, venue, date, etc.)
3. **Enter values** that will replace existing metadata
4. **Click "Update X Items"** to save changes to Archive.org

### YouTube Integration (Optional)

If you configured YouTube API credentials:

1. **Select Archive.org items** you want to match
2. **Click "Get YouTube Match"** for each item
3. **Review suggestions** showing extracted band, venue, date info
4. **Click "Apply to Metadata"** to add YouTube data to your form
5. **Click "Update X Items"** to save the changes

## Troubleshooting

### "No items loading"
- Check your Archive.org credentials in `.env`
- Make sure your email matches your Archive.org account
- Try clicking the "🔄 Refresh" button

### "YouTube match not found"  
- YouTube integration is optional - your main functionality still works
- Check your YouTube API key and channel ID in `.env`
- Some items may not have matching YouTube videos

### "Server not starting"
- Make sure Node.js is installed: `node --version`
- Check that ports 3000 and 3001 aren't being used by other apps
- Try `npm install` again to reinstall dependencies

### "Permission errors during npm install"
- Try: `npm install --cache /tmp/npm-cache`
- Or run with `sudo` on Mac/Linux: `sudo npm install`

## Security Notes

- **Never commit your `.env` file** - it contains your API credentials
- **Don't share your API keys** - treat them like passwords
- **Test on a few items first** before doing large batch updates
- The app only updates metadata you explicitly choose to change

## Development

### Project Structure
```
├── src/                 # Frontend React application
├── server/             # Backend Express server  
├── .env               # Your credentials (DO NOT COMMIT)
├── package.json       # Dependencies and scripts
└── README.md         # This file
```

### Available Scripts
- `npm run dev` - Start frontend development server
- `npm run server:dev` - Start backend development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Tech Stack
- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Node.js + Express + TypeScript
- **APIs:** Archive.org Search/Metadata APIs + YouTube Data API v3

## Contributing

Feel free to submit issues or pull requests to improve the tool!

## License

MIT License - feel free to use and modify for your needs.