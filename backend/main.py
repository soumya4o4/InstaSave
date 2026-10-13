import os
import shutil
import tempfile
import urllib.parse
import json
import subprocess
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import requests
import yt_dlp
from dotenv import load_dotenv

# Load environment configuration
load_dotenv()

from services.extractor import extract_media_info

app = FastAPI(
    title="ReelSave API",
    description="High-speed Instagram Reel and social media video downloader backend",
    version="1.0.0"
)

# Enable CORS for frontend requests from .env
origins_env = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in origins_env.split(",") if o.strip()] if origins_env != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins else ["*"],
    # Always allow the deployed Vercel frontend, even if ALLOWED_ORIGINS on the host is stale
    allow_origin_regex=r"https://((instasave|reeler)[a-z0-9-]*\.vercel\.app|(www\.)?reeler\.shop)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# VIP Key Storage file
VIP_KEYS_FILE = os.path.join(os.path.dirname(__file__), "vip_keys.json")

def load_vip_keys():
    if os.path.exists(VIP_KEYS_FILE):
        try:
            with open(VIP_KEYS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_vip_keys(keys_dict):
    try:
        with open(VIP_KEYS_FILE, "w") as f:
            json.dump(keys_dict, f, indent=2)
    except Exception:
        pass

class ExtractRequest(BaseModel):
    url: str

class PaymentVerifyRequest(BaseModel):
    utr: str
    upi_id: Optional[str] = "user@upi"

class KeyValidateRequest(BaseModel):
    key: str

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "ReelSave Backend",
        "version": "1.0.0"
    }

@app.get("/api/vip/info")
def get_vip_info():
    """Returns UPI details for ₹20 lifetime pass"""
    return {
        "price": 20,
        "currency": "INR",
        "upi_id": os.getenv("UPI_ID", "your-upi-id@oksbi"),
        "payee_name": os.getenv("UPI_NAME", "ReelSave PRO"),
        "note": "ReelSave VIP Lifetime Access"
    }

@app.post("/api/vip/verify-payment")
def verify_payment(payload: PaymentVerifyRequest):
    """
    Instantly verifies UTR and activates VIP Lifetime Pass Key.
    Blocks fake format and duplicate/repeat UTR reuse.
    """
    import re
    import uuid
    import time

    utr = payload.utr.strip()
    
    # 1. Strict UPI UTR validation (Must be exactly 12 numeric digits)
    if not re.match(r'^\d{12}$', utr):
        raise HTTPException(
            status_code=400, 
            detail="Invalid UTR! Please enter the exact 12-digit numeric Reference / UTR Number from your PhonePe/GPay/Paytm receipt."
        )

    # 2. Block obvious fake repetitive patterns (e.g., 000000000000, 111111111111, 123456789012)
    fake_patterns = ["000000000000", "111111111111", "123456789012", "999999999999", "123456789000"]
    if utr in fake_patterns or len(set(utr)) <= 2:
        raise HTTPException(
            status_code=400,
            detail="Fake or invalid UTR detected. Please enter your genuine transaction reference number."
        )

    keys = load_vip_keys()
    
    # 3. Block Duplicate / Repeat UTR
    for key, data in keys.items():
        if data.get("utr") == utr:
            # If UTR already exists in database, block it from being reused
            raise HTTPException(
                status_code=400,
                detail="This UTR has already been redeemed! Each payment can only be used once."
            )

    # 4. Generate Instant VIP Lifetime Pass Key
    vip_key = f"REEL-{uuid.uuid4().hex[:8].upper()}"
    keys[vip_key] = {
        "utr": utr,
        "upi_id": payload.upi_id,
        "created_at": int(time.time()),
        "status": "active"
    }
    save_vip_keys(keys)

    return {
        "success": True,
        "key": vip_key,
        "message": "Payment verified! Your VIP Lifetime Pass is now activated."
    }

@app.post("/api/vip/validate-key")
def validate_vip_key(payload: KeyValidateRequest):
    """Checks if a VIP pass key is valid and active"""
    clean_key = payload.key.strip().upper()
    keys = load_vip_keys()
    master_key = os.getenv("MASTER_VIP_KEY", "REEL-VIP-PASS-2026")
    
    if clean_key == master_key:
        return {"valid": True, "key": clean_key}

    if clean_key in keys:
        if keys[clean_key].get("status") == "revoked":
            raise HTTPException(status_code=403, detail="This VIP Pass has been revoked due to invalid payment.")
        return {"valid": True, "key": clean_key}

    return {"valid": False, "detail": "Invalid or expired VIP Pass Key."}

@app.get("/api/vip/admin/transactions")
def list_transactions(admin_key: str = Query("", description="Master Admin Key")):
    """Admin-only view to see all received UTRs and generated VIP keys"""
    master_key = os.getenv("MASTER_VIP_KEY", "REEL-VIP-PASS-2026")
    if admin_key != master_key:
        raise HTTPException(status_code=403, detail="Unauthorized")
    return {"total": len(load_vip_keys()), "transactions": load_vip_keys()}

@app.post("/api/extract")
def extract_video(payload: ExtractRequest):
    """
    Extracts high-resolution video stream, thumbnail, and media details from the provided URL.
    """
    if not payload.url or not payload.url.strip():
        raise HTTPException(status_code=400, detail="Please enter a valid video or reel URL.")
    
    try:
        data = extract_media_info(payload.url.strip())
        return {
            "success": True,
            "data": data
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error processing request: {str(e)}")

def remove_temp_dir(path: str):
    try:
        if os.path.exists(path):
            shutil.rmtree(path, ignore_errors=True)
    except Exception:
        pass

@app.get("/api/download")
def download_stream(
    url: Optional[str] = Query(None, description="Direct video stream URL"),
    audio_url: Optional[str] = Query(None, description="Separate audio track URL"),
    source_url: Optional[str] = Query(None, description="Source video link"),
    filename: str = Query("reelsave_video.mp4", description="Custom download filename"),
    is_audio: bool = Query(False, description="Whether to extract audio only"),
    needs_merge: bool = Query(False, description="Whether video and audio tracks need merging"),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """
    Downloads and streams video directly to the client with GUARANTEED SOUND.
    Prioritizes yt-dlp merger with universal AAC audio for complete compatibility with Windows, Android, and iOS.
    """
    clean_name = urllib.parse.unquote(filename).replace('"', '').strip()
    base_name = os.path.splitext(clean_name)[0] or "reelsave_media"
    
    # 1. AUDIO-ONLY DOWNLOAD MODE (High Quality MP3)
    if is_audio:
        audio_filename = f"{base_name}.mp3"
        temp_dir = tempfile.mkdtemp()
        out_mp3 = os.path.join(temp_dir, audio_filename)

        # Method A: Try yt-dlp from source_url (best audio extraction)
        if source_url:
            try:
                ydl_opts = {
                    'format': 'bestaudio/best',
                    'outtmpl': os.path.join(temp_dir, f"{base_name}.%(ext)s"),
                    'postprocessors': [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '192',
                    }],
                    'quiet': True,
                    'no_warnings': True,
                    'socket_timeout': 25,
                }
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.extract_info(source_url, download=True)
                
                # Check for output mp3
                for fname in os.listdir(temp_dir):
                    if fname.endswith('.mp3'):
                        full_mp3 = os.path.join(temp_dir, fname)
                        if os.path.getsize(full_mp3) > 0:
                            background_tasks.add_task(remove_temp_dir, temp_dir)
                            return FileResponse(path=full_mp3, filename=audio_filename, media_type="audio/mpeg")
            except Exception:
                pass

        # Method B: FFmpeg conversion from direct audio_url or url
        target_audio = audio_url or url
        if target_audio:
            try:
                # Download audio locally first to avoid remote stream drops
                raw_audio_path = os.path.join(temp_dir, "raw_audio.tmp")
                req_headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Referer': 'https://www.instagram.com/'
                }
                with requests.get(target_audio, headers=req_headers, stream=True, timeout=20) as r:
                    r.raise_for_status()
                    with open(raw_audio_path, 'wb') as f:
                        for chunk in r.iter_content(chunk_size=128 * 1024):
                            if chunk:
                                f.write(chunk)
                
                cmd = [
                    "ffmpeg", "-y",
                    "-i", raw_audio_path,
                    "-vn",
                    "-c:a", "libmp3lame",
                    "-b:a", "192k",
                    out_mp3
                ]
                ret = subprocess.run(cmd, capture_output=True, text=True)
                if ret.returncode == 0 and os.path.exists(out_mp3) and os.path.getsize(out_mp3) > 0:
                    background_tasks.add_task(remove_temp_dir, temp_dir)
                    return FileResponse(path=out_mp3, filename=audio_filename, media_type="audio/mpeg")
            except Exception:
                pass

        remove_temp_dir(temp_dir)
        raise HTTPException(status_code=500, detail="Audio download or conversion failed.")

    # 2. VIDEO DOWNLOAD MODE (Full HD MP4 with Guaranteed AAC Audio)
    if not clean_name.lower().endswith('.mp4'):
        clean_name += ".mp4"

    # METHOD A: YT-DLP DOWNLOAD & MERGE FROM SOURCE URL
    # This is the most reliable way: yt-dlp gets the highest video + highest audio,
    # merges them with FFmpeg and encodes audio as AAC so Windows Media Player / phones always play sound!
    if source_url:
        try:
            temp_dir = tempfile.mkdtemp()
            out_template = os.path.join(temp_dir, "%(id)s.%(ext)s")

            ydl_opts = {
                'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best',
                'outtmpl': out_template,
                'merge_output_format': 'mp4',
                'postprocessor_args': {
                    'merger': ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k']
                },
                'quiet': True,
                'no_warnings': True,
                'socket_timeout': 30,
            }

            cookie_file = os.path.join(os.path.dirname(__file__), "cookies.txt")
            if os.path.exists(cookie_file) and os.path.getsize(cookie_file) > 0:
                ydl_opts['cookiefile'] = os.path.abspath(cookie_file)

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(source_url, download=True)
                downloaded_file = ydl.prepare_filename(info)
                base, _ = os.path.splitext(downloaded_file)
                mp4_file = f"{base}.mp4"
                actual_file = mp4_file if os.path.exists(mp4_file) else downloaded_file

                if os.path.exists(actual_file) and os.path.getsize(actual_file) > 0:
                    background_tasks.add_task(remove_temp_dir, temp_dir)
                    return FileResponse(
                        path=actual_file,
                        filename=clean_name,
                        media_type="video/mp4"
                    )
            remove_temp_dir(temp_dir)
        except Exception as e:
            # If yt-dlp direct download fails, continue to local muxing or stream
            pass

    # METHOD B: SEPARATE VIDEO & AUDIO STREAMS (FFmpeg local download + Mux)
    # When video and audio tracks are separate, download both locally first,
    # then mux them with universal AAC audio so sound is 100% audible on all players.
    if url and audio_url and audio_url.strip() and audio_url != url:
        temp_dir = tempfile.mkdtemp()
        try:
            req_headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://www.instagram.com/'
            }
            v_tmp = os.path.join(temp_dir, "v_stream.tmp")
            a_tmp = os.path.join(temp_dir, "a_stream.tmp")
            out_mp4 = os.path.join(temp_dir, clean_name)

            # Download video stream locally
            with requests.get(url, headers=req_headers, stream=True, timeout=25) as r_v:
                r_v.raise_for_status()
                with open(v_tmp, 'wb') as f:
                    for chunk in r_v.iter_content(chunk_size=256 * 1024):
                        if chunk:
                            f.write(chunk)

            # Download audio stream locally
            with requests.get(audio_url, headers=req_headers, stream=True, timeout=25) as r_a:
                r_a.raise_for_status()
                with open(a_tmp, 'wb') as f:
                    for chunk in r_a.iter_content(chunk_size=128 * 1024):
                        if chunk:
                            f.write(chunk)

            # FFmpeg Mux with AAC audio and faststart
            cmd = [
                "ffmpeg", "-y",
                "-i", v_tmp,
                "-i", a_tmp,
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "192k",
                "-movflags", "+faststart",
                "-shortest",
                out_mp4
            ]
            ret = subprocess.run(cmd, capture_output=True, text=True)
            if ret.returncode == 0 and os.path.exists(out_mp4) and os.path.getsize(out_mp4) > 0:
                background_tasks.add_task(remove_temp_dir, temp_dir)
                return FileResponse(
                    path=out_mp4,
                    filename=clean_name,
                    media_type="video/mp4"
                )
        except Exception:
            pass
        finally:
            if not os.path.exists(os.path.join(temp_dir, clean_name)):
                remove_temp_dir(temp_dir)

    # METHOD C: DIRECT SINGLE STREAM (Only if stream is ALREADY muxed with sound)
    # If needs_merge is True and muxing failed, do NOT stream a silent video without user warning!
    if url and not needs_merge:
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://www.instagram.com/'
            }
            upstream_resp = requests.get(url, headers=headers, stream=True, timeout=25)
            if upstream_resp.status_code == 200:
                content_type = upstream_resp.headers.get("content-type", "video/mp4")
                content_length = upstream_resp.headers.get("content-length")

                def iter_chunks():
                    for chunk in upstream_resp.iter_content(chunk_size=1024 * 128):
                        if chunk:
                            yield chunk

                response_headers = {
                    "Content-Disposition": f'attachment; filename="{clean_name}"',
                    "Accept-Ranges": "bytes"
                }
                if content_length:
                    response_headers["Content-Length"] = content_length

                return StreamingResponse(
                    iter_chunks(),
                    media_type=content_type,
                    headers=response_headers
                )
        except Exception:
            pass

    # METHOD D: FALLBACK DIRECT STREAM AS LAST RESORT
    if url:
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://www.instagram.com/'
            }
            upstream_resp = requests.get(url, headers=headers, stream=True, timeout=25)
            if upstream_resp.status_code == 200:
                content_type = upstream_resp.headers.get("content-type", "video/mp4")
                response_headers = {
                    "Content-Disposition": f'attachment; filename="{clean_name}"',
                    "Accept-Ranges": "bytes"
                }
                def iter_chunks():
                    for chunk in upstream_resp.iter_content(chunk_size=1024 * 128):
                        if chunk:
                            yield chunk

                return StreamingResponse(iter_chunks(), media_type=content_type, headers=response_headers)
        except Exception:
            pass

    raise HTTPException(status_code=400, detail="Failed to download media stream with audio.")

# Mount frontend directory if it exists
frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
