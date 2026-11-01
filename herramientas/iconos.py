# Fecha: 2026-11-01
# Ruta: F:\APP\kebat\herramientas\iconos.py
# Genera el icono de la app Kebat (fondo crema redondeado + 🥙 en color con la
# fuente de emojis de Windows) y lo deja en todos los tamaños que piden
# Android (mipmaps + adaptativo) e iOS (AppIcon 1024).

from PIL import Image, ImageDraw, ImageFont
import os

RAIZ = os.path.join(os.path.dirname(__file__), '..')
FUENTE = r'C:\Windows\Fonts\seguiemj.ttf'

def base(lado, margen_pct=0.14, fondo='#fff3e0', borde='#c0392b', radio_pct=0.22):
    img = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(lado * radio_pct)
    d.rounded_rectangle([0, 0, lado - 1, lado - 1], radius=r, fill=fondo,
                        outline=borde, width=max(2, lado // 28))
    # El emoji en color: Pillow lo saca de la fuente de emojis de Windows
    tam = int(lado * (1 - 2 * margen_pct))
    f = ImageFont.truetype(FUENTE, tam)
    caja = d.textbbox((0, 0), '🥙', font=f, embedded_color=True)
    x = (lado - (caja[2] - caja[0])) // 2 - caja[0]
    y = (lado - (caja[3] - caja[1])) // 2 - caja[1]
    d.text((x, y), '🥙', font=f, embedded_color=True)
    return img

def cuadrado(lado, fondo='#fff3e0'):
    # Para iOS (sin transparencia) y el adaptativo de Android
    img = Image.new('RGBA', (lado, lado), fondo)
    d = ImageDraw.Draw(img)
    tam = int(lado * 0.62)
    f = ImageFont.truetype(FUENTE, tam)
    caja = d.textbbox((0, 0), '🥙', font=f, embedded_color=True)
    x = (lado - (caja[2] - caja[0])) // 2 - caja[0]
    y = (lado - (caja[3] - caja[1])) // 2 - caja[1]
    d.text((x, y), '🥙', font=f, embedded_color=True)
    return img

# --- Android: mipmaps clásicos + redondo + adaptativo ---
DPIS = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for dpi, lado in DPIS.items():
    carpeta = os.path.join(RAIZ, 'android', 'app', 'src', 'main', 'res', f'mipmap-{dpi}')
    os.makedirs(carpeta, exist_ok=True)
    base(lado).save(os.path.join(carpeta, 'ic_launcher.png'))
    # Redondo: el mismo dibujo recortado en círculo
    img = cuadrado(lado)
    mascara = Image.new('L', (lado, lado), 0)
    ImageDraw.Draw(mascara).ellipse([0, 0, lado - 1, lado - 1], fill=255)
    img.putalpha(mascara)
    img.save(os.path.join(carpeta, 'ic_launcher_round.png'))
    # Primer plano del adaptativo: el sistema lo recorta, el emoji va al 45 %
    fg_lado = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}[dpi]
    fg = Image.new('RGBA', (fg_lado, fg_lado), (0, 0, 0, 0))
    d = ImageDraw.Draw(fg)
    tam = int(fg_lado * 0.45)
    f = ImageFont.truetype(FUENTE, tam)
    caja = d.textbbox((0, 0), '🥙', font=f, embedded_color=True)
    x = (fg_lado - (caja[2] - caja[0])) // 2 - caja[0]
    y = (fg_lado - (caja[3] - caja[1])) // 2 - caja[1]
    d.text((x, y), '🥙', font=f, embedded_color=True)
    fg.save(os.path.join(carpeta, 'ic_launcher_foreground.png'))

# Fondo del adaptativo: crema liso (lo referencia ic_launcher_background.xml o color)
valores = os.path.join(RAIZ, 'android', 'app', 'src', 'main', 'res', 'values')
with open(os.path.join(valores, 'ic_launcher_background.xml'), 'w', encoding='utf-8') as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FFF3E0</color>\n</resources>\n')

# --- iOS: un único 1024 sin alfa ---
ios_set = os.path.join(RAIZ, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset')
icono = cuadrado(1024).convert('RGB')
icono.save(os.path.join(ios_set, 'AppIcon-512@2x.png'))

print('Iconos generados (Android mipmaps + adaptativo, iOS 1024).')
