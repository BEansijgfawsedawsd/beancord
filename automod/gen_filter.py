"""Builds the slur-filter regex once and emits it for JS (browser) and Postgres (trigger).
Terms are kept ROT13-encoded so the source stays readable; edit TERMS to tune the list.
Each term = (core, [suffixes], plural_ok). Suffixes are optional endings; '' is allowed implicitly.
Rules the pattern enforces:
  - letters can be swapped for look-alikes (leet): 1 ! | for i, @ 4 for a, 3 for e, 0 for o, $ 5 for s, etc.
  - letters may repeat (niggggger) and may be split by 1-2 separator chars (n.i.g.g.e.r, n i g g e r)
  - a doubled letter in the term must stay doubled (so "niger" the country does not match, "nigger" does)
  - must start and end on a word edge (so "snigger", "niggardly", "raccoon", "retardant" are NOT hit)
"""
import codecs, json, re, sys

R = lambda s: codecs.decode(s, 'rot13')
TERMS = [
    # (core, suffixes, plural)       -- rot13
    ('avtt', ['re', 'n', 'nu', 'hu', 'nm'], True),
    ('avoo', ['n', 'nu', 're'], True),
    ('snt', ['tbg', 'tl', 'tvg', 't'], True),
    ('xvxr', [], True),
    ('puvax', ['l'], True),
    ('fcvp', [], True),
    ('tbbx', [], True),
    ('jrgonpx', [], True),
    ('ornare', [], True),
    ('pbba', [], True),
    ('qlxr', [], True),
    ('genaal', [], True),
    ('ergneq', ['rq'], True),
    ('cnxv', [], True),
    ('gbjryurnq', [], True),
    ('enturnq', [], True),
]
LEET = {
    'a': 'a@4^', 'b': 'b8', 'c': 'c(<', 'e': 'e3', 'g': 'gq96', 'i': 'i1!|l', 'l': 'l1|', 'o': 'o0',
    's': 's5$z', 't': 't7+', 'u': 'uv', 'z': 'z2s',
}
SEP_JS = r"""[\s._\-*~'"|/\\,+]{0,2}"""
SEP_PG = r"""[[:space:]._*~'"/,+-]{0,2}"""      # no backslash/pipe inside brackets (Postgres ARE)

def cls(ch, pg):
    chars = LEET.get(ch, ch)
    if pg:
        # inside a Postgres bracket expression: put ] ^ - at safe spots, drop specials we cannot escape
        safe = ''.join(c for c in chars if c not in '\\]^-')
        if ']' in chars: safe = ']' + safe
        if '^' in chars: safe = safe + '^'
        chars = safe
        return '[' + chars + ']'
    chars = chars.replace('\\', '\\\\').replace(']', '\\]').replace('^', '\\^').replace('-', '\\-')
    return '[' + chars + ']'

def word(w, pg, sep):
    """letters of w; runs of k identical letters must appear >= k times (repeats/separators allowed)"""
    out = ''
    for m in re.finditer(r'((.)\2*)', w):
        k, ch = len(m.group(1)), m.group(2)
        out += '(?:' + cls(ch, pg) + sep + '){' + str(k) + ',}'
    return out

def build(pg):
    sep = SEP_PG if pg else SEP_JS
    parts = []
    for core, sufs, plural in TERMS:
        core = R(core)
        sufs = [R(x) for x in sufs]
        body = word(core, pg, sep)
        if sufs:
            body += '(?:' + '|'.join(word(x, pg, sep) for x in sufs) + ')?'
        if plural:
            body += '(?:' + cls('s', pg) + sep + '){0,2}'
        parts.append(body)
    core = '(?:' + '|'.join(parts) + ')'
    if pg:
        return '(^|[^[:alpha:]])' + core + '($|[^[:alpha:]])'
    return r'(?<![\p{L}])' + core + r'(?![\p{L}])'

if __name__ == '__main__':
    js, pg = build(False), build(True)
    json.dump({'js': js, 'pg': pg}, open(sys.argv[1], 'w'))
    print('js len', len(js), 'pg len', len(pg))
