# Build the evaluation corpus (corpus/, gitignored) from two public datasets, for scripts/eval.mjs:
#   corpus/beat        AVP's 56 beatbox improvisations (28 amateurs x fixed / personal kit), onsets + kick/snare/hat labels
#   corpus/beat-class  AVP's 224 single-sound files (the classifier's training material)
#   corpus/hum         40 HumTrans test hums with their MIDI, octave-corrected against pyin (see below)
# Each <name>.wav (16 kHz mono) has a <name>.json: { events: [{ t, end?, midi|null, voice?, label? }] }.
# usage: python -m venv venv && venv/Scripts/pip install librosa soundfile pretty_midi numpy && venv/Scripts/python scripts/corpus.py [n_hums]
# AVP (Delgado et al., QMUL/ROLI) is CC BY 4.0: https://zenodo.org/records/3245959. HumTrans (Liu et al.) is CC BY-NC 4.0:
# https://huggingface.co/datasets/dadinghh2/HumTrans; its 14.7 GB wav zip is read by HTTP range requests, only the
# wanted members come down. Neither is redistributed here.
# Known label defects worked around: HumTrans's MIDI is score-timed (the singer's tempo and drift are not in it:
# only the pitch sequence and gap ratios are truth, not onset times), and for several singers it sits an octave off
# what was sung (shifted here by the octave that puts it nearest pyin's median).
import csv, glob, io, json, os, random, sys, urllib.request, zipfile
import numpy as np, soundfile as sf, librosa, pretty_midi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'corpus'); RAW = os.path.join(OUT, '_raw')
VOICE = {'kd': 'bd', 'sd': 'sd', 'hhc': 'hh', 'hho': 'hh'}
N_HUMS = int(sys.argv[1]) if len(sys.argv) > 1 else 40

def write(dst, y, sr, events):
    y16 = librosa.resample(y.astype(np.float32), orig_sr=sr, target_sr=16000)
    sf.write(dst + '.wav', y16, 16000, subtype='PCM_16'); json.dump({'events': events}, open(dst + '.json', 'w'))

def fetch(url, dst):
    if os.path.exists(dst): return dst
    print('fetching', url); urllib.request.urlretrieve(url, dst); return dst

class RangeFile(io.RawIOBase):  # a seekable read-only view of a URL, so zipfile reads only what it needs
    def __init__(self, url):
        self.url = urllib.request.urlopen(urllib.request.Request(url, method='HEAD')).geturl(); self.pos = 0
        self.size = int(urllib.request.urlopen(urllib.request.Request(self.url, method='HEAD')).headers['Content-Length'])
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off; return self.pos
    def readinto(self, b):
        n = len(b)
        if n == 0 or self.pos >= self.size: return 0
        r = urllib.request.Request(self.url, headers={'Range': f'bytes={self.pos}-{self.pos + n - 1}'})
        d = urllib.request.urlopen(r).read(); b[:len(d)] = d; self.pos += len(d); return len(d)

for sub in ['beat', 'beat-class', 'hum', '_raw']: os.makedirs(os.path.join(OUT, sub), exist_ok=True)

# AVP
z = fetch('https://zenodo.org/records/3245959/files/AVP_Dataset.zip?download=1', os.path.join(RAW, 'AVP_Dataset.zip'))
if not glob.glob(os.path.join(RAW, 'AVP_Dataset/*/Participant_*/*.csv')): zipfile.ZipFile(z).extractall(RAW)
for csvf in glob.glob(os.path.join(RAW, 'AVP_Dataset/*/Participant_*/*.csv')):
    name = os.path.basename(csvf)[:-4]; dst = os.path.join(OUT, 'beat' if 'Improvisation' in name else 'beat-class', name)
    if os.path.exists(dst + '.json'): continue
    y, sr = sf.read(csvf[:-4] + '.wav'); y = y if y.ndim == 1 else y.mean(1)
    events = [{'t': float(r[0]), 'midi': None, 'voice': VOICE[r[1].strip()], 'label': r[1].strip()} for r in csv.reader(open(csvf)) if len(r) > 1 and r[1].strip() in VOICE]
    write(dst, y, sr, events)

# HumTrans
HF = 'https://huggingface.co/datasets/dadinghh2/HumTrans/resolve/main/'
mz = fetch(HF + 'all_midi.zip', os.path.join(RAW, 'humtrans_midi.zip'))
if not os.path.isdir(os.path.join(RAW, 'midi_data')): zipfile.ZipFile(mz).extractall(RAW)
keys = json.load(open(fetch(HF + 'train_valid_test_keys.json', os.path.join(RAW, 'humtrans_keys.json'))))['TEST']
random.seed(1); random.shuffle(keys)
wanted = [k for k in keys if not os.path.exists(os.path.join(OUT, 'hum', k + '.json'))][:max(0, N_HUMS - len(glob.glob(os.path.join(OUT, 'hum', '*.json'))))]
if wanted:
    zf = zipfile.ZipFile(io.BufferedReader(RangeFile(HF + 'all_wav.zip'), buffer_size=1 << 20))
    members = {os.path.basename(i.filename)[:-4]: i for i in zf.infolist() if i.filename.endswith('.wav')}
    for k in wanted:
        if k not in members: continue
        y, sr = sf.read(io.BytesIO(zf.open(members[k]).read())); y = y if y.ndim == 1 else y.mean(1)
        notes = pretty_midi.PrettyMIDI(os.path.join(RAW, 'midi_data', k + '.mid')).instruments[0].notes
        events = [{'t': float(n.start), 'end': float(n.end), 'midi': int(n.pitch)} for n in notes]
        y16 = librosa.resample(y.astype(np.float32), orig_sr=sr, target_sr=16000)
        f0, vf, _ = librosa.pyin(y16, fmin=60, fmax=1000, sr=16000, hop_length=160)
        if vf.any():
            shift = int(round((float(np.median(69 + 12 * np.log2(f0[vf] / 440))) - float(np.median([e['midi'] for e in events]))) / 12)) * 12
            for e in events: e['midi'] += shift
            if shift: print(k, 'labels shifted', shift)
        dst = os.path.join(OUT, 'hum', k); sf.write(dst + '.wav', y16, 16000, subtype='PCM_16'); json.dump({'events': events}, open(dst + '.json', 'w'))
        print(k, len(events), 'notes')
for sub in ['beat', 'beat-class', 'hum']: print(sub, len(glob.glob(os.path.join(OUT, sub, '*.wav'))), 'files')
