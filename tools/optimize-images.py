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

# Imagem de compartilhamento (Open Graph) 1200x630 — Discord, WhatsApp, X etc.
# Mesmo layout do site: foto com anel neon à esquerda, logo à direita, sobre o bg escurecido.
import math
from PIL import ImageChops, ImageDraw, ImageFilter

W, H = 1200, 630
RING = [(255, 0, 60), (255, 217, 176), (0, 200, 192), (0, 224, 255), (255, 91, 232), (255, 0, 60)]


def ring_color(t):
    pos = (t % 1.0) * (len(RING) - 1)
    i = int(pos)
    f = pos - i
    a, b = RING[i], RING[min(i + 1, len(RING) - 1)]
    return tuple(round(a[k] + (b[k] - a[k]) * f) for k in range(3))


def conic_disc(size):
    """Disco com gradiente cônico (equivalente ao conic-gradient do CSS do site)."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    c = size / 2
    for y in range(size):
        for x in range(size):
            ang = (math.degrees(math.atan2(y - c, x - c)) + 90 - 210) % 360
            px[x, y] = ring_color(ang / 360)
    return img


def circle_mask(size, scale=4):
    big = Image.new("L", (size * scale, size * scale), 0)
    ImageDraw.Draw(big).ellipse((0, 0, size * scale - 1, size * scale - 1), fill=255)
    return big.resize((size, size), Image.LANCZOS)


og = fit_width(bg, W)
top = (og.height - H) // 2
og = og.crop((0, top, W, top + H))
og = Image.blend(og, Image.new("RGB", og.size, (5, 6, 16)), 0.62)

# Vinheta: bordas escuras, centro mais claro
vig = Image.new("L", (W, H), 0)
ImageDraw.Draw(vig).ellipse((-W * 0.15, -H * 0.35, W * 1.15, H * 1.35), fill=255)
vig = vig.filter(ImageFilter.GaussianBlur(120))
og = Image.composite(og, Image.blend(og, Image.new("RGB", og.size, (3, 4, 10)), 0.7), vig)

AV, RING_W = 330, 12
av_img = Image.open(SRC / "sayuu2.png").convert("RGB").resize((AV - RING_W * 2, AV - RING_W * 2), Image.LANCZOS)
disc = conic_disc(AV)

# Logo (largura alvo) e posições: grupo foto+logo centralizado
lg = logo.copy()
lg.thumbnail((560, 400), Image.LANCZOS)
GAP = 48
total = AV + GAP + lg.width
x0 = (W - total) // 2
ay = (H - AV) // 2
lx, ly = x0 + AV + GAP, (H - lg.height) // 2

# Brilho (glow) atrás do anel e da logo
glow = Image.new("RGB", (W, H), (0, 0, 0))
glow.paste(disc, (x0, ay), circle_mask(AV))
glow_logo = Image.new("RGB", lg.size, (0, 200, 192))
glow.paste(glow_logo, (lx, ly), lg.getchannel("A"))
glow = glow.filter(ImageFilter.GaussianBlur(34))
og = ImageChops.screen(og, Image.eval(glow, lambda v: int(v * 0.55)))

# Sombra da logo
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sh_alpha = Image.new("L", (W, H), 0)
sh_alpha.paste(lg.getchannel("A"), (lx + 6, ly + 10))
shadow.putalpha(sh_alpha.filter(ImageFilter.GaussianBlur(14)))
og.paste(shadow, (0, 0), shadow)

# Anel + foto + logo
og.paste(disc, (x0, ay), circle_mask(AV))
inner = AV - RING_W * 2
og.paste(av_img, (x0 + RING_W, ay + RING_W), circle_mask(inner))
og.paste(lg, (lx, ly), lg)

save(og, "og-image.jpg", quality=88)
