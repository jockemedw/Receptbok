#!/usr/bin/env python3
"""Genererar PWA-ikoner för Receptboken — ren Python (zlib), inga bildbibliotek.

Design: lichen-grön platta med en linnefärgad tallrik (cirkel + innerring) —
samma Scandi/nature-palett som appen. Full-bleed → funkar som maskable.

Körs en gång: python3 scripts/generate-icons.py
Skriver icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png,
icons/apple-touch-icon.png (180×180).
"""
import os
import struct
import zlib

LICHEN = (122, 148, 130)   # #7a9482
LINEN  = (253, 252, 248)   # #fdfcf8
BIRCH  = (216, 210, 196)   # #d8d2c4
RUST   = (181, 106, 76)    # #b56a4c


def smoothstep(edge0, edge1, x):
    if x <= edge0:
        return 0.0
    if x >= edge1:
        return 1.0
    t = (x - edge0) / (edge1 - edge0)
    return t * t * (3 - 2 * t)


def blend(base, top, a):
    return tuple(round(b * (1 - a) + t * a) for b, t in zip(base, top))


def render(size, pad_scale=1.0):
    """pad_scale < 1 krymper motivet (mer luft för maskable-safe-zone)."""
    cx = cy = size / 2
    plate_r = size * 0.355 * pad_scale       # tallrikens ytterkant
    ring_r = size * 0.215 * pad_scale        # innerring (tallrikens brunn)
    ring_w = size * 0.018
    dot_r = size * 0.032                     # liten rust-prick = "rätt på tallriken"
    aa = max(1.0, size / 256)                # antialias-bredd i pixlar

    rows = []
    for y in range(size):
        row = bytearray()
        row.append(0)  # filter: None
        for x in range(size):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = (dx * dx + dy * dy) ** 0.5
            px = LICHEN
            # Tallrik (fylld cirkel)
            a_plate = 1 - smoothstep(plate_r - aa, plate_r + aa, d)
            if a_plate > 0:
                px = blend(px, LINEN, a_plate)
                # Innerring (stroke)
                ring_d = abs(d - ring_r)
                a_ring = 1 - smoothstep(ring_w - aa, ring_w + aa, ring_d)
                if a_ring > 0:
                    px = blend(px, BIRCH, a_ring * a_plate)
                # Rust-prick i mitten
                a_dot = 1 - smoothstep(dot_r - aa, dot_r + aa, d)
                if a_dot > 0:
                    px = blend(px, RUST, a_dot * a_plate)
            row.extend(px)
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path, size, pad_scale=1.0):
    raw = render(size, pad_scale)

    def chunk(tag, data):
        out = struct.pack(">I", len(data)) + tag + data
        return out + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print(f"  {path} ({size}×{size}, {len(png)} bytes)")


if __name__ == "__main__":
    root = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(root, exist_ok=True)
    print("Genererar ikoner:")
    write_png(os.path.join(root, "icon-192.png"), 192)
    write_png(os.path.join(root, "icon-512.png"), 512)
    write_png(os.path.join(root, "icon-maskable-512.png"), 512, pad_scale=0.82)
    write_png(os.path.join(root, "apple-touch-icon.png"), 180)
    print("Klart.")
