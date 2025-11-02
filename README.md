# FocusFlow - YouTube Learning Extension

A Chrome browser extension designed to help you make your learning path pure and efficient on YouTube by filtering distractions and providing Prerequisite Knowledge insights.

## 💡 Inspiration
Imagine encountering a question while studying, opening a video only to realise halfway through that you need additional knowledge to comprehend it. 
By then, you've already wasted time opening the video, watching advertisements, and struggling to grasp the first half. 
FocusFlow was born to address this – its name derived from ‘flow state’ – helping everyone concentrate on their learning objectives while minimising wasted or distracted time.

## 🎯 Features

### Core Functionality
- **Smart Video Filtering**: Automatically blurs Ads and Shorts videos on YouTube
- **Prerequisite Analysis**: AI-powered analysis of video content to identify required knowledge before watching
- **Video Summaries**: Generate comprehensive summaries of video content
- **Interactive Q&A**: Ask questions about video content and get AI-generated answers

### User Experience
- Minimal, non-intrusive interface
- Real-time progress indicators
- Persistent storage across sessions
- Smooth animations and transitions

## 📋 Prerequisites

- Google Chrome browser 
- Python 3.7 or higher
- Rotating Residential Proxies API Links

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/FocusFlow.git
cd FocusFlow
```

### 2. Set Up the Python Transcript Server

#### Install Python Dependencies

```bash
pip install flask flask-cors youtube-transcript-api requests
```

#### Configure Proxy (Important!)

Open `transcript_server.py` and add your API link:

```python
# [Important] Paste your Webshare API link here
PROXY_API_URL = 'YOUR_WEBSHARE_API_LINK_HERE'
```

**Note**: This is required for reliable transcript fetching. Because YouTube blocks requests for subtitles from the same IP address multiple times. 
I recommand Rotating Residential Proxies. You can obtain a proxy list from [Webshare.io](https://www.webshare.io/residential-proxy).

#### Start the Server

```bash
python transcript_server.py
```

The server will run on `http://127.0.0.1:5000`

### 3. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top right)
3. Click "Load unpacked"
4. Select the `FocusFlow` directory
5. The extension should now appear in your browser toolbar

## 📁 Project Structure

```
FocusFlow/
├── manifest.json           # Extension configuration
├── popup.html             # Extension popup interface
├── popup.js               # Popup logic
├── popup.css              # Popup styling
├── service-worker.js      # Background service worker with AI features
├── content-script.js      # YouTube page content injection
├── content-style.css      # Content styling
├── transcript_server.py   # Python server for transcript fetching
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## 🎮 Usage

### Getting Started

1. **Click the extension icon** in your Chrome toolbar
2. **Enter your learning goal** (e.g., "I want to learn Python programming" or "javascript beginner")
3. **Click "Start"**
4. **Select keywords** from AI-generated suggestions
5. **Click "Confirm"** to search YouTube

### On YouTube

- **Blurred Thumbnails**: Ads and Shorts are automatically covered
- **Prerequisite Cards**: Over video thumbnails, you can see required knowledge
- **Question Icon** (?): Click to:
  - View AI-generated video summary
  - Ask specific questions about the video content
  - Upon clicking,you may swipe down to view additional videos whilst the summary of the preceding video loads.

### Features in Detail

#### Prerequisite Knowledge
- Automatically analyzes the first few minutes of video transcripts
- Shows required and helpful background knowledge
- Helps you decide if you're ready to watch

#### Video Summaries
- Watch real-time progress as the summary generates
- Click the "?" icon next to any video
- Hierarchical format shows main topics and subtopics
- Estimated processing time displayed

#### Interactive Q&A
- Ask questions like "Can I learn how to use print in this video?"
- AI analyzes the transcript and provides specific answers
- Input field is disabled during summary generation

## 🔧 Configuration

### Manifest Permissions

The extension requires:
- `storage`: Save user preferences
- `tabs`: Open new YouTube tabs
- `scripting`: Inject content scripts

### Host Permissions
- `*://*.youtube.com/*`: Access YouTube pages

## 🛠️ Development

### Modify AI Prompts

Edit `service-worker.js` to customize AI behavior:

```javascript
// Prerequisite knowledge extraction
const prereqSession = await LanguageModel.create({
    initialPrompts: [{
        role: "system",
        content: "Your custom system prompt here..."
    }]
});
```

### Adjust Styling

Edit `content-style.css` to change the appearance of:
- Blur effects
- Prerequisite cards
- Question popups
- Summary displays

### API Configuration

The transcript server can be configured in `transcript_server.py`:

```python
app.run(
    host='127.0.0.1',  # Change to '0.0.0.0' for network access
    port=5000,         # Change port if needed
    debug=True
)
```

## 🔒 Privacy & Security

- All AI processing happens locally using Chrome's built-in AI
- Transcript fetching goes through your configured proxy
- No user data is sent to third-party servers
- Video viewing history is not tracked

## 🐛 Troubleshooting

### Transcript Server Issues

**Problem**: "Python server not running" error

**Solution**:
1. Ensure the Python server is running (`python transcript_server.py`)
2. Check the server is accessible at `http://127.0.0.1:5000`
3. Verify your proxy configuration in `transcript_server.py`

### AI Features Not Working

**Problem**: Prerequisite or summary not generating

**Solution**:
1. Check browser console for errors (F12)
2. Ensure Chrome's built-in AI is available
3. Try refreshing the YouTube page

### Content Not Blurring

**Problem**: Ads or Shorts still visible

**Solution**:
1. Refresh the page after loading the extension
2. Check `content-script.js` is loaded (in DevTools → Sources)
3. Clear browser cache and reload

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## ⚠️ Important Notes

1. **Proxy Configuration**: The transcript server requires a valid proxy list
2. **Chrome AI**: This extension uses Chrome's experimental built-in AI features
3. **Python Server**: Must be running for transcript fetching to work

## 📧 Contact
For questions or support, please open an issue on GitHub.

Email: nongrunzhi@gmail.com
