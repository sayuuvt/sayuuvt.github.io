"""Gera os assets otimizados do site a partir das imagens originais do canal.

Uso: python tools/optimize-images.py [pasta_origem]
Os originais ficam fora do repo; só os resultados em assets/ são versionados.
"""
import sys
from pathlib import Path
from PIL import Image

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"E:\Midia\Imagens\SaYuuVT\Canal")
OUT = Path(__file__).resolve().parent.parent / "assets"
OUT.mkdir(exist_ok=True)
Image.MAX_IMAGE_PIXELS = None


def save(img, name, **kw):
    path = OUT / name
    img.save(path, **kw)
    print(f"{name}: {path.stat().st_size // 1024} KB {img.size}")


def fit_width(img, width):
    return img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)


# Background desktop (16:9)
bg = Image.open(SRC / "image.png").convert("RGB")
save(fit_width(bg, 1920), "bg.webp", quality=78, method=6)

# Background mobile: recorte retrato centrado na mesa/personagem principal
crop_w = int(bg.height * 0.75)
left = int(bg.width * 0.25)
mobile = bg.crop((left, 0, left + crop_w, bg.height))
save(mobile.resize((1200, 1600), Image.LANCZOS), "bg-mobile.webp", quality=76, method=6)

# Logo
logo = Image.open(SRC / "4-gradiente.png").convert("RGBA")
logo.thumbnail((900, 900), Image.LANCZOS)
save(logo, "logo.webp", quality=90, method=6)

# Favicon quadrado com a logo centralizada
favicon = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
small = logo.copy()
small.thumbnail((240, 240), Image.LANCZOS)
favicon.paste(small, ((256 - small.width) // 2, (256 - small.height) // 2), small)
save(favicon, "favicon.png")

# Avatar
avatar = Image.open(SRC / "sayuu2.png").convert("RGB")
avatar.thumbnail((640, 640), Image.LANCZOS)
save(avatar, "avatar.webp", quality=86, method=6)

# Imagem de compartilhamento (Open Graph) 1200x630: bg escurecido + logo
og = fit_width(bg, 1200)
top = (og.height - 630) // 2
og = og.crop((0, top, 1200, top + 630))
og = Image.blend(og, Image.new("RGB", og.size, (5, 6, 16)), 0.55)
og_logo = logo.copy()
og_logo.thumbnail((620, 420), Image.LANCZOS)
og.paste(og_logo, ((1200 - og_logo.width) // 2, (630 - og_logo.height) // 2), og_logo)
save(og, "og-image.jpg", quality=85)
