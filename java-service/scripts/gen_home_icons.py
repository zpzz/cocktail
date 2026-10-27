"""Generate Ionicons-like outline PNGs for home quick entries (transparent bg)."""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "src/main/resources/static-assets/images/home"
OUT.mkdir(parents=True, exist_ok=True)
COLOR = (243, 75, 47, 255)  # #f34b2f
SIZE = 256
STROKE = 14


def blank() -> Image.Image:
    return Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))


def save(img: Image.Image, name: str) -> None:
    path = OUT / name
    img.save(path, "PNG")
    print("wrote", path)


def main() -> None:
    # chatbubble-ellipses-outline
    img = blank()
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((40, 36, 216, 170), radius=48, outline=COLOR, width=STROKE)
    d.line([(78, 158), (58, 214), (118, 168)], fill=COLOR, width=STROKE)
    for cx in (88, 128, 168):
        d.ellipse((cx - 10, 94, cx + 10, 114), fill=COLOR)
    save(img, "chat.png")

    # flask-outline
    img = blank()
    d = ImageDraw.Draw(img)
    d.line([(108, 36), (108, 100)], fill=COLOR, width=STROKE)
    d.line([(148, 36), (148, 100)], fill=COLOR, width=STROKE)
    d.line([(100, 36), (156, 36)], fill=COLOR, width=STROKE)
    d.line([(108, 100), (56, 210)], fill=COLOR, width=STROKE)
    d.line([(148, 100), (200, 210)], fill=COLOR, width=STROKE)
    d.arc((56, 170, 200, 230), 0, 180, fill=COLOR, width=STROKE)
    d.line([(78, 168), (178, 168)], fill=COLOR, width=STROKE - 2)
    save(img, "flask.png")

    # wine-outline
    img = blank()
    d = ImageDraw.Draw(img)
    d.line([(56, 98), (128, 36), (200, 98)], fill=COLOR, width=STROKE)
    d.line([(56, 98), (200, 98)], fill=COLOR, width=STROKE)
    d.arc((56, 98, 200, 200), 0, 180, fill=COLOR, width=STROKE)
    d.line([(128, 200), (128, 220)], fill=COLOR, width=STROKE)
    d.line([(80, 228), (176, 228)], fill=COLOR, width=STROKE)
    save(img, "wine.png")

    # grid-outline
    img = blank()
    d = ImageDraw.Draw(img)
    gap = 18
    cell = 70
    ox, oy = 44, 44
    for r in range(2):
        for c in range(2):
            x0 = ox + c * (cell + gap)
            y0 = oy + r * (cell + gap)
            d.rounded_rectangle(
                (x0, y0, x0 + cell, y0 + cell),
                radius=14,
                outline=COLOR,
                width=STROKE,
            )
    save(img, "grid.png")


if __name__ == "__main__":
    main()
