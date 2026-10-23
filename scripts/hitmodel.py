# Fit the drum-voice model (listen.mjs HIT_MODEL) on the features scripts/hitfeatures.mjs dumped, report its
# leave-one-participant-out accuracy, print the weights to paste in (the scaler folded into them).
#   venv/Scripts/pip install scikit-learn pandas && venv/Scripts/python scripts/hitmodel.py corpus/hits.csv
import json, sys, numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import confusion_matrix

d = pd.read_csv(sys.argv[1]); d = d[d.voice.isin(['bd', 'sd', 'hh'])].replace([np.inf, -np.inf], np.nan).dropna()
cols = [c for c in d.columns if c not in ('file', 'part', 'label', 'voice')]; labs = ['bd', 'sd', 'hh']
MACHINE_WEIGHT = float(sys.argv[2]) if len(sys.argv) > 2 else 4.0  # 721 drum samples against 9.8k vocal hits: weighted so a real snare is not outvoted by vocal ones
weight = lambda x: np.where(x.part.astype(str) == 'machine', MACHINE_WEIGHT, 1.0)
fit = lambda x, y, w: LogisticRegression(max_iter=3000).fit(x, y, sample_weight=w)
ok = n = oki = ni = okm = nm = 0; cm = np.zeros((3, 3), int)
for p in sorted(d.part.astype(str).unique()):
    tr, te = d[d.part.astype(str) != p], d[d.part.astype(str) == p]
    sc = StandardScaler().fit(tr[cols].values); m = fit(sc.transform(tr[cols].values), tr.voice.values, weight(tr))
    pred = m.predict(sc.transform(te[cols].values)); y = te.voice.values
    if p == 'machine': okm += (pred == y).sum(); nm += len(y); continue
    ok += (pred == y).sum(); n += len(y); i = te.file.str.contains('Improvisation').values; oki += (pred[i] == y[i]).sum(); ni += i.sum()
    cm += confusion_matrix(y, pred, labels=labs)
print(f'leave-one-participant-out accuracy {ok / n:.3f}, improvisations {oki / ni:.3f}, confusion rows=truth bd,sd,hh: {cm.tolist()}' + (f'; drum samples held out (vocal-only model): {okm / nm:.3f}' if nm else ''), file=sys.stderr)
sc = StandardScaler().fit(d[cols].values); m = fit(sc.transform(d[cols].values), d.voice.values, weight(d))
mach = d[d.part.astype(str) == 'machine']
if len(mach): print(f'drum samples, model trained on all: {(m.predict(sc.transform(mach[cols].values)) == mach.voice.values).mean():.3f}', file=sys.stderr)
W = m.coef_ / sc.scale_; b = m.intercept_ - (m.coef_ * sc.mean_ / sc.scale_).sum(1); order = [list(m.classes_).index(c) for c in labs]
lo, hi = d[cols].quantile(.005).values, d[cols].quantile(.995).values  # the model's range: a feature outside it (a synthetic hit's flatness) is clipped, a linear model must not extrapolate
print(json.dumps({'features': cols, 'classes': labs, 'w': [[round(float(v), 4) for v in W[i]] for i in order], 'b': [round(float(b[i]), 4) for i in order], 'lo': [round(float(v), 3) for v in lo], 'hi': [round(float(v), 3) for v in hi]}))
