import re
import os
import requests
import yt_dlp
from typing import Dict, Any, Optional

def clean_title(title: Optional[str]) -> str:
    if not title:
        return "reelsave_video"
    clean = re.sub(r'[\\/*?:"<>|]', "", title)
    return clean[:80].strip() or "reelsave_video"

def extract_instagram_fallback(url: str) -> Optional[Dict[str, Any]]:
    """Fallback extractor using Instagram embed/captioned endpoint."""
    shortcode_match = re.search(r'/(?:reel|p|reels)/([A-Za-z0-9_-]+)', url)
    if not shortcode_match:
        return None
    
    shortcode = shortcode_match.group(1)
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
    }

    try:
        embed_url = f"https://www.instagram.com/p/{shortcode}/embed/captioned/"
        resp = requests.get(embed_url, headers=headers, timeout=8)
        if resp.status_code == 200:
            video_matches = re.findall(r'"video_url":"([^"]+)"', resp.text)
            if video_matches:
                v_url = video_matches[0].replace('\\u0026', '&').replace('\\/', '/')
                thumb_match = re.search(r'<img[^>]+class="EmbeddedMediaImage"[^>]+src="([^"]+)"', resp.text)
                thumb = thumb_match.group(1).replace('&amp;', '&') if thumb_match else ""
                
                return {
                    "id": shortcode,
                    "title": f"Instagram Reel - {shortcode}",
                    "source_url": url,
                    "platform": "instagram",
                    "thumbnail": thumb,
                    "duration": 0,
                    "author": "Instagram Creator",
                    "direct_url": v_url,
                    "video_url": v_url,
                    "audio_url": None,
                    "needs_merge": False,
                    "quality": "Full HD",
                    "method": "embed_fallback"
                }
    except Exception:
        pass

    return None

def extract_media_info(url: str, cookies_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Extracts the highest quality video and audio streams.
    Identifies separate video and audio DASH tracks so they can be merged with FFmpeg.
    """
    url = url.strip()
    if not url:
        raise ValueError("URL cannot be empty")

    ydl_opts: Dict[str, Any] = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'socket_timeout': 15,
        'extract_flat': False,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }

    cookie_file = cookies_path or os.path.join(os.path.dirname(__file__), "..", "cookies.txt")
    if os.path.exists(cookie_file) and os.path.getsize(cookie_file) > 0:
        ydl_opts['cookiefile'] = os.path.abspath(cookie_file)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                raise ValueError("Could not fetch media info")

            if 'entries' in info and info['entries']:
                info = info['entries'][0]

            raw_formats = info.get('formats') or []
            
            muxed_formats = []
            video_formats = []
            audio_formats = []

            for f in raw_formats:
                f_url = f.get('url')
                if not f_url:
                    continue
                vcodec = f.get('vcodec') or 'none'
                acodec = f.get('acodec') or 'none'

                is_video = (vcodec != 'none' and vcodec is not None)
                is_audio = (acodec != 'none' and acodec is not None)

                if is_video and is_audio:
                    muxed_formats.append(f)
                elif is_video and not is_audio:
                    video_formats.append(f)
                elif not is_video and is_audio:
                    audio_formats.append(f)

            muxed_formats.sort(key=lambda x: (x.get('height') or 0, x.get('tbr') or 0), reverse=True)
            video_formats.sort(key=lambda x: (x.get('height') or 0, x.get('tbr') or 0), reverse=True)
            audio_formats.sort(key=lambda x: (x.get('abr') or 0), reverse=True)

            best_video_url = None
            best_audio_url = None
            needs_merge = False
            max_height = 0

            preview_url = None

            # Check if video_formats has higher resolution than muxed_formats
            muxed_best = muxed_formats[0] if muxed_formats else None
            muxed_h = (muxed_best.get('height') or 0) if muxed_best else 0

            video_best = video_formats[0] if video_formats else None
            video_h = (video_best.get('height') or 0) if video_best else 0

            # If video-only format is higher resolution and separate audio track is available, merge them for max quality
            if video_best and audio_formats and video_h > muxed_h:
                best_video_url = video_best.get('url')
                best_audio_url = audio_formats[0].get('url')
                max_height = video_h
                needs_merge = True
                preview_url = muxed_best.get('url') if muxed_best else best_video_url
            elif muxed_best:
                # Progressive format with audio and video already combined
                best_video_url = muxed_best.get('url')
                best_audio_url = muxed_best.get('url')
                max_height = muxed_h
                needs_merge = False
                preview_url = best_video_url
            elif video_best:
                best_video_url = video_best.get('url')
                max_height = video_h
                if audio_formats:
                    best_audio_url = audio_formats[0].get('url')
                    needs_merge = True
                else:
                    best_audio_url = None
                    needs_merge = False
                preview_url = best_video_url
            else:
                best_video_url = info.get('url')
                max_height = info.get('height') or 1080
                best_audio_url = audio_formats[0].get('url') if audio_formats else best_video_url
                needs_merge = bool(audio_formats and audio_formats[0].get('url') != best_video_url)
                preview_url = best_video_url

            quality_str = "Full HD (1080p)" if max_height >= 1080 else ("HD (720p)" if max_height >= 720 else "Original High Quality")

            title = info.get('title') or "ReelSave Download"
            return {
                "id": str(info.get('id', '')),
                "title": clean_title(title),
                "source_url": url,
                "platform": info.get('extractor_key', 'unknown').lower(),
                "thumbnail": info.get('thumbnail'),
                "duration": info.get('duration') or 0,
                "author": info.get('uploader') or info.get('uploader_id') or info.get('channel') or "Creator",
                "direct_url": best_video_url,
                "preview_url": preview_url or best_video_url,
                "video_url": best_video_url,
                "audio_url": best_audio_url,
                "needs_merge": needs_merge,
                "quality": quality_str,
                "like_count": info.get('like_count'),
                "view_count": info.get('view_count'),
                "method": "yt_dlp"
            }

    except Exception as e:
        error_msg = str(e)
        if "instagram.com" in url.lower():
            fallback_res = extract_instagram_fallback(url)
            if fallback_res:
                return fallback_res

        if "login" in error_msg.lower() or "empty media response" in error_msg.lower():
            raise ValueError("This Reel might be from a private account or requires Instagram cookies. Try a public Reel or post.")
        elif "unsupported url" in error_msg.lower():
            raise ValueError("This URL is not recognized. Please provide a valid Instagram, TikTok, or YouTube link.")
        else:
            raise ValueError(f"Failed to extract media: {error_msg}")
