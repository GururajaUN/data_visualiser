"""Build config/karnataka-map.js from the KGIS district GeoJSON.
Topology-preserving simplification: borders shared by two districts are split into
chains at junction vertices and each chain is simplified once, so neighbours stay aligned."""
import json, math, sys, collections

SRC = sys.argv[1]
OUT = sys.argv[2]
TOL = float(sys.argv[3]) if len(sys.argv) > 3 else 0.004   # degrees
W = 1000.0

g = json.load(open(SRC))

def polys(geo):
    if geo['type'] == 'GeometryCollection':
        for s in geo['geometries']: yield from polys(s)
    elif geo['type'] == 'Polygon': yield geo['coordinates']
    elif geo['type'] == 'MultiPolygon':
        for p in geo['coordinates']: yield p

def key(c): return (round(c[0], 6), round(c[1], 6))

feats = []
for i, f in enumerate(g['features']):
    p = f['properties']
    d = p.get('description')
    v = d.get('value', '') if isinstance(d, dict) else str(d or '')
    import re, html
    t = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', v)))
    lgd = re.search(r'LGD_DistrictCode (\d+)', t)
    name = p['name'].strip()
    name = {'Kolara': 'Kolar', 'Kalaburgi': 'Kalaburagi', 'Bengaluru (Urban)': 'Bengaluru Urban', 'Bengaluru (Rural)': 'Bengaluru Rural'}.get(name, name)
    rings = []
    for poly in polys(f['geometry']):
        for ri, r in enumerate(poly):
            pts = [key(c) for c in r]
            if pts[0] == pts[-1]: pts = pts[:-1]
            # drop consecutive duplicates
            pts = [q for j, q in enumerate(pts) if j == 0 or q != pts[j - 1]]
            if len(pts) >= 3: rings.append({'pts': pts, 'hole': ri > 0})
    feats.append({'name': name, 'lgd': lgd.group(1) if lgd else None, 'rings': rings})

owners = collections.defaultdict(set)
for i, f in enumerate(feats):
    for r in f['rings']:
        for q in r['pts']: owners[q].add(i)

def dp(pts, tol):
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1e-12
        best, bi = -1, -1
        for k in range(a + 1, b):
            px, py = pts[k]
            dist = abs(dy * px - dx * py + bx * ay - by * ax) / L if L > 1e-12 else math.hypot(px - ax, py - ay)
            if dist > best: best, bi = dist, k
        if best > tol:
            keep[bi] = True; stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]

cache = {}
def simplify_chain(chain):
    canon = chain if chain[0] <= chain[-1] else chain[::-1]
    k = (canon[0], canon[-1], len(canon), hash(tuple(canon)))
    if k not in cache: cache[k] = dp(canon, TOL)
    s = cache[k]
    return s if canon is chain else s[::-1]

outline_chains = []
for f in feats:
    out = []
    for r in f['rings']:
        pts = r['pts']; n = len(pts)
        junction = [len(owners[pts[j]]) >= 3 or owners[pts[j]] != owners[pts[j - 1]] or owners[pts[j]] != owners[pts[(j + 1) % n]] for j in range(n)]
        idx = [j for j in range(n) if junction[j]]
        if not idx:  # unshared ring: anchor at 0 and the farthest point
            far = max(range(n), key=lambda j: (pts[j][0] - pts[0][0]) ** 2 + (pts[j][1] - pts[0][1]) ** 2)
            idx = [0, far]
        res = []
        for a, b in zip(idx, idx[1:] + [idx[0] + n]):
            chain = [pts[j % n] for j in range(a, b + 1)]
            s = simplify_chain(chain)
            res += s[:-1]
            if len(owners[chain[len(chain) // 2]]) == 1 and not r['hole']: outline_chains.append(s)
        if len(res) >= 3: out.append({'pts': res, 'hole': r['hole']})
    f['simple'] = out

# projection
allp = [q for f in feats for r in f['simple'] for q in r['pts']]
lon0, lon1 = min(p[0] for p in allp), max(p[0] for p in allp)
lat0, lat1 = min(p[1] for p in allp), max(p[1] for p in allp)
cosm = math.cos(math.radians((lat0 + lat1) / 2))
S = W / ((lon1 - lon0) * cosm)
H = (lat1 - lat0) * S
def P(q): return ((q[0] - lon0) * cosm * S, (lat1 - q[1]) * S)
def fmt(v): return ('%.1f' % v).rstrip('0').rstrip('.')
def path(rings):
    out = []
    for r in rings:
        xy = [P(q) for q in r['pts']]
        s = 'M' + fmt(xy[0][0]) + ' ' + fmt(xy[0][1])
        px, py = xy[0]
        for x, y in xy[1:]:
            s += 'l' + fmt(x - px) + ' ' + fmt(y - py); px, py = round(px + float(fmt(x - px)), 1), round(py + float(fmt(y - py)), 1)
        out.append(s + 'z')
    return ''.join(out)

districts = []
for f in feats:
    big = max(f['simple'], key=lambda r: len(r['pts']))
    xy = [P(q) for q in big['pts']]
    # area-weighted centroid
    A = cx = cy = 0
    for (x1, y1), (x2, y2) in zip(xy, xy[1:] + xy[:1]):
        c = x1 * y2 - x2 * y1; A += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c
    A /= 2
    districts.append({'name': f['name'], 'lgd': f['lgd'], 'd': path(f['simple']), 'cx': round(cx / (6 * A), 1), 'cy': round(cy / (6 * A), 1)})

outline = ''.join('M' + ' L'.join(fmt(P(q)[0]) + ' ' + fmt(P(q)[1]) for q in ch) for ch in outline_chains)
data = {'viewBox': [0, 0, round(W, 1), round(H, 1)], 'proj': {'lon0': lon0, 'lat1': lat1, 'cos': cosm, 'S': S},
        'districts': districts, 'outline': outline,
        'source': 'KGIS (Karnataka GIS) district boundaries, 31 districts; simplified for display (tolerance %.4f°)' % TOL}
js = '/* Generated by scripts/build_map.py — do not edit. */\nwindow.RC = window.RC || {};\nRC.MAP = ' + json.dumps(data, separators=(',', ':')) + ';\n'
open(OUT, 'w').write(js)

# polygons in lon/lat for point-in-polygon checks (simplified)
json.dump([{'name': f['name'], 'rings': [{'pts': r['pts'], 'hole': r['hole']} for r in f['simple']]} for f in feats], open(OUT + '.pip.json', 'w'))
print('districts', len(districts), 'points', len(allp), 'size KB', len(js) // 1024, 'viewBox', data['viewBox'])
