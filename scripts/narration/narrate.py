"""Optional synthetic narration for the demo video (fallback when a human
voiceover is not available — the Devpost rules require audio).

Requires: pip install gTTS imageio-ffmpeg   (gTTS calls Google's TTS endpoint)
Env: SP=<scratch dir for clips>

  python3 scripts/narration/narrate.py holds
      -> prints SCENE_MIN_HOLDS JSON: pass it to record-demo so every scene is
         held at least as long as its narration line
  SCENE_MIN_HOLDS='[...]' E2E_BASE_URL=... pnpm --filter @workspace/scripts run record-demo
  python3 scripts/narration/narrate.py mux docs/demo/matchrv-demo.mp4
      -> places each clip exactly at its scene start and writes
         docs/demo/matchrv-demo-narrated.mp4 (AAC, sync within ~1s)

  holds        -> print SCENE_MIN_HOLDS JSON (clip seconds + margin) for record-demo.ts
  mux VIDEO    -> place each clip exactly at its scene start, mux to matchrv-demo-narrated.mp4
  trim HEAD END [PAD]
               -> run last. Drops the page-load lead-in before the title card (HEAD s), cuts
                  the closing card's fade-out (from END s) and freezes the card for PAD s;
                  rewrites both cuts in place and shifts NARRATION.md. Sep 3 recording:
                  python3 scripts/narration/narrate.py trim 4.0 162.65 1.35
Clips are synthesized once at natural pace (tempo 1.0) into $SP/narr/."""
import json, os, re, subprocess, sys, wave
import imageio_ffmpeg
from gtts import gTTS
F = imageio_ffmpeg.get_ffmpeg_exe(); W = os.path.join(os.environ["SP"], "narr"); os.makedirs(W, exist_ok=True)
D = "docs/demo"; MARGIN = 1.2; RATE = 24000; TITLE_CARD = None  # OFFSET derived below
lines = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "narration-lines.json")))
def clip(i):
    mp3, wav = f"{W}/{i}.mp3", f"{W}/{i}-1.0.wav"
    if not os.path.exists(mp3): gTTS(lines[i], lang="en", tld="com").save(mp3)
    if not os.path.exists(wav):
        subprocess.run([F,"-y","-loglevel","error","-i",mp3,"-ar",str(RATE),"-ac","1","-sample_fmt","s16",wav],check=True)
    with wave.open(wav) as w: return wav, w.getnframes()/w.getframerate()
if sys.argv[1] == "trim":
    head, end = float(sys.argv[2]), float(sys.argv[3]); pad = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
    silent, narrated = f"{D}/matchrv-demo.mp4", f"{D}/matchrv-demo-narrated.mp4"
    enc = ["-c:v","libx264","-preset","medium","-crf","19","-pix_fmt","yuv420p","-r","30","-movflags","+faststart"]
    subprocess.run([F,"-y","-loglevel","error","-ss",str(head),"-t",str(end-head),"-i",silent,"-vf",f"tpad=stop_mode=clone:stop_duration={pad}",*enc,"-an",silent+".tmp.mp4"],check=True)
    subprocess.run([F,"-y","-loglevel","error","-i",silent+".tmp.mp4","-ss",str(head),"-i",narrated,"-map","0:v","-map","1:a","-c:v","copy","-c:a","aac","-b:a","128k","-shortest","-movflags","+faststart",narrated+".tmp.mp4"],check=True)
    os.replace(silent+".tmp.mp4", silent); os.replace(narrated+".tmp.mp4", narrated)
    md = f"{D}/NARRATION.md"; rows = open(md).read().split("\n")
    def shift(m):
        t = max(0.0, int(m.group(1))*60 + int(m.group(2)) - head); return f"| {int(t//60)}:{int(t%60):02d} |"
    open(md,"w").write("\n".join(re.sub(r"^\| (\d+):(\d\d) \|", shift, r) for r in rows))
    for v in (silent, narrated):
        r = subprocess.run([F,"-i",v],capture_output=True,text=True); print(v, re.search(r"Duration: [\d:.]+", r.stderr).group(0))
    sys.exit()
clips = [clip(i) for i in range(len(lines))]
if sys.argv[1] == "holds":
    print(json.dumps([round(d + MARGIN, 2) for _, d in clips])); sys.exit()
video = sys.argv[2]; out = f"{D}/matchrv-demo-narrated.mp4"
r = subprocess.run([F,"-i",video],capture_output=True,text=True); h,m,s_ = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", r.stderr).groups()
VDUR = int(h)*3600+int(m)*60+float(s_)
scenes = json.load(open(f"{D}/demo-scenes.json"))["scenes"]; texts = [s for s in scenes if s["caption"].strip()]
assert len(texts) == len(lines) - 2, (len(texts), len(lines))
# The scene clock starts at script load, the video at page creation. Anchor the
# first caption to the title card's known length (holds[0] + 0.4s fade) so the
# offset is measured, not assumed; fall back to total-minus-video-length.
holds = [d + MARGIN for _, d in clips]
anchor = texts[0]["t"] - (holds[0] + 0.4)
fallback = json.load(open(f"{D}/demo-scenes.json"))["totalSeconds"] - VDUR - 0.7
OFFSET = anchor if abs(anchor - fallback) < 4 else fallback
print(f"offset: anchor {anchor:.1f}s · fallback {fallback:.1f}s · using {OFFSET:.1f}s")
first = max(0.3, texts[0]["t"] - OFFSET)
starts = [max(0.3, first - (holds[0] + 0.4))] + [max(0.3, s["t"] - OFFSET) for s in texts] + [max(0.3, scenes[-1]["t"] - OFFSET + 0.9)]
pcm = bytearray(); prev_end = 0.0; worst = 0.0
for (wav, dur), st, line in zip(clips, starts, lines):
    if st < prev_end: worst = max(worst, prev_end - st); st = prev_end + 0.15
    need = int(st*RATE)*2
    if len(pcm) < need: pcm += b"\x00"*(need-len(pcm))
    with wave.open(wav) as w: pcm += w.readframes(w.getnframes())
    prev_end = st + dur
    print(f"  {st:6.1f}–{st+dur:6.1f}s  {line[:64]}")
pcm += b"\x00"*max(0, int((VDUR+0.3)*RATE)*2 - len(pcm))
narr = f"{W}/narration.wav"
with wave.open(narr,"wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(bytes(pcm))
with open(f"{D}/NARRATION.md","w") as md:
    md.write("# Narration — read aloud over docs/demo/matchrv-demo.mp4\n\nTimestamps are video time. Each line fits inside its scene; the captions on screen say the same thing, so you can simply read what you see.\n\n| Start | Line |\n| --- | --- |\n")
    for st, line in zip(starts, lines): md.write(f"| {int(st//60)}:{int(st%60):02d} | {line} |\n")
    md.write("\n**Recording your own voice:** play the MP4 full-screen, screen-record with the mic on, read each line as its scene appears. Under 3:00, audio required, upload to YouTube as Public.\n")
subprocess.run([F,"-y","-loglevel","error","-i",video,"-i",narr,"-map","0:v","-map","1:a","-c:v","copy","-c:a","aac","-b:a","128k","-shortest","-movflags","+faststart",out],check=True)
r = subprocess.run([F,"-i",out],capture_output=True,text=True); h,m,s_ = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", r.stderr).groups()
print(f"OUT {out} · {os.path.getsize(out)/1e6:.1f} MB · {int(h)*3600+int(m)*60+float(s_):.1f}s · narration ends {prev_end:.1f}s of {VDUR:.1f}s video · worst overlap nudge {worst:.2f}s")
