import sys
import os
import subprocess
import json
import threading
import random

def create_thumbnail(filepath, outdir):
    thumb_path = os.path.join(outdir, os.path.basename(filepath).replace(".mkv", ".jpg")) if filepath.endswith(".mkv") else os.path.join(outdir, os.path.basename(filepath).replace(".mp4", ".jpg"))
    cmd = [
        "ffmpeg",
        "-protocol_whitelist", "file,pipe,crypto,http,https,tcp,tls",
        "-i", filepath,
        "-ss", "00:03:00",
        "-frames:v", "1",
        "-q:v", "2",
        "-y", thumb_path
    ]
    subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, preexec_fn=os.setpgrp)

def ffprobe(filepath):
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "stream=index,codec_type,codec_name:stream_tags=language",
        "-of", "json",
        filepath
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout)

def ffreencode(filepath, audio_index):
    newfolder = dest+os.path.basename(filepath.replace(".mkv", "") if filepath.endswith(".mkv") else filepath.replace(".mp4", ""))
    os.mkdir(newfolder)
    output_file = os.path.join(newfolder, os.path.basename(filepath)).replace(".mkv", ".m3u8") if filepath.endswith(".mkv") else os.path.join(newfolder, os.path.basename(filepath)).replace(".mp4", ".m3u8")
    cmd = [
        "ffmpeg",
        "-i", filepath,
        "-map", "0:v:0",
        "-map", f"0:{audio_index}",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "26",
        "-g", "48",
        "-sc_threshold", "0",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ac", "2",
        "-hls_time", "10",
        "-hls_playlist_type", "vod",
        "-start_number", "0",
        "-hls_segment_filename", os.path.join(newfolder, "seg%03d.ts"),
        "-f", "hls",
        "-y", output_file
    ]
    with open("ffmpeg.log", "w") as log_file:
        process = subprocess.Popen(cmd, stdout=log_file, stderr=subprocess.STDOUT, preexec_fn=os.setpgrp, text=True)
    create_thumbnail(filepath=filepath, outdir=os.path.dirname(output_file))

def worker(path, aindex):
    ffreencode(path, aindex)



# --- Script Start ---
if len(sys.argv) < 3 or not sys.argv[1].startswith("/"):
    exit(print("Invalid arguments.\nUsage: python3 script.py <absolute source path> <relative/absolute destination path (folder)>"))

path = sys.argv[1]
dest = sys.argv[2] if sys.argv[2].endswith("/") else sys.argv[2] + "/"
langreq = sys.argv[3] or ""
extensions = (".mkv", ".mp4")
videos = []
audioreencode_ = {}
audioreencode = {}
threads = []

if not os.path.isdir(dest):
    os.makedirs(dest)

for fname in os.listdir(path):
    fpath = os.path.join(path, fname)
    if os.path.isfile(fpath) and fname.lower().endswith(extensions):
        videos.append(fpath)

if not videos:
    print(f"No video files found in this directory. Ensure the extensions are one of these: {extensions}")
    exit()

everylang = []
indexes = {}
langtotranscode = ""

for video in videos:
    data = ffprobe(video)
    indexes[video] = {}
    for stream in data["streams"]:
        if stream["codec_type"] == "audio":
            index = stream["index"]
            lang = stream.get("tags", {}).get("language", "und")
            if lang.upper() not in everylang:
                everylang.append(lang.upper())
            indexes[video][lang.upper()] = index

track_list = "".join(str(i+1)+'.\t'+everylang[i]+'\n' for i in range(len(everylang)))
print(f"All the soundtracks I could find:\n{track_list}\nWhich one to use in transcoding?")
langtotranscode = -1
if langreq.upper() and langreq.upper() in everylang:
    langtotranscode = langreq.upper()
else:
    langtotranscode = everylang[int(input("> "))-1].upper()

for vpath, vlang in indexes.items():
    audioreencode[vpath] = indexes[vpath][langtotranscode]


exit(print("No video selected to transcode, exiting...")) if len(audioreencode) < 1 else None

print("Starting jobs")
jobs = list(audioreencode.items())
for filepath, audio_index in jobs:
    t = threading.Thread(target=worker, args=(filepath, audio_index))
    t.start()
    threads.append(t)

