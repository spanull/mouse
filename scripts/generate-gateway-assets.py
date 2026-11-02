"""开发期生图入口：按用户确认的原型制作素材，失败立即重试并打印错误，不输出图片 base64。"""

import argparse
import base64
import datetime
import json
import os
import pathlib
import subprocess
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "art-source/generated"
REFERENCE = ROOT / "art-source/reference/user-prototype.png"
STYLE = """Match the attached user's game prototype closely in ART STYLE, not its UI layout:
intricate cozy storybook PIXEL ART, crisp tiny square pixel clusters, warm dark-brown outlines,
soft sage and moss greens, cream parchment, dusty rose, honey wood, muted lavender,
soft warm lighting, adorable round woodland rodents, handcrafted miniature world.
Not vector art, not geometric placeholders, not smooth 3D, not realistic photography.
No text, letters, numbers, watermarks, UI panels, buttons, borders, or labels.
Create an original game asset inspired by the reference, not a screenshot or phone mockup.
"""
CHARACTERS = {
    "rat": "a cute round fancy rat, warm taupe fur, cream muzzle, pink round ears, sage-green overalls with a small beige pocket, a thin curved tail",
    "hamster": "a chubby golden Syrian hamster, creamy white cheeks and belly, tiny round ears, dusty-rose apron, tiny tail",
    "field": "a small cinnamon-brown field mouse, cream muzzle, large round ears, mustard-yellow overalls, thin curved tail",
    "chinchilla": "a fluffy silver-gray chinchilla, large rounded ears, white belly, muted lavender apron, fluffy curved tail",
    "dormouse": "a sleepy hazel-brown dormouse, cream cheeks, soft dark eye markings, dusty teal apron, soft fluffy tail",
    "mole": "an original kindly plump true European MOLE bartender, velvety charcoal-brown fur, NO external ears, NO visible tail, a long tapered pink muzzle with a broad pink nose, tiny gentle bead eyes, very broad shovel-shaped front paws with short cream claws, cream shirt, olive waistcoat and bow tie. Must clearly read as a MOLE, NOT a mouse, rat or hamster. Do not copy any existing cartoon character. The blink pose must close BOTH eyes, not wink",
}
SCENES = {
    "home": """One full-bleed square background of a mouse's woodland home. A charming moss-roofed
round cottage with an arched wooden door centered at x=50%, y=32%, tiny glowing windows,
pink flowering tree on left and leafy tree on right. Cottage occupies the upper 45%.
A pale sandy winding path opens into a quiet central clearing across the lower 55%,
with daisies, clover, mushrooms and grasses framing the left and right edges.
Center x=50%, y=55% must be empty to overlay a separate mouse sprite.
Lower left and lower right have unobstructed ground for overlay signs.
Soft blue sky and clouds at the top. No characters, animals, signs or furniture in the clearing.""",
    "restaurant": """One full-bleed square interior background of a tiny woodland mouse restaurant.
Warm cream and blush plaster walls, shelves of ceramic jars, hanging copper pots, herbs,
rustic timber cabinets. Straight-on view, upper half contains decor, center remains calm.
A horizontal wooden serving counter runs across image at y=43%, front apron ends at 57%.
Leave x=36% to 64%, y=20% to 48% empty for a separate chef sprite.
Small dishes on far left and right of counter, center clear. Lower half is wooden plank floor.
Warm morning light. No people, rodents, characters, chef hats, labels or lettering.""",
    "bar": """One full-bleed square background of a welcoming woodland tree-hollow bar at dusk.
Dense moss and leafy canopy frame top and sides, tiny amber fairy lights, carved tree interior,
colorful small bottles on shelves at y=18%-32%. Cozy dim golden light inside, soft sage meadow outside.
Horizontal wood bar counter top exactly at y=47%, front ends at y=59%.
Leave the center above counter, x=38%-62%, y=25%-46%, empty for a separate mole bartender.
EXACTLY THREE empty round wooden bar stools at x=27%,50%,73%, seats at y=70%.
Lower quarter is sandy ground with white daisies and pale pink flowers along edges.
No characters, no customers, no animals, no posters, no menu boards, no text.""",
}


def task_prompt(asset):
    """按资源标识生成可追溯的英文提示词；固定网格和留白供后续切帧及透明处理使用。"""
    ui_tasks = json.loads((ROOT / "art-source/ui-tasks.json").read_text(encoding="utf-8"))
    if asset in ui_tasks:
        return ui_tasks[asset]["prompt"], ui_tasks[asset]["size"]
    if asset in SCENES:
        return STYLE + SCENES[asset], "1024x1024"
    if asset in CHARACTERS:
        return STYLE + """Produce a precise animation reference sheet: EXACTLY 3 equal columns and
2 equal rows, six cells, NO drawn grid lines. Each cell contains ONE full-body rendition
of the SAME character, same costume, body proportions, camera, scale and face.
""" + CHARACTERS[asset] + """.
All six characters front-facing with a slight three-quarter turn, centered in their cell,
ears and tail fully visible, generous margins, feet on same baseline (85% of cell height).
Read cells left to right, top row then bottom row:
1. relaxed standing, open gentle eyes, paws at sides.
2. identical relaxed standing with eyes gently CLOSED for a blink.
3. crouching slightly in anticipation of a tiny hop, paws bent.
4. tiny happy hop, both feet raised slightly, paws out to the sides.
5. smiling with both paws raised in celebration.
6. smiling and waving one paw.
Strictly a 3 by 2 sheet, all six figures completely isolated. FLAT SOLID PURE MAGENTA
BACKGROUND #FF00FF in every cell and every gap, no gradients, no texture, no ground,
no shadows, no props, no colored sparkles. Magenta is only a removable key background;
the character must use natural browns, greens, cream and pink, NEVER magenta clothing.
Do not include elements from the attached UI overview other than its art style.
""", "1536x1024"
    if asset == "dishes":
        return STYLE + """A game item sheet with EXACTLY 3 columns and 2 rows of equally sized cells,
six completely isolated different dishes, one per cell, centered with wide empty margins.
Read left to right, top to bottom: 1 mushroom rice with green herbs, 2 spicy tomato pasta,
3 colorful vegetable stir fry, 4 golden cheese gratin, 5 braised mushroom stew,
6 berry tart with cream. Each dish on its own cream ceramic plate with brown rim.
Cozy appetizing pixel food illustration viewed slightly from above, consistent plate scale.
Flat solid pure magenta #FF00FF background, no shadows outside plates, no text or grid lines.
""", "1536x1024"
    if asset == "drinks":
        return STYLE + """A game item sheet with EXACTLY 2 columns and 2 rows of equally sized cells,
four completely isolated elegant fantasy cocktails, one per cell, full glass visible.
Top left: pink strawberry drink in a coupe with berry and tiny mint leaf.
Top right: pale mint-green drink in a stemmed glass with lime slice and mint sprig.
Bottom left: sunset-orange drink in a rounded goblet with orange slice.
Bottom right: lavender-purple drink in a coupe with blueberry and a tiny gold star garnish.
Warm cream glass highlights, brown pixel outlines, delicate glass stems, cute intricate pixels.
Same visual scale, centered in cells with large margins, no hands or characters.
Flat solid pure magenta #FF00FF background, no shadows, no text or grid lines.
""", "1024x1024"
    raise ValueError("未知素材：" + asset)


def generate(asset, key):
    """独立生成单项资源；响应从 curl 管道解码落盘，成功即停止，失败原文反馈后立即重试。

    已有成功记录会跳过以避免重复付费；更新同一素材时需先另存旧原图及记录。
    本地文件错误直接抛出，避免因磁盘问题重复购买已成功生成的图片。
    """
    record_path = OUTPUT / (asset + ".json")
    if record_path.exists():
        record = json.loads(record_path.read_text(encoding="utf-8"))
        if (ROOT / record["file"]).is_file():
            print("SKIP " + asset + ": 已有成功产物", flush=True)
            return
    prompt, size = task_prompt(asset)
    # 所有类别统一注入制作约束；历史成功原图保持原始记录，不倒填为使用过新提示词。
    contract_path = ROOT / "art-source/generation-constraints.json"
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    prompt += "\n\n" + contract["prompt"]
    reference_data = base64.b64encode(REFERENCE.read_bytes()).decode("ascii")
    payload = {"model": "gpt-image-2.5", "prompt": prompt, "image": ["data:image/png;base64," + reference_data], "size": size, "quality": "medium", "n": 1, "output_format": "png"}
    reference_files = [REFERENCE.relative_to(ROOT).as_posix()]
    ui_tasks = json.loads((ROOT / "art-source/ui-tasks.json").read_text(encoding="utf-8"))
    extra_reference = ui_tasks.get(asset, {}).get("reference")
    if extra_reference:
        payload["image"].append("data:image/png;base64," + base64.b64encode((ROOT / extra_reference).read_bytes()).decode("ascii"))
        reference_files.append(extra_reference)
    if asset in CHARACTERS and asset not in ("rat", "mole") and (OUTPUT / "rat.png").exists():
        payload["image"].append("data:image/png;base64," + base64.b64encode((OUTPUT / "rat.png").read_bytes()).decode("ascii"))
        payload["prompt"] += " Image 2 is the approved main rat sheet: match its rendering, body scale and pixel density, but retain this requested species and clothing."
        reference_files.append("art-source/generated/rat.png")
    body = json.dumps(payload, ensure_ascii=False)
    if len(body.encode("utf-8")) > 10 * 1024 * 1024:
        raise ValueError("请求体超过网关 10 MB 上限")
    config = "\n".join(['url = "https://aicoding.aideb.me/v1/images/generations"', 'request = "POST"', 'header = "Content-Type: application/json"', 'header = "Authorization: Bearer ' + key + '"', 'data = ' + json.dumps(body, ensure_ascii=False)])
    attempt = 0
    while True:
        attempt += 1
        print(f"START {asset} attempt={attempt}", flush=True)
        process = subprocess.Popen(["curl.exe" if os.name == "nt" else "curl", "-sS", "-m", "300", "--config", "-"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        try:
            process.stdin.write(config.encode("utf-8"))
            process.stdin.close()
            result = json.load(process.stdout)
        except (json.JSONDecodeError, UnicodeDecodeError, BrokenPipeError) as error:
            process.wait()
            print(f"FAIL {asset}: {error}", flush=True)
            continue
        code = process.wait()
        if code or not isinstance(result, dict) or not result.get("data"):
            error = {k: result[k] for k in ("error", "code", "message", "detail") if k in result} if isinstance(result, dict) else {"message": "响应不是 JSON 对象"}
            print(f"FAIL {asset} curl={code}: " + json.dumps(error, ensure_ascii=False), flush=True)
            continue
        item = result["data"][0]
        try:
            raw = base64.b64decode(item["b64_json"], validate=True)
        except (KeyError, ValueError, TypeError) as error:
            print(f"FAIL {asset}: 图片字段缺失或编码无效 ({type(error).__name__})", flush=True)
            continue
        ext = "png" if raw.startswith(b"\x89PNG") else "jpg" if raw.startswith(b"\xff\xd8") else "webp" if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP" else None
        if ext is None:
            print(f"FAIL {asset}: 返回内容不是 PNG/JPEG/WebP", flush=True)
            continue
        output = OUTPUT / (asset + "." + ext)
        output.write_bytes(raw)
        record = {"asset": asset, "file": output.relative_to(ROOT).as_posix(), "provider": "AI Coding Gateway", "model": payload["model"], "endpoint": "/v1/images/generations", "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "prompt": payload["prompt"], "requestedSize": size, "quality": "medium", "referenceFiles": reference_files, "bytes": len(raw), "attempts": attempt}
        record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"SAVED {asset}: {output} ({len(raw)} bytes)", flush=True)
        return


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", nargs="*", default=["home", "rat", "restaurant", "bar", *[key for key in CHARACTERS if key != "rat"], "dishes", "drinks"])
    parser.add_argument("--workers", type=int, default=4, choices=range(1, 9), help="同时制作的素材数量，默认 4")
    args = parser.parse_args()
    api_key = os.environ.get("GATEWAY_API_KEY")
    if not api_key:
        raise SystemExit("请在当前进程设置 GATEWAY_API_KEY；不要将真实密钥写进代码或文档。")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(generate, asset, api_key) for asset in dict.fromkeys(args.assets)]
        for future in futures:
            future.result()
