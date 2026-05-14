#!/usr/bin/env python3
"""Build ZIM from static/ directory using zimmaker's packer."""
import os, sys, mimetypes

sys.path.insert(0, '/home/zimmaker')
from packer import ZimPacker

STATIC_DIR = os.path.join(os.path.dirname(__file__), 'zim_extracted')
OUTPUT_ZIM = os.path.join(os.path.dirname(__file__), 'pokemon-champions-dex.zim')

MIME_MAP = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
}

def get_mime(path):
    ext = os.path.splitext(path)[1].lower()
    return MIME_MAP.get(ext) or mimetypes.guess_type(path)[0] or 'application/octet-stream'

def main():
    entries = []
    main_page = None

    for root, dirs, files in os.walk(STATIC_DIR):
        for fname in files:
            fpath = os.path.join(root, fname)
            rel = os.path.relpath(fpath, STATIC_DIR).replace('\\', '/')
            mime = get_mime(fpath)

            with open(fpath, 'rb') as f:
                content = f.read()

            title = rel
            if rel == 'index.html':
                title = 'Pokemon Champions Pokedex'
                main_page = rel

            entries.append(('C', rel, title, mime, content))

    # Metadata
    entries.append(('M', 'Title', 'Title', 'text/plain', b'Pokemon Champions Pokedex'))
    entries.append(('M', 'Description', 'Description', 'text/plain', b'Pokemon Champions Pokedex - offline'))
    entries.append(('M', 'Creator', 'Creator', 'text/plain', b'pokechampions-calc'))
    entries.append(('M', 'Language', 'Language', 'text/plain', b'jpn'))

    import time
    entries.append(('M', 'Date', 'Date', 'text/plain', time.strftime("%Y-%m-%d").encode('utf-8')))

    print(f"Total entries: {len(entries)}")

    # Use packer's _write_zim directly
    packer = ZimPacker.__new__(ZimPacker)
    packer.output_zim = OUTPUT_ZIM
    packer._log = print
    packer._write_zim(entries, main_page)

    size = os.path.getsize(OUTPUT_ZIM)
    print(f"ZIM built: {OUTPUT_ZIM} ({size:,} bytes)")

if __name__ == '__main__':
    main()
