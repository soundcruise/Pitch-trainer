#!/usr/bin/env python3
"""一度だけ実行: 親の PWA アイコンに (テスト) 透かしを載せて staging 用 PNG を出力する。"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
STAGING = Path(__file__).resolve().parent
TEXT = "(テスト)"

FONT_CANDIDATES = [
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", 0),
    ("/System/Library/Fonts/AppleSDGothicNeo.ttc", 0),
    ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 0),
]


def load_font(size: int):
    for path, index in FONT_CANDIDATES:
        p = Path(path)
        if not p.is_file():
            continue
        try:
            return ImageFont.truetype(str(p), size, index=index)
        except OSError:
            continue
    return ImageFont.load_default()


def watermark(src: Path, dst: Path) -> None:
    base = Image.open(src).convert("RGBA")
    w, h = base.size
    font_size = max(int(min(w, h) * 0.13), 14)
    font = load_font(font_size)

    bbox = ImageDraw.Draw(base).textbbox((0, 0), TEXT, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad = max(2, font_size // 8)
    layer = Image.new("RGBA", (tw + pad * 2, th + pad * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    stroke = max(1, font_size // 18)
    # やや透明の白＋薄い縁取りでアイコン上でも読める透かし
    draw.text(
        (pad, pad),
        TEXT,
        font=font,
        fill=(255, 255, 255, 115),
        stroke_width=stroke,
        stroke_fill=(0, 0, 0, 100),
    )
    angle = -24
    layer = layer.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)
    lw, lh = layer.size
    base.alpha_composite(layer, ((w - lw) // 2, (h - lh) // 2))
    base.save(dst, format="PNG")
    print("wrote", dst)


def main():
    watermark(ROOT / "icon_pwa_192.png", STAGING / "icon_pwa_192.png")
    watermark(ROOT / "icon_pwa_512.png", STAGING / "icon_pwa_512.png")


if __name__ == "__main__":
    main()
