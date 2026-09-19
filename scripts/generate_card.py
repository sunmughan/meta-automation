#!/usr/bin/env python3
"""
scripts/generate_card.py
Renders crisp, high-impact 1080x1080 dark-mode graphics and multi-slide carousels
for CodeAir Software Solutions, PixelGo HMS, and Agentic AI content.
"""

import sys
import json
import os
import textwrap
from PIL import Image, ImageDraw, ImageFont

FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'

def get_fonts():
    return {
        'title': ImageFont.truetype(FONT_BOLD, 42),
        'title_large': ImageFont.truetype(FONT_BOLD, 52),
        'subtitle': ImageFont.truetype(FONT_BOLD, 26),
        'body': ImageFont.truetype(FONT_REGULAR, 24),
        'body_bold': ImageFont.truetype(FONT_BOLD, 24),
        'badge': ImageFont.truetype(FONT_BOLD, 18),
        'footer': ImageFont.truetype(FONT_REGULAR, 20),
        'footer_bold': ImageFont.truetype(FONT_BOLD, 22),
    }

def render_card(data, output_path):
    fonts = get_fonts()
    img = Image.new('RGB', (1080, 1080), color=(12, 16, 26))
    draw = ImageDraw.Draw(img)

    # 1. Background radial/glow accent
    glow_color = data.get('glow_color', (0, 240, 255))
    for i in range(140, 0, -2):
        alpha = int(35 * (1 - i / 140))
        r = int(glow_color[0] * alpha / 100)
        g = int(glow_color[1] * alpha / 100)
        b = int(glow_color[2] * alpha / 100)
        draw.ellipse([820 - i*3, -120 - i*2, 1220 + i*3, 280 + i*2], fill=(12 + r, 16 + g, 26 + b))

    # 2. Top accent bar
    accent_rgb = tuple(data.get('accent_rgb', [0, 240, 255]))
    draw.rectangle([80, 50, 1000, 54], fill=accent_rgb)

    # 3. Category badge
    badge_text = data.get('badge', 'CODEAIR INSIGHTS').upper()
    badge_w = len(badge_text) * 14 + 40
    draw.rounded_rectangle([80, 80, 80 + badge_w, 124], radius=8, fill=(22, 30, 48), outline=accent_rgb, width=2)
    draw.text((100, 93), badge_text, font=fonts['badge'], fill=accent_rgb)

    # Slide indicator if part of carousel (e.g. "SLIDE 1 OF 5")
    if 'slide_num' in data and 'total_slides' in data:
        slide_text = f"SLIDE {data['slide_num']} / {data['total_slides']}"
        draw.text((1000 - len(slide_text)*14, 93), slide_text, font=fonts['badge'], fill=(140, 160, 190))

    # 4. Title (with auto-wrap)
    y_pos = 160
    title_text = data.get('title', '')
    title_lines = textwrap.wrap(title_text, width=32)
    for line in title_lines:
        draw.text((80, y_pos), line, font=fonts['title_large'], fill=(255, 255, 255))
        y_pos += 64

    # Subtitle or hook
    subtitle_text = data.get('subtitle', '')
    if subtitle_text:
        y_pos += 8
        sub_lines = textwrap.wrap(subtitle_text, width=48)
        for s_line in sub_lines:
            draw.text((80, y_pos), s_line, font=fonts['subtitle'], fill=accent_rgb)
            y_pos += 38

    y_pos += 24

    # 5. Content Cards / Sections
    sections = data.get('sections', [])
    for sec in sections:
        sec_title = sec.get('title', '')
        sec_color = tuple(sec.get('color', [0, 240, 255]))
        sec_items = sec.get('items', [])

        # Calculate exact height based on total wrapped lines
        total_lines = 0
        processed_items = []
        for item in sec_items:
            w_lines = textwrap.wrap(f"• {item}", width=54)
            processed_items.append(w_lines)
            total_lines += len(w_lines)

        card_top = y_pos
        card_h = 80 + total_lines * 38
        draw.rounded_rectangle([80, card_top, 1000, card_top + card_h], radius=16, fill=(19, 26, 42), outline=(35, 48, 76), width=1)

        draw.text((115, card_top + 22), sec_title, font=fonts['subtitle'], fill=sec_color)
        item_y = card_top + 70
        for w_lines in processed_items:
            for w_line in w_lines:
                draw.text((115, item_y), w_line, font=fonts['body'], fill=(210, 220, 235))
                item_y += 36
            item_y += 6  # Spacing between items
        y_pos = card_top + card_h + 24

    # 6. Footer Branding
    footer_box_top = 920
    draw.rounded_rectangle([80, footer_box_top, 1000, 1020], radius=14, fill=(15, 22, 36), outline=(35, 48, 76), width=1)
    footer_title = data.get('footer_title', 'CodeAir Software Solutions  •  Sunmughan Swamy')
    footer_sub = data.get('footer_sub', 'Building scalable SaaS, AI agent workflows & unified business software')
    draw.text((115, footer_box_top + 24), footer_title, font=fonts['footer_bold'], fill=(255, 255, 255))
    draw.text((115, footer_box_top + 60), footer_sub, font=fonts['footer'], fill=(130, 145, 170))

    # Save
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, quality=95)
    return output_path

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python3 generate_card.py '<json_data>' <output_path>")
        sys.exit(1)
    
    raw_data = sys.argv[1]
    out_file = sys.argv[2]
    card_spec = json.loads(raw_data)
    rendered = render_card(card_spec, out_file)
    print(json.dumps({'success': True, 'path': rendered}))
