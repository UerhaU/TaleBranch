"""Recover localization keys from the already extracted Sims tuning (read-only)."""
import json
import pathlib
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'local-data/access-catalogs/research'
OUT = ROOT / 'local-data/catalog-localization'
OUT.mkdir(exist_ok=True)
records = json.loads((RESEARCH / 'merged.json').read_text('utf-8'))
by_name = {r['name']: r for r in records}
by_id = {r['id']: r for r in records}
nodes = {}
for record in records:
    try:
        nodes[record['id']] = ET.fromstring(record['xml'])
    except ET.ParseError:
        pass
catalog = json.loads((ROOT / 'src/data/game-catalog.json').read_text('utf-8'))


def keys(node, *fields, nested=False):
    if node is None:
        return []
    values = [node.findtext(('.//' if nested else '') + f"T[@n='{field}']") for field in fields]
    return [int(v, 16) for v in values if v and v.startswith('0x') and int(v, 16)]


def track_details(rid, visited=None):
    visited = set() if visited is None else visited
    if rid in visited or rid not in nodes:
        return []
    visited.add(rid)
    node = nodes[rid]
    levels = [keys(nodes.get(n.text), 'title') for n in node.findall("L[@n='career_levels']/T")]
    result = [{'name': keys(node, 'career_name_gender_neutral', 'career_name'), 'levels': levels}]
    for branch in node.findall("L[@n='branches']/T"):
        result += track_details(branch.text, visited)
    return result


result = {}
for kind, entries in catalog['entries'].items():
    for entry in entries:
        record = by_name.get(entry['id'])
        node = nodes.get(record['id']) if record else None
        ref = {}
        if kind in ['traits', 'occults', 'deathCauses']:
            ref = {'label': keys(node, 'display_name_gender_neutral', 'display_name'), 'description': keys(node, 'trait_description')}
        elif kind == 'breeds':
            ref = {'label': keys(node, 'breed_display_name'), 'description': keys(node, 'breed_description')}
        elif kind == 'skills':
            ref = {'label': keys(node, 'stat_name'), 'description': keys(node, 'stat_description')}
        elif kind == 'aspirations':
            category = nodes.get(node.findtext("T[@n='category']")) if node is not None else None
            ref = {'label': keys(node, 'display_text'), 'description': keys(node, 'description_text'), 'category': keys(category, 'display_text')}
        elif kind == 'preferences' and node is not None:
            like = nodes.get(node.findtext("T[@n='like']"))
            category = nodes.get(node.findtext("T[@n='cas_preference_category']"))
            ref = {'label': keys(like, 'display_name_gender_neutral', 'display_name'), 'description': keys(like, 'trait_description'), 'category': keys(category, 'enabled_display_name', nested=True)}
        elif kind == 'careers' and node is not None:
            start = node.findtext("T[@n='start_track']")
            track = nodes.get(start)
            ref = {'label': keys(track, 'career_name_gender_neutral', 'career_name'), 'description': keys(track, 'career_description'), 'tracks': track_details(start)}
        result[kind + ':' + entry['id']] = ref
(OUT / 'string-refs.json').write_text(json.dumps(result, ensure_ascii=False), 'utf-8')
print('Catalog references:', len(result))
