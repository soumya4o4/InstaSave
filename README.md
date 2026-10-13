# InstaSave — High-Speed Instagram Reels, Stories & Audio Downloader

An ultra-fast, modern web application to download Instagram Reels, Stories, Photos, and MP3 audio in 1080p Full HD with guaranteed sound.

## Features
- **Sound Guaranteed**: Merges video and audio DASH streams using universal AAC stereo audio.
- **MP3 Extractor**: 1-click 192kbps high quality audio extraction.
- **Stories & Highlights**: Save public stories and highlights anonymously.
- **Mobile Responsive**: Fully touch-friendly and fast responsive interface.
- **VIP Membership Pass**: Built-in UPI payment support with UTR verification.

## Tech Stack
- **Frontend**: HTML5, Vanilla CSS3 (Neon / Glassmorphism), JavaScript (ES Modules), Vite
- **Backend**: Python, FastAPI, Uvicorn, yt-dlp, FFmpeg

## Getting Started

### 1. Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
