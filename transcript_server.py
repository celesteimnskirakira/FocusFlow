#!/usr/bin/env python3
"""
YouTube Transcript API Server
Provides subtitle retrieval service for a browser extension

[Modified] Uses rotating proxies with username/password authentication
loaded from a Webshare API link
"""

import os
import random
import requests  # requests library
from flask import Flask, jsonify, request
from flask_cors import CORS
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import GenericProxyConfig
import logging

app = Flask(__name__)

# Configure CORS
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"],
        "expose_headers": ["Content-Type"],
        "supports_credentials": False
    }
})

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# [Important] Paste your Webshare API link here
PROXY_API_URL = ''
PROXY_LIST = []  # This list will store full proxy URLs

try:
    logger.info("Downloading proxy list from Webshare API...")
    
    # Use requests to download the proxy list
    response = requests.get(PROXY_API_URL, timeout=10)  # 10s timeout
    response.raise_for_status()  # raise if download failed (e.g., 404, 500)
    
    proxy_data_text = response.text
    
    # [Modified] Parse downloaded text line by line
    for line in proxy_data_text.splitlines():
        line = line.strip()
        if not line:
            continue
        
        # Expected format: IP:PORT:USERNAME:PASSWORD
        try:
            parts = line.split(':')
            if len(parts) == 4:
                ip = parts[0]
                port = parts[1]
                username = parts[2]
                password = parts[3]
                
                # Build full proxy URL that includes authentication
                proxy_url = f"http://{username}:{password}@{ip}:{port}"
                PROXY_LIST.append(proxy_url)
            else:
                logger.warning(f"Skipping malformed line: {line}")
        except Exception as e:
            logger.warning(f"Error parsing line '{line}': {e}")

    if PROXY_LIST:
        logger.info(f"Successfully loaded and constructed {len(PROXY_LIST)} authenticated proxies")
    else:
        logger.warning("Warning: Proxy list from API is empty or all lines were malformed.")

except requests.exceptions.RequestException as e:
    logger.error(f"Fatal error: Unable to download proxy list from API: {e}")
    logger.error("Server will run in no-proxy mode; requests to YouTube may fail.")
except Exception as e:
    logger.error(f"Unknown error while loading proxies: {e}")
# --- [new] Proxy loading complete ---


def get_api_instance():
    """
    Create and configure a YouTubeTranscriptApi instance using the loaded
    authenticated proxy list. A random proxy is selected on each call.
    """
    if PROXY_LIST:
        # Randomly pick a full proxy URL
        proxy_url = random.choice(PROXY_LIST)
        
        # Only log IP:Port, hide credentials
        logger.info(f"Using authenticated proxy: {proxy_url.split('@')[-1]}")
        
        proxy_config = GenericProxyConfig(
            http_url=proxy_url,
            https_url=proxy_url,  # Use the same HTTP proxy for HTTPS requests
        )
        return YouTubeTranscriptApi(proxy_config=proxy_config)
    else:
        # Fall back to direct connection if no proxies were loaded
        logger.warning("No proxies loaded. Using direct connection... (may fail)")
        return YouTubeTranscriptApi()

@app.route('/')
def home():
    """Health check endpoint"""
    return jsonify({
        'status': 'running',
        'message': 'YouTube Transcript API Server is running'
    })

@app.route('/transcript/<video_id>')
def get_transcript(video_id):
    """
    Fetch transcript for the specified video
    """
    try:
        logger.info(f"Fetching transcript for video: {video_id}")
        ytt_api = get_api_instance()
        fetched_transcript = ytt_api.fetch(video_id)
        
        snippets = fetched_transcript.snippets
        transcript_data = []
        for snippet in snippets:
            transcript_data.append({
                'text': snippet.text,
                'start': snippet.start,
                'duration': snippet.duration
            })
        
        logger.info(f"Successfully fetched {len(transcript_data)} segments for {video_id}")
        
        return jsonify({
            'success': True,
            'videoId': video_id,
            'transcript': transcript_data
        })
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error fetching transcript for {video_id}: {error_msg}")
        return jsonify({
            'success': False,
            'videoId': video_id,
            'error': error_msg
        }), 400

@app.route('/transcript/batch', methods=['POST'])
def get_transcripts_batch():
    """
    Batch fetch transcripts for multiple videos
    """
    try:
        data = request.get_json()
        video_ids = data.get('videoIds', [])
        
        if not video_ids:
            return jsonify({
                'success': False,
                'error': 'No video IDs provided'
            }), 400
        
        logger.info(f"Batch fetching transcripts for {len(video_ids)} videos")
        ytt_api = get_api_instance()
        results = {}
        
        for video_id in video_ids:
            try:
                transcript = ytt_api.fetch(video_id)
                
                snippets = transcript.snippets
                transcript_list = []
                for snippet in snippets:
                    transcript_list.append({
                        'text': snippet.text,
                        'start': snippet.start,
                        'duration': snippet.duration
                    })
                
                results[video_id] = {
                    'success': True,
                    'transcript': transcript_list
                }
            except Exception as e:
                results[video_id] = {
                    'success': False,
                    'error': str(e)
                }
        
        return jsonify({
            'success': True,
            'results': results
        })
        
    except Exception as e:
        logger.error(f"Batch request error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


if __name__ == '__main__':
    print("=" * 50)
    print("YouTube Transcript API Server")
    print("=" * 50)
    if PROXY_LIST:
        print(f"Mode: Authenticated proxy mode (loaded {len(PROXY_LIST)} proxies)")
    else:
        print("Mode: Direct connection (no proxies found or loaded)")
    print("=" * 50)
    print("Server running on: http://127.0.0.1:5000")
    print("Test endpoint: http://127.0.0.1:5000/")
    print("Transcript API: http://127.0.0.1:5000/transcript/<video_id>")
    print("\nPress Ctrl+C to stop the server")
    print("=" * 50)
    
    app.run(
        host='127.0.0.1',
        port=5000,
        debug=True,
        threaded=True
    )