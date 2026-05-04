"""Generate PNG icons for Why Am I Here? extension using Pillow."""
import os
from PIL import Image, ImageDraw, ImageFont

def create_icon(size, filepath):
    """Create a rounded-rect icon with '?' in the center."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = 1 if size <= 16 else 2
    radius = max(size // 5, 3)

    # Dark background rounded rect
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=(26, 26, 46, 255)
    )

    # Draw "?" in center
    font_size = int(size * 0.65)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', font_size)
    except (IOError, OSError):
        try:
            font = ImageFont.truetype('/System/Library/Fonts/SFNSDisplay.ttf', font_size)
        except (IOError, OSError):
            try:
                font = ImageFont.truetype('/System/Library/Fonts/PingFang.ttc', font_size)
            except (IOError, OSError):
                font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), '?', font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1]

    draw.text((x, y), '?', fill=(255, 255, 255, 255), font=font)

    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    img.save(filepath, 'PNG')
    print(f'Created {filepath} ({size}x{size})')


if __name__ == '__main__':
    base = os.path.dirname(os.path.abspath(__file__))
    create_icon(16, os.path.join(base, 'icons', 'icon16.png'))
    create_icon(48, os.path.join(base, 'icons', 'icon48.png'))
    create_icon(128, os.path.join(base, 'icons', 'icon128.png'))
    print('Done!')
