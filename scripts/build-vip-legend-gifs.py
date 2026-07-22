#!/usr/bin/env python3
"""Build the animated VIP avatar and card-frame GIF assets."""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


RESAMPLE = Image.Resampling.LANCZOS


def gif_frame(image: Image.Image, alpha_threshold: int = 36) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    palette_image = rgba.convert("RGB").quantize(
        colors=255,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.FLOYDSTEINBERG,
    )
    transparent = alpha.point(lambda value: 255 if value <= alpha_threshold else 0)
    palette_image.paste(255, mask=transparent)
    palette = palette_image.getpalette()
    palette[255 * 3 : 255 * 3 + 3] = [0, 255, 0]
    palette_image.putpalette(palette)
    palette_image.info["transparency"] = 255
    palette_image.info["disposal"] = 2
    return palette_image


def perimeter_point(progress: float, width: int, height: int, inset: float) -> tuple[float, float]:
    left = inset
    top = inset
    right = width - inset
    bottom = height - inset
    horizontal = right - left
    vertical = bottom - top
    distance = (progress % 1.0) * (2 * horizontal + 2 * vertical)
    if distance < horizontal:
        return left + distance, top
    distance -= horizontal
    if distance < vertical:
        return right, top + distance
    distance -= vertical
    if distance < horizontal:
        return right - distance, bottom
    return left, bottom - (distance - horizontal)


def add_energy_spark(image: Image.Image, x: float, y: float, scale: float, cyan: bool = True) -> None:
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    color = (47, 190, 255) if cyan else (255, 215, 111)
    for radius, alpha in ((15 * scale, 35), (9 * scale, 70), (4 * scale, 190)):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(*color, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(max(1, int(3 * scale))))
    image.alpha_composite(glow)
    crisp = ImageDraw.Draw(image)
    crisp.line((x - 7 * scale, y, x + 7 * scale, y), fill=(235, 252, 255, 220), width=max(1, int(scale)))
    crisp.line((x, y - 7 * scale, x, y + 7 * scale), fill=(235, 252, 255, 220), width=max(1, int(scale)))


def build_avatar_frames(source: Path, size: int = 384, frame_count: int = 18) -> list[Image.Image]:
    base = Image.open(source).convert("RGBA").resize((size, size), RESAMPLE)
    frames: list[Image.Image] = []
    for index in range(frame_count):
        phase = index / frame_count
        pulse = 0.98 + 0.055 * (0.5 + 0.5 * math.sin(phase * math.tau))
        frame = ImageEnhance.Brightness(base).enhance(pulse)
        x, y = perimeter_point(phase, size, size, size * 0.055)
        add_energy_spark(frame, x, y, size / 384)
        x2, y2 = perimeter_point((phase + 0.5) % 1.0, size, size, size * 0.055)
        add_energy_spark(frame, x2, y2, size / 520, cyan=False)
        crown_glow = Image.new("RGBA", frame.size, (0, 0, 0, 0))
        crown_draw = ImageDraw.Draw(crown_glow)
        crown_alpha = int(35 + 45 * (0.5 + 0.5 * math.sin(phase * math.tau)))
        crown_draw.ellipse((size * 0.425, size * 0.015, size * 0.575, size * 0.19), fill=(67, 190, 255, crown_alpha))
        crown_glow = crown_glow.filter(ImageFilter.GaussianBlur(size * 0.028))
        frame.alpha_composite(crown_glow)
        frames.append(gif_frame(frame))
    return frames


def draw_card_base(scale: int = 2) -> Image.Image:
    width, height = 112 * scale, 140 * scale
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    inset = 3 * scale
    radius = 11 * scale
    draw.rounded_rectangle((inset, inset, width - inset, height - inset), radius=radius, outline=(239, 204, 101, 255), width=6 * scale)
    draw.rounded_rectangle((inset + 3 * scale, inset + 3 * scale, width - inset - 3 * scale, height - inset - 3 * scale), radius=radius - 3 * scale, outline=(218, 228, 242, 255), width=3 * scale)
    draw.rounded_rectangle((inset + 5 * scale, inset + 5 * scale, width - inset - 5 * scale, height - inset - 5 * scale), radius=radius - 5 * scale, outline=(28, 40, 62, 255), width=3 * scale)
    draw.rounded_rectangle((inset + 7 * scale, inset + 7 * scale, width - inset - 7 * scale, height - inset - 7 * scale), radius=radius - 6 * scale, outline=(55, 181, 248, 235), width=1 * scale)
    cx = width // 2
    draw.polygon(((cx, 2 * scale), (cx + 7 * scale, 8 * scale), (cx, 16 * scale), (cx - 7 * scale, 8 * scale)), fill=(55, 181, 248, 255), outline=(245, 213, 111, 255))
    bx, by = 94 * scale, 126 * scale
    draw.ellipse((bx - 14 * scale, by - 14 * scale, bx + 14 * scale, by + 14 * scale), fill=(12, 18, 30, 255), outline=(245, 211, 101, 255), width=2 * scale)
    stroke = max(1, scale)
    gold = (247, 218, 121, 255)
    draw.line((84 * scale, 119 * scale, 87 * scale, 133 * scale), fill=gold, width=stroke)
    draw.line((87 * scale, 119 * scale, 87 * scale, 133 * scale), fill=gold, width=stroke)
    draw.line((90 * scale, 119 * scale, 90 * scale, 133 * scale), fill=gold, width=stroke)
    draw.line((90 * scale, 119 * scale, 94 * scale, 133 * scale), fill=gold, width=stroke)
    draw.line((98 * scale, 133 * scale, 98 * scale, 119 * scale), fill=gold, width=stroke)
    draw.arc((98 * scale, 119 * scale, 106 * scale, 127 * scale), 270, 90, fill=gold, width=stroke)
    return image


def build_card_frames(frame_count: int = 18) -> list[Image.Image]:
    scale = 2
    base = draw_card_base(scale)
    width, height = base.size
    frames: list[Image.Image] = []
    for index in range(frame_count):
        phase = index / frame_count
        frame = base.copy()
        x, y = perimeter_point(phase, width, height, 7 * scale)
        add_energy_spark(frame, x, y, 0.58 * scale)
        badge = Image.new("RGBA", frame.size, (0, 0, 0, 0))
        badge_draw = ImageDraw.Draw(badge)
        alpha = int(32 + 58 * (0.5 + 0.5 * math.sin(phase * math.tau)))
        badge_draw.ellipse((76 * scale, 108 * scale, 112 * scale, 144 * scale), fill=(54, 181, 255, alpha))
        badge = badge.filter(ImageFilter.GaussianBlur(5 * scale))
        frame.alpha_composite(badge)
        frame = frame.resize((112, 140), RESAMPLE)
        frames.append(gif_frame(frame, alpha_threshold=44))
    return frames


def save_gif(frames: list[Image.Image], output: Path, duration: int) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        output,
        save_all=True,
        append_images=frames[1:],
        loop=0,
        duration=duration,
        transparency=255,
        disposal=2,
        optimize=False,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--avatar-source", type=Path, required=True)
    parser.add_argument("--avatar-gif", type=Path, required=True)
    parser.add_argument("--card-gif", type=Path, required=True)
    args = parser.parse_args()
    save_gif(build_avatar_frames(args.avatar_source), args.avatar_gif, duration=90)
    save_gif(build_card_frames(), args.card_gif, duration=90)


if __name__ == "__main__":
    main()
