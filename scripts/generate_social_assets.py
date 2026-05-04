#!/usr/bin/env python3
"""Generate Xiaohongshu promo cards for Why Am I Here?.

The output is deterministic PNG artwork, sized for social posts.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "social-assets" / "xiaohongshu"
W, H = 1080, 1440

FONT_REGULAR = "/System/Library/Fonts/Hiragino Sans GB.ttc"
FONT_FALLBACK = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"


def font(size, index=0):
    path = FONT_REGULAR if Path(FONT_REGULAR).exists() else FONT_FALLBACK
    return ImageFont.truetype(path, size=size, index=index)


F = {
    "hero": font(78),
    "title": font(64),
    "subtitle": font(38),
    "body": font(34),
    "small": font(25),
    "tiny": font(21),
    "badge": font(24),
    "mono": font(26),
}

INK = "#161821"
MUTED = "#616875"
SOFT = "#F8F6F0"
PAPER = "#FFFDF8"
PANEL = "#FFFFFF"
LINE = "#E3E6EC"
ORANGE = "#E86F2D"
ORANGE_SOFT = "#FFF0E8"
GREEN = "#1F8A5B"
BLUE = "#2266AA"
RED = "#D54842"
YELLOW = "#F4B942"


def new_card():
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    for y in range(0, H, 48):
        d.line((0, y, W, y), fill="#F0EDE5", width=1)
    for x in range(0, W, 48):
        d.line((x, 0, x, H), fill="#F4F1EA", width=1)
    d.rounded_rectangle((48, 48, W - 48, H - 48), radius=34, fill="#FFFDF9", outline="#EEE7DC", width=2)
    return img, d


def text_size(d, text, f):
    box = d.textbbox((0, 0), text, font=f)
    return box[2] - box[0], box[3] - box[1]


def draw_wrapped(d, text, xy, f, fill=INK, max_width=880, line_gap=12, max_lines=None):
    x, y = xy
    lines = []
    current = ""
    for ch in text:
        candidate = current + ch
        if ch == "\n":
            lines.append(current)
            current = ""
            continue
        if text_size(d, candidate, f)[0] <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = ch
    if current:
        lines.append(current)
    if max_lines:
        lines = lines[:max_lines]
    line_h = text_size(d, "测试", f)[1] + line_gap
    for line in lines:
        d.text((x, y), line, font=f, fill=fill)
        y += line_h
    return y


def centered(d, text, y, f, fill=INK):
    tw, th = text_size(d, text, f)
    d.text(((W - tw) / 2, y), text, font=f, fill=fill)
    return y + th


def badge(d, text, xy, fill=ORANGE_SOFT, fg=ORANGE):
    x, y = xy
    tw, th = text_size(d, text, F["badge"])
    d.rounded_rectangle((x, y, x + tw + 34, y + th + 18), radius=999, fill=fill)
    d.text((x + 17, y + 8), text, font=F["badge"], fill=fg)
    return x + tw + 42


def footer(d, idx, label="Why Am I Here? / 我咋在这？"):
    d.text((88, H - 118), label, font=F["tiny"], fill="#858B96")
    d.text((W - 156, H - 118), f"{idx}/7", font=F["tiny"], fill="#858B96")


def mock_browser(d, box, url="zhihu.com/feed"):
    x1, y1, x2, y2 = box
    d.rounded_rectangle(box, radius=20, fill=PANEL, outline=LINE, width=2)
    d.rounded_rectangle((x1, y1, x2, y1 + 76), radius=20, fill="#F3F5F8")
    d.rectangle((x1, y1 + 46, x2, y1 + 76), fill="#F3F5F8")
    for i, c in enumerate(["#D85B57", "#E7B545", "#58AA61"]):
        d.ellipse((x1 + 26 + i * 32, y1 + 29, x1 + 42 + i * 32, y1 + 45), fill=c)
    d.rounded_rectangle((x1 + 142, y1 + 22, x2 - 28, y1 + 54), radius=10, fill="#FFFFFF", outline="#E2E6EE")
    d.text((x1 + 162, y1 + 25), url, font=F["tiny"], fill="#777F8D")
    yy = y1 + 106
    for i in range(4):
        d.rounded_rectangle((x1 + 32, yy, x2 - 32, yy + 116), radius=18, fill="#FFFFFF", outline="#E9ECF2")
        d.rounded_rectangle((x1 + 56, yy + 22, x1 + 154, yy + 94), radius=14, fill="#E8EDF4")
        d.rounded_rectangle((x1 + 180, yy + 28, x2 - 70, yy + 42), radius=999, fill="#D9DEE7")
        d.rounded_rectangle((x1 + 180, yy + 58, x2 - 210, yy + 72), radius=999, fill="#E6EAF0")
        yy += 136


def draw_cross(d, cx, cy, size=54, fill=RED, width=7):
    half = size / 2
    d.line((cx - half, cy - half, cx + half, cy + half), fill=fill, width=width)
    d.line((cx + half, cy - half, cx - half, cy + half), fill=fill, width=width)


def draw_check(d, cx, cy, size=64, fill=GREEN, width=8):
    d.line((cx - size * 0.45, cy, cx - size * 0.12, cy + size * 0.32), fill=fill, width=width)
    d.line((cx - size * 0.12, cy + size * 0.32, cx + size * 0.48, cy - size * 0.38), fill=fill, width=width)


def card01():
    img, d = new_card()
    badge(d, "Chrome 插件", (88, 102))
    draw_wrapped(d, "我咋又\n刷起来了？", (88, 188), F["hero"], max_width=760, line_gap=18)
    draw_wrapped(d, "我做了个小工具，\n拦住无意识打开信息流的那一秒。", (90, 430), F["subtitle"], fill=MUTED, max_width=850, line_gap=12)
    mock_browser(d, (110, 615, 970, 1115), "xiaohongshu.com / explore")
    d.rounded_rectangle((570, 742, 930, 1038), radius=22, fill="#FFFFFF", outline="#E0E4EA", width=2)
    d.text((606, 780), "Why Am I Here?", font=F["body"], fill=INK)
    d.text((606, 837), "我为什么打开这里？", font=F["small"], fill=ORANGE)
    d.rounded_rectangle((606, 902, 890, 956), radius=12, fill=INK)
    d.text((660, 914), "写下目的", font=F["small"], fill="#FFFFFF")
    footer(d, 1)
    return img


def card02():
    img, d = new_card()
    badge(d, "真实问题", (88, 102), "#EEF5FF", BLUE)
    draw_wrapped(d, "不是不知道该做什么，\n是还没开始，\n手已经打开了信息流。", (88, 188), F["title"], max_width=900, line_gap=18)
    d.rounded_rectangle((92, 668, 500, 1068), radius=26, fill="#F1F6FF", outline="#D9E7FA", width=2)
    d.text((132, 718), "脑子里", font=F["body"], fill=BLUE)
    draw_wrapped(d, "写论文\n做项目\n开始学习", (132, 798), F["subtitle"], fill=INK, max_width=310, line_gap=20)
    d.rounded_rectangle((580, 668, 988, 1068), radius=26, fill=ORANGE_SOFT, outline="#F4D0BE", width=2)
    d.text((620, 718), "手上", font=F["body"], fill=ORANGE)
    draw_wrapped(d, "小红书\n知乎\nB 站", (620, 798), F["subtitle"], fill=INK, max_width=310, line_gap=20)
    d.text((497, 838), "→", font=font(72), fill="#9AA2AF")
    draw_wrapped(d, "失败发生在“已经滑进去”的那一刻。", (120, 1168), F["body"], fill=MUTED, max_width=820, line_gap=12)
    footer(d, 2)
    return img


def card03():
    img, d = new_card()
    badge(d, "核心功能", (88, 102), ORANGE_SOFT, ORANGE)
    draw_wrapped(d, "停留一会儿后，\n它只问一句：", (88, 188), F["title"], max_width=850, line_gap=18)
    d.rounded_rectangle((106, 520, 974, 1068), radius=32, fill="#FFFFFF", outline=LINE, width=2)
    d.text((154, 584), "Why Am I Here? / 我咋在这？", font=F["body"], fill=INK)
    badge(d, "zhihu.com", (154, 660))
    draw_wrapped(d, "你为什么打开这个网站？", (154, 740), F["title"], fill=INK, max_width=760, line_gap=14)
    d.rounded_rectangle((154, 890, 926, 1012), radius=18, fill="#FAFAFA", outline="#E0E4EA", width=2)
    d.text((184, 930), "写下这次浏览的目的...", font=F["small"], fill="#9AA2AF")
    draw_wrapped(d, "不是封锁网站，而是恢复意图。", (128, 1168), F["body"], fill=MUTED, max_width=840, line_gap=12)
    footer(d, 3)
    return img


def card04():
    img, d = new_card()
    badge(d, "交互设计", (88, 102), "#F7F4EA", "#9A6B16")
    draw_wrapped(d, "“随便看看”\n不算目的。", (88, 188), F["hero"], max_width=850, line_gap=18)
    d.rounded_rectangle((92, 560, 988, 770), radius=24, fill="#FFF6F5", outline="#F0C4C1", width=2)
    d.text((138, 606), "随便看看", font=F["subtitle"], fill=INK)
    draw_cross(d, 876, 638, size=54, fill=RED)
    d.text((138, 684), "太短、太模糊，不能提交", font=F["small"], fill=RED)
    d.rounded_rectangle((92, 830, 988, 1088), radius=24, fill="#F2FBF6", outline="#C9EAD8", width=2)
    draw_wrapped(d, "我想查一个关于拖延和启动困难的帖子，看看有没有产品 insight。", (138, 876), F["body"], fill=INK, max_width=680, line_gap=12)
    draw_check(d, 874, 928, size=72, fill=GREEN)
    d.text((138, 1010), "目的明确，可以继续", font=F["small"], fill=GREEN)
    footer(d, 4)
    return img


def card05():
    img, d = new_card()
    badge(d, "可调节", (88, 102), "#EEF5FF", BLUE)
    draw_wrapped(d, "严格一点，\n还是温和一点，\n你自己决定。", (88, 188), F["title"], max_width=850, line_gap=18)
    d.rounded_rectangle((138, 570, 942, 1086), radius=30, fill="#FFFFFF", outline=LINE, width=2)
    d.rectangle((138, 570, 942, 706), fill=INK)
    d.text((322, 610), "Why Am I Here?", font=F["subtitle"], fill="#FFFFFF")
    d.text((396, 660), "我咋在这？", font=F["small"], fill="#BBC1CB")
    d.text((188, 758), "提醒设置", font=F["body"], fill=INK)
    d.rounded_rectangle((188, 832, 516, 938), radius=18, fill="#FAFAFA", outline="#E1E5EC")
    d.text((218, 858), "提醒延迟", font=F["small"], fill=MUTED)
    d.text((218, 898), "5 秒", font=F["body"], fill=ORANGE)
    d.rounded_rectangle((564, 832, 892, 938), radius=18, fill="#FAFAFA", outline="#E1E5EC")
    d.text((594, 858), "最少字数", font=F["small"], fill=MUTED)
    d.text((594, 898), "10 字", font=F["body"], fill=ORANGE)
    d.rounded_rectangle((188, 980, 892, 1036), radius=16, fill=ORANGE)
    d.text((445, 993), "演示模式", font=F["small"], fill="#FFFFFF")
    footer(d, 5)
    return img


def card06():
    img, d = new_card()
    badge(d, "本地历史", (88, 102), "#F2FBF6", GREEN)
    draw_wrapped(d, "每一次被拉回来，\n都会留下记录。", (88, 188), F["title"], max_width=850, line_gap=18)
    d.rounded_rectangle((96, 528, 984, 1098), radius=28, fill="#FFFFFF", outline=LINE, width=2)
    d.text((146, 584), "历史记录", font=F["subtitle"], fill=INK)
    rows = [
        ("zhihu.com", "查拖延和启动困难的讨论"),
        ("bilibili.com", "看一个 Chrome 插件教程"),
        ("xiaohongshu.com", "找小红书宣传文案参考"),
    ]
    y = 680
    for domain, reason in rows:
        d.rounded_rectangle((146, y, 934, y + 112), radius=18, fill="#FAFAFA", outline="#ECEFF3")
        d.text((176, y + 24), domain, font=F["small"], fill=ORANGE)
        d.text((176, y + 62), reason, font=F["tiny"], fill=INK)
        y += 140
    draw_wrapped(d, "它记录的不是浏览历史，而是注意力为什么偏移。", (118, 1182), F["body"], fill=MUTED, max_width=850, line_gap=12)
    footer(d, 6)
    return img


def card07():
    img, d = new_card()
    badge(d, "开源试用", (88, 102), "#F7F4EA", "#9A6B16")
    draw_wrapped(d, "如果你也经常\n“我咋在这”，\n可以试试看。", (88, 188), F["title"], max_width=850, line_gap=18)
    d.rounded_rectangle((96, 600, 984, 1048), radius=30, fill="#FFFFFF", outline=LINE, width=2)
    d.text((146, 668), "GitHub", font=F["subtitle"], fill=INK)
    draw_wrapped(d, "github.com/LaugHan/whyamihere", (146, 742), F["body"], fill=BLUE, max_width=760, line_gap=10)
    d.line((146, 836, 934, 836), fill="#E7EAF0", width=2)
    steps = [
        "Chrome 打开 chrome://extensions",
        "开启开发者模式",
        "加载 why-am-i-here 文件夹",
    ]
    y = 884
    for i, step in enumerate(steps, 1):
        d.ellipse((146, y, 184, y + 38), fill=INK)
        d.text((158, y + 3), str(i), font=F["tiny"], fill="#FFFFFF")
        d.text((204, y + 2), step, font=F["small"], fill=INK)
        y += 58
    d.rounded_rectangle((150, 1138, 930, 1224), radius=18, fill=INK)
    d.text((270, 1160), "不是封锁，是恢复意图", font=F["body"], fill="#FFFFFF")
    footer(d, 7)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cards = [card01, card02, card03, card04, card05, card06, card07]
    for i, make in enumerate(cards, 1):
        path = OUT / f"{i:02d}-{[
            'cover',
            'problem',
            'checkpoint',
            'input-compare',
            'settings',
            'history',
            'install',
        ][i - 1]}.png"
        img = make()
        img.save(path, "PNG", optimize=True)
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
