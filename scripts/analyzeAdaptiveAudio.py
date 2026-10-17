"""本地参考录音的客观分析；不做音源分离，不把测量当作听觉或风格识别。"""
import json
from pathlib import Path
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'design/adaptive-audio/reference-study'
BANDS = [(30,150),(150,500),(500,1800),(1800,6000),(6000,10000)]

def read(path):
    with wave.open(str(path), 'rb') as wav:
        assert wav.getsampwidth() == 2
        rate, channels = wav.getframerate(), wav.getnchannels()
        signal = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float64) / 32768
        return signal.reshape(-1, channels).mean(axis=1), rate

def measure(signal, rate):
    # 避开录音起止操作声和试听文件的淡入淡出，仅测中心的有效段。
    crop = signal[int(rate*0.4):-int(rate*0.4)]
    size = 1 << (len(crop)-1).bit_length()
    spectrum = np.fft.rfft(crop * np.hanning(len(crop)), n=size)
    freq = np.fft.rfftfreq(size, 1/rate)
    energy = abs(spectrum)**2
    total = energy[(freq>=30)&(freq<10000)].sum()
    band_energy = {f'{lo}-{hi}Hz': round(100*float(energy[(freq>=lo)&(freq<hi)].sum()/total),2) for lo,hi in BANDS}
    fft = np.fft.rfft(crop, n=size)
    modulation = {}
    for lo,hi in [(150,500),(500,1800),(1800,6000)]:
        band = np.fft.irfft(fft * ((freq>=lo)&(freq<hi)), n=size)[:len(crop)]
        hop = max(1,round(rate*0.005))
        env = np.sqrt(np.mean(band[:len(band)//hop*hop].reshape(-1,hop)**2,axis=1))
        env = env/(env.mean()+1e-12)
        centered = (env-env.mean())*np.hanning(len(env))
        m = abs(np.fft.rfft(centered))**2
        f = np.fft.rfftfreq(len(env),hop/rate)
        selected = (f>=5)&(f<=40)
        candidates = np.argsort(m[selected])[::-1]
        peaks=[]
        for i in candidates:
            h=float(f[selected][i])
            if all(abs(h-p['hz'])>0.8 for p in peaks):
                peaks.append({'hz':round(h,2),'relative_power':round(float(m[selected][i]/(m[selected].sum()+1e-12)),4)})
            if len(peaks)==5:break
        modulation[f'{lo}-{hi}Hz']={'depth':round(float(env.std()),3),'peaks_5_to_40Hz':peaks}
    peak=max(abs(crop).max(),1e-12)
    rms=np.sqrt(np.mean(crop**2))
    return {'duration_seconds':round(len(signal)/rate,3),'rms_dbfs':round(float(20*np.log10(rms+1e-12)),2),
        'peak_dbfs':round(float(20*np.log10(peak)),2),'band_energy_percent':band_energy,'modulation':modulation}

reference, rate = read(OUT/'reference-analysis.wav')
results={'limitations':['参考为手机录制的完整混音，含录音设备染色，不能据此分离或认定第五轨。',
    '本分析是信号测量，不是主观试听；调制峰不等同于 BPM 或某乐器的起音率。'],
    'reference':measure(reference,rate)}
for variant in ['undertow','flare','pursuit']:
    tracks=[read(ROOT/f'design/adaptive-audio/{variant}/stems/{stem}.wav')[0] for stem in ['bed','beacon','bass','drums','arp','spark']]
    manifest=json.loads((ROOT/f'design/adaptive-audio/{variant}/manifest.json').read_text())
    mix=manifest.get('levelMixes',[[1]*6]*6)[5]
    background=sum(track*mix[i] for i,track in enumerate(tracks[:5])); fifth=tracks[5]*mix[5]
    rms=lambda x:float(np.sqrt(np.mean(x*x)))
    results[variant]={'full_mix':measure((background+fifth)*0.78,24000),
        'fifth_vs_other_tracks_db':round(20*np.log10(rms(fifth)/rms(background)),2)}
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'analysis.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
for name,result in results.items():
    if name=='limitations':continue
    data=result.get('full_mix',result)
    print(name,json.dumps({'bands':data['band_energy_percent'],'mid_modulation':data['modulation']['500-1800Hz'],
        'upper_modulation':data['modulation']['1800-6000Hz'],'fifth_vs_others_db':result.get('fifth_vs_other_tracks_db')},ensure_ascii=False))
