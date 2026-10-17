"""Analyze full supplied recording locally. Measurements cannot identify instruments or individual stems."""
import json
from pathlib import Path
import wave
import numpy as np

OUT = Path(__file__).resolve().parents[1] / 'design/adaptive-audio/reference-study'
with wave.open(str(OUT / 'reference-full.wav'), 'rb') as w:
    rate, channels = w.getframerate(), w.getnchannels()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').reshape(-1, channels).mean(axis=1) / 32768
hop = round(rate * 0.5)
frames = x[:len(x)//hop*hop].reshape(-1, hop)
spectrum = abs(np.fft.rfft(frames * np.hanning(hop), axis=1))**2
freq = np.fft.rfftfreq(hop, 1/rate)
bands = [(30,150),(150,500),(500,1800),(1800,6000),(6000,10000)]
energy = np.stack([spectrum[:,(freq>=lo)&(freq<hi)].sum(axis=1) for lo,hi in bands],axis=1)
share = energy / np.maximum(energy.sum(axis=1,keepdims=True), 1e-12)
rms = 20*np.log10(np.maximum(np.sqrt((frames**2).mean(axis=1)),1e-12))
# Inspect sustained differences between 2-second neighborhoods; exclude first/last second.
changes=[]
for i in range(4,len(frames)-4):
    a,b=share[i-4:i].mean(axis=0),share[i:i+4].mean(axis=0)
    delta=float(np.abs(b-a).sum())
    changes.append((delta,i*0.5))
candidates=[]
for strength,at in sorted(changes,reverse=True):
    if all(abs(at-c['seconds'])>=3 for c in candidates):
        candidates.append({'seconds':at,'spectral_share_change':round(strength,3)})
    if len(candidates)==10:break
rows=[]
for start in range(0,int(len(x)/rate),4):
    a,b=start*2,min(len(frames),(start+4)*2)
    if b<=a:continue
    rows.append({'start_seconds':start,'end_seconds':min(round(len(x)/rate,3),start+4),
        'rms_dbfs':round(float(rms[a:b].mean()),2),
        'band_share_percent':dict(zip([f'{lo}-{hi}' for lo,hi in bands],np.round(share[a:b].mean(axis=0)*100,2).tolist()))})
result={'duration_seconds':round(len(x)/rate,3),'sample_rate':rate,
    'limitations':['手机录音完整混音；能量变化可能来自配器、旋律、音量或录音操作，不能确认独立音轨的进入。',
    '以下时间是谱变化候选点，不是人工听觉标注；不据此声称识别了钟声、每层音色或 BPM。'],
    'change_candidates':sorted(candidates,key=lambda c:c['seconds']), 'four_second_windows':rows}
(OUT/'full-analysis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
