#!/usr/bin/env python3
# Usage: changelog-avoid.py GLOSSARY.md CHANGELOG.md. Exits 1 when the changelog prose uses a GLOSSARY _Avoid_ term.
import re, sys
g = open(sys.argv[1]).read(); c = open(sys.argv[2]).read()
heads = {h.strip().lower() for h in re.findall(r"^\*\*([^*\n]+)\*\*", g, flags=re.M)}
# Avoided words and phrases, short ones included (meal, mode, icon) and multi-word ones. An avoided word that is itself a
# GLOSSARY headword (Member is avoided for User but is a term of its own) is not avoided here.
avoid = set()
for m in re.finditer(r"_Avoid_\**:?\s*(.+)", g):
    for w in re.split(r"[,;]", m.group(1)):
        w = re.sub(r"[_*`.]", "", w).strip().lower()
        if w and w not in heads: avoid.add(w)
c = re.sub(r"```.*?```", " ", c, flags=re.S)
c = re.sub(r"`[^`\n]*`", " ", c)
c = re.sub(r"\]\([^)\n]*\)", "]", c)
c = re.sub(r"^\[[^\]\n]+\]:\s*\S+.*$", " ", c, flags=re.M)
c = re.sub(r"^#{1,6}\s*(Added|Changed|Deprecated|Removed|Fixed|Security)\s*$", " ", c, flags=re.M | re.I)
c = c.lower()
# Strip every multi-word GLOSSARY headword first (Meal Slot, Ready Meal, Planned Meal, Cook Mode, ...), longest first, so the
# avoided word inside it (meal, mode) does not match.
for h in sorted((h for h in heads if " " in h), key=len, reverse=True):
    c = re.sub(r"\b" + re.escape(h) + r"(s|es)?\b", " ", c)
# Other senses of an avoided word that are not the domain term.
allow = ["app icons", "icon styles", "icon payload", "migrations run", "replan runs", "app runs", "run the older image", "you run your own"]
for a in allow:
    c = c.replace(a, " ")
hits = sorted(w for w in avoid if re.search(r"\b" + re.escape(w) + r"(s|es)?\b", c))
if hits: print("avoid terms in changelog:", hits)
sys.exit(1 if hits else 0)
