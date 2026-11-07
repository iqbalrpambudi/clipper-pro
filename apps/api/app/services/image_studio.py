import json
import logging
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decrypt_secret
from app.core.storage import storage
from app.models.config import ModelConfig
from app.models.image_preset import ImagePreset
from app.services.ai_adapters.factory import get_active_llm_adapter, get_active_vision_adapter
from app.services.image_gen import generate_image_to_path, resolve_image_credentials

log = logging.getLogger(__name__)

DEFAULT_DOODLE_STYLE_PROMPT = (
    "Minimalist stickman doodle art style, hand-drawn ink illustration. "
    "Iconic stick-figure characters with smooth round bald white heads, expressive solid black dot eyes, thin black stick limbs, wearing simple draped robes. "
    "Clean black ink linework, warm vintage aged parchment paper background texture, soft sepia and earthy terracotta watercolor washes."
)

DEFAULT_DOODLE_PRESET = {
    "id": "doodle-ilustrasi",
    "name": "Doodle Ilustrasi",
    "description": "Gaya sketsa stickman berkepala bulat botak di atas kertas parchment kuno, tinta hitam ekspresif, dan sapuan cat air hangat sepia.",
    "category": "doodle",
    "preset_type": "style",
    "master_prompt": DEFAULT_DOODLE_STYLE_PROMPT,
    "negative_prompt": "No 3D CGI, no photorealism, no modern digital glossy gradients, no clutter, no digital text artifacts, no blurry details, no photorealistic humans, black bars, letterbox, pillarbox, white borders, borders, frame, margins, padding, split screen.",
    "reference_image_url": "/storage/presets/doodle_ref.png",
    "preview_image_url": "/storage/presets/doodle_preview.png",
    "user_text_input": "Doodle stickman hitam putih vintage parchment watercolor",
    "style_attributes": {
        "medium": "Hand-drawn ink sketch & watercolor wash",
        "linework": "Clean, confident black ink linework with subtle sketchy hatching",
        "palette": [
            "Aged Cream (#F5E6CA)",
            "Sandy Beige (#E6D2B5)",
            "Warm Sepia (#704214)",
            "Terracotta Ochre (#CC7722)",
            "Solid Black (#111111)",
        ],
        "lighting": "Soft warm vintage parchment ambient illumination",
        "character_style": "Minimalist stick-figure, smooth round bald white head without hair, expressive solid black dot eyes, draped robes and fabric folds",
        "composition": "Dynamic storytelling composition, clean staging, balanced negative space",
    },
    "is_builtin": True,
    "is_active": True,
}


async def seed_default_image_presets(db: AsyncSession) -> None:
    """Ensure the default 'Doodle Ilustrasi' preset exists and sync active preset with ModelConfig."""
    preset = await db.get(ImagePreset, DEFAULT_DOODLE_PRESET["id"])
    if not preset:
        res = await db.execute(select(ImagePreset).where(ImagePreset.is_active == True))
        active_preset = res.scalar_one_or_none()

        new_preset = ImagePreset(
            id=DEFAULT_DOODLE_PRESET["id"],
            name=DEFAULT_DOODLE_PRESET["name"],
            description=DEFAULT_DOODLE_PRESET["description"],
            category=DEFAULT_DOODLE_PRESET["category"],
            preset_type=DEFAULT_DOODLE_PRESET["preset_type"],
            master_prompt=DEFAULT_DOODLE_PRESET["master_prompt"],
            negative_prompt=DEFAULT_DOODLE_PRESET["negative_prompt"],
            reference_image_url=DEFAULT_DOODLE_PRESET["reference_image_url"],
            preview_image_url=DEFAULT_DOODLE_PRESET["preview_image_url"],
            user_text_input=DEFAULT_DOODLE_PRESET["user_text_input"],
            style_attributes=DEFAULT_DOODLE_PRESET["style_attributes"],
            is_builtin=True,
            is_active=(active_preset is None),
        )
        db.add(new_preset)
        await db.commit()
        log.info("Seeded default 'Doodle Ilustrasi' image preset.")
    else:
        if preset.is_builtin:
            if not preset.reference_image_url:
                preset.reference_image_url = DEFAULT_DOODLE_PRESET["reference_image_url"]
            if not preset.preview_image_url:
                preset.preview_image_url = DEFAULT_DOODLE_PRESET["preview_image_url"]
            if not preset.style_attributes or "border vignette" in str(preset.style_attributes):
                preset.style_attributes = DEFAULT_DOODLE_PRESET["style_attributes"]
            if "border vignette" in (preset.master_prompt or ""):
                preset.master_prompt = DEFAULT_DOODLE_PRESET["master_prompt"]
            if "letterbox" not in (preset.negative_prompt or ""):
                preset.negative_prompt = DEFAULT_DOODLE_PRESET["negative_prompt"]
            await db.commit()


async def get_active_image_preset(db: AsyncSession) -> Optional[ImagePreset]:
    """Retrieve the currently active image preset for Ilustrasi AI."""
    res = await db.execute(select(ImagePreset).where(ImagePreset.is_active == True).limit(1))
    preset = res.scalar_one_or_none()
    if not preset:
        preset = await db.get(ImagePreset, "doodle-ilustrasi")
    return preset


async def set_active_image_preset(db: AsyncSession, preset_id: str) -> ImagePreset:
    """Activate an image preset and sync its master prompt to model_configs.image_system_prompt."""
    target = await db.get(ImagePreset, preset_id)
    if not target:
        raise ValueError(f"Image preset '{preset_id}' tidak ditemukan")

    await db.execute(update(ImagePreset).values(is_active=False))
    target.is_active = True

    res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
    cfg = res.scalar_one_or_none()
    if cfg:
        cfg.image_system_prompt = target.master_prompt

    await db.commit()
    await db.refresh(target)
    log.info("Activated image preset '%s' (%s) and synced to model_config", target.name, target.id)
    return target


def _clean_json_output(raw_text: str) -> Dict[str, Any]:
    """Extract and parse clean JSON dict from raw LLM output."""
    clean = (raw_text or "").strip()
    clean = re.sub(r"<think>[\s\S]*?</think>", "", clean).strip()
    clean = re.sub(r"^```json\s*", "", clean, flags=re.MULTILINE)
    clean = re.sub(r"\s*```$", "", clean, flags=re.MULTILINE)

    json_match = re.search(r"\{[\s\S]*\}", clean)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except Exception:
            pass

    try:
        return json.loads(clean)
    except Exception:
        pass

    return {}


async def analyze_visual_style(
    user_text: Optional[str] = "",
    reference_image_paths: Optional[List[str]] = None,
    reference_image_path: Optional[str] = None,
    preset_type: str = "style",
    db: Optional[AsyncSession] = None,
) -> Dict[str, Any]:
    """
    Reverse-engineers visual style and synthesizes a master prompt from user text and/or reference images.
    Uses Multimodal Vision model when reference images are supplied.
    """
    clean_text = (user_text or "").strip()

    # Collect and validate all reference image paths
    paths: List[str] = []
    if reference_image_paths:
        paths.extend(reference_image_paths)
    if reference_image_path and reference_image_path not in paths:
        paths.append(reference_image_path)
    valid_paths = [p for p in paths if Path(p).exists() and Path(p).is_file()]

    has_images = len(valid_paths) > 0
    has_text = bool(clean_text)

    source_descriptions = []
    if has_text:
        source_descriptions.append(f'USER CONCEPT & CREATIVE DIRECTION:\n"{clean_text}"')
    if has_images:
        source_descriptions.append(
            f"VISUAL REFERENCE IMAGES: {len(valid_paths)} reference image(s) provided. "
            "Analyze these images as the primary visual style reference."
        )
    source_context = (
        "\n\n".join(source_descriptions)
        if source_descriptions
        else "No specific source provided. Generate a high quality illustration style."
    )

    prompt_instruction = (
        "You are a World-Class AI Art Director & Master Prompt Engineer specializing in image models (FLUX, Midjourney v6, SDXL).\n\n"
        "Your task: Engineer an exquisite, cohesive Art Style Preset (Master Prompt) based on the user's visual art source.\n\n"
        f"{source_context}\n\n"
        "CORE DIRECTIVES:\n"
        "1. Extract the unifying artistic DNA across the reference(s):\n"
        "   - Medium & execution: (e.g. hand-drawn ink sketch, watercolor wash, vintage parchment illustration, digital cel animation, gouache, linocut).\n"
        "   - Linework & contouring: (e.g. clean confident ink lines, sketchy pencil cross-hatching, lineless painterly, bold graphic outlines).\n"
        "   - Figure & character stylization: (if figures or characters appear or are implied, describe how they are rendered stylistically—e.g. minimalist stick-figure with bald round head and expressive dot eyes, stylized anime proportions, or semi-realistic ink anatomy).\n"
        "   - Color palette & lighting: (dominant tones, accent colors, color temperature, lighting atmosphere, contrast).\n"
        "   - Surface texture: (e.g. aged tea-stained parchment, watercolor paper grain, smooth matte, subtle ink bleed).\n"
        "2. DO NOT copy transient scene content: Do not copy specific temporary subjects, plot actions, temporary props, or exact camera angles from the reference images. The preset will be used to illustrate diverse story scenes later. Only the visual rendering style, artistic medium, figure conventions, linework, and palette should be defined.\n"
        "3. MASTER PROMPT RULES:\n"
        "   - Formulate a cohesive, vivid 'master_prompt' in English (60-140 words).\n"
        "   - Focus strictly on the visual aesthetic, artistic medium, figure styling conventions, linework, color palette, and atmosphere.\n"
        "   - DO NOT include aspect ratio instructions (e.g. NO 'Widescreen 16:9', NO 'Full bleed', NO 'NOT square, NOT vertical'). Aspect ratio is handled by generation configuration.\n"
        "   - DO NOT include meta-instructions like 'Apply this visual treatment only' or 'Visual scene: ...'.\n"
        "4. NEGATIVE PROMPT:\n"
        "   - Exclude elements conflicting with this aesthetic (e.g. photorealism, 3D CGI, glossy digital gradients, blurry details, unwanted grain/noise).\n"
        "5. STRUCTURED ATTRIBUTES:\n"
        "   - Extract medium, linework, palette (4-5 color names with hex codes), lighting, character_style, and composition.\n\n"
        "OUTPUT STRICTLY VALID JSON ONLY, matching this schema:\n"
        "{\n"
        '  "name": "Nama Preset Singkat & Menarik (Bahasa Indonesia)",\n'
        '  "category": "doodle" | "watercolor" | "comic" | "anime" | "vintage" | "cinematic" | "custom",\n'
        '  "preset_type": "style",\n'
        '  "description": "Ringkasan gaya visual dalam 1-2 kalimat Bahasa Indonesia",\n'
        '  "master_prompt": "Pure artistic style description in English focusing on medium, linework, figure rendering, palette, and texture.",\n'
        '  "negative_prompt": "Negative prompt exclusions in English.",\n'
        '  "style_attributes": {\n'
        '    "medium": "Art medium description",\n'
        '    "linework": "Linework style",\n'
        '    "palette": ["Color Name (#HEX)", "Color Name (#HEX)", "Color Name (#HEX)", "Color Name (#HEX)"],\n'
        '    "lighting": "Lighting atmosphere",\n'
        '    "character_style": "Figure / character rendering style",\n'
        '    "composition": "Storytelling layout and balanced negative space"\n'
        '  }\n'
        "}"
    )

    parsed: Dict[str, Any] = {}

    if db:
        try:
            if valid_paths:
                adapter = await get_active_vision_adapter(db)
                log.info(
                    "Analyzing %d reference image(s) with multimodal vision adapter...",
                    len(valid_paths),
                )
                raw_res = await adapter.analyze_multimodal(
                    prompt=prompt_instruction,
                    image_paths=valid_paths,
                    system_prompt="You are a professional AI art director and master prompt engineer.",
                    json_mode=True,
                )
                parsed = _clean_json_output(raw_res)
            else:
                adapter = await get_active_llm_adapter(db)
                log.info("Synthesizing style preset from text prompt using LLM adapter...")
                raw_res = await adapter.generate_chat(
                    prompt=prompt_instruction,
                    system_prompt="You are a professional AI art director and master prompt engineer. Output strictly valid JSON.",
                    json_mode=True,
                )
                parsed = _clean_json_output(raw_res)
        except Exception as e:
            log.warning(
                "AI model analysis encountered an error: %s. Using intelligent heuristic synthesis.",
                e,
            )

    name = parsed.get("name") or (
        f"Preset {clean_text[:25]}" if clean_text else "Preset Gaya Ilustrasi AI"
    )
    category = parsed.get("category") or ("doodle" if "doodle" in clean_text.lower() else "custom")
    description = (
        parsed.get("description")
        or f"Preset visual berbasis '{clean_text or 'gaya ilustrasi visual'}' untuk serial storyboard."
    )

    master_prompt = parsed.get("master_prompt", "")
    if not master_prompt or len(master_prompt.strip()) < 30:
        if "doodle" in clean_text.lower() or not clean_text:
            master_prompt = DEFAULT_DOODLE_STYLE_PROMPT
        else:
            master_prompt = f"{clean_text}. Distinctive artistic medium, hand-drawn linework, textural depth, harmonious color palette."

    negative_prompt = (
        parsed.get("negative_prompt")
        or "3D render, photorealistic, modern glossy CGI gradients, blurry details, text artifacts, distortion, noise."
    )

    style_attributes = parsed.get("style_attributes") or {
        "medium": "Hand-drawn stylized illustration",
        "linework": "Clean, expressive ink linework",
        "palette": [
            "Warm Parchment (#F5E6CA)",
            "Earth Sepia (#704214)",
            "Terracotta (#CC7722)",
            "Solid Black (#111111)",
        ],
        "lighting": "Soft ambient natural warm illumination",
        "character_style": "Distinctive stylized figure rendering",
        "composition": "Storytelling focal point, balanced negative space",
    }
    style_attributes["preset_type"] = "style"

    return {
        "name": name,
        "category": category,
        "preset_type": "style",
        "description": description,
        "master_prompt": master_prompt.strip(),
        "negative_prompt": negative_prompt.strip(),
        "style_attributes": style_attributes,
    }


async def generate_preset_test_image(
    master_prompt: str,
    negative_prompt: Optional[str] = None,
    scene_prompt: Optional[str] = None,
    db: Optional[AsyncSession] = None,
    size: str = "1792x1024",
) -> Tuple[str, str]:
    """
    Generate a live test preview image using the synthesized master prompt.
    Saved to storage/presets/preview_{uid}.png.
    """
    base_url = None
    api_key = None
    model = "runware:400@2"
    steps = None
    guidance_scale = None

    if db:
        res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
        cfg = res.scalar_one_or_none()
        base_url, api_key, model = resolve_image_credentials(cfg)
        if cfg:
            steps = getattr(cfg, "image_steps", None)
            guidance_scale = getattr(cfg, "image_cfg_scale", None)

    test_scene = (
        (scene_prompt or "").strip()
        or "Seorang kakek bijak sedang menceritakan kisah kuno di samping lentera minyak di bawah pohon rindang"
    )
    out_file = storage.get_presets_dir() / f"preview_{uuid.uuid4().hex[:10]}.png"

    abs_path, rel_url = await generate_image_to_path(
        prompt=test_scene,
        out_file=out_file,
        base_url=base_url,
        api_key=api_key,
        model=model,
        style_prompt=master_prompt,
        negative_prompt=negative_prompt,
        size=size,
        steps=steps,
        guidance_scale=guidance_scale,
    )

    return abs_path, rel_url
