"""Generate deterministic decoder fixtures, not product artwork (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

folder = Path(__file__).resolve().parents[1] / "artifacts/validation/wallpaper-fixtures"
folder.mkdir(parents=True, exist_ok=True)
for name, size, color in [("01-grid.png", (1600, 800), "#203b47"), ("02-large.jpg", (6000, 4000), "#384333"), ("03-small.webp", (800, 400), "#49384e")]:
    image = Image.new("RGB", size, color)
    draw = ImageDraw.Draw(image)
    for x in range(0, size[0], 100):
        draw.line((x, 0, x, size[1]), fill="#618478", width=2)
    for y in range(0, size[1], 100):
        draw.line((0, y, size[0], y), fill="#618478", width=2)
    image.save(folder / name)
(folder / "04-invalid.jpg").write_text("Intentionally invalid image for decoder validation")
print(folder)
