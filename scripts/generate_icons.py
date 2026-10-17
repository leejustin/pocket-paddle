"""Create the Android adaptive icon and splash artwork from simple geometry."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / 'assets'
root.mkdir(exist_ok=True)
green = '#174e38'
lime = '#d7f16f'

def draw_ball(image, center, radius):
    draw = ImageDraw.Draw(image)
    x, y = center
    draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=lime)
    for dx, dy in [(0, -.54), (-.49, -.12), (.49, -.12), (-.29, .47), (.29, .47)]:
        hole = radius * .12
        cx, cy = x + dx * radius, y + dy * radius
        draw.ellipse((cx-hole, cy-hole, cx+hole, cy+hole), fill=green)

# The iOS app icon is drawn separately: assets/icon.svg, exported to icon.png as an opaque 1024x1024 PNG.
adaptive = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
draw_ball(adaptive, (512, 512), 270)
adaptive.save(root / 'adaptive-icon.png')
splash = Image.new('RGBA', (600, 600), (0, 0, 0, 0))
draw_ball(splash, (300, 300), 170)
splash.save(root / 'splash.png')
print('Generated adaptive icon and splash artwork.')
