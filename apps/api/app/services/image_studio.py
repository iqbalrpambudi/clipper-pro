import json
import logging
import re
import uuid
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decrypt_secret
from app.core.storage import storage
from app.models.config import ModelConfig
from app.models.image_preset import ImagePreset
from app.services.ai_adapters.factory import get_active_llm_adapter, get_active_vision_adapter
from app.services.image_gen import generate_image_to_path

log = logging.getLogger(__name__)

DEFAULT_DOODLE_STYLE_PROMPT = (
    "Full bleed edge-to-edge widescreen 16:9 landscape aspect ratio (horizontal orientation, 16:9 widescreen framing, wide composition, completely filling the frame without letterbox, without black bars, without white borders or frames, NOT square, NOT vertical). "
    "Educational explainer storyboard illustration in a distinctive hand-drawn cartoon doodle comic style. "
    "Features iconic minimalist stick-figure characters with large, smooth, perfectly round bald white heads (no hair), "
    "simple solid black dot eyes with expressive eyebrows, and thin black stick limbs. "
    "Characters wear loose draped robes, tunics, or simple stylized fabric garments with fluid folds. "
    "Clean, confident black ink linework with subtle sketchy hatching and expressive gestures. "
    "Warm vintage parchment and tea-stained paper background texture with aged cream, sandy beige, and warm desert sepia watercolor washes. "
    "Hand-painted watercolor fills with earthy tones (ochre, terracotta, warm sand, muted tan, subtle olive accents) and soft pigment bleeding. "
    "Diagrammatic storytelling elements, clean visual metaphors, full bleed edge-to-edge 16:9 widescreen composition without any black bars, letterbox, white border, or frames, ample negative space. "
    "No 3D CGI, no photorealism, no glossy gradients, no clutter, no digital text artifacts."
)

DEFAULT_DOODLE_PRESET = {
    "id": "doodle-ilustrasi",
    "name": "Doodle Ilustrasi",
    "description": "Gaya sketsa stickman berkepala bulat botak di atas kertas parchment kuno, tinta hitam ekspresif, dan sapuan cat air hangat sepia.",
    "category": "doodle",
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
            "Solid Black (#111111)"
        ],
        "lighting": "Soft warm vintage parchment ambient illumination",
        "character_style": "Minimalist stick-figure, smooth round bald white head without hair, expressive solid black dot eyes, draped robes and fabric folds",
        "composition": "Full bleed widescreen 16:9 landscape aspect ratio, edge-to-edge composition, diagrammatic storytelling, ample negative space, no letterbox, no black bars"
    },
    "is_builtin": True,
    "is_active": True,
}


async def seed_default_image_presets(db: AsyncSession) -> None:
    """Ensure the default 'Doodle Ilustrasi' preset exists and sync active preset with ModelConfig."""
    preset = await db.get(ImagePreset, DEFAULT_DOODLE_PRESET["id"])
    if not preset:
        # Check if another preset is active
        res = await db.execute(select(ImagePreset).where(ImagePreset.is_active == True))
        active_preset = res.scalar_one_or_none()

        new_preset = ImagePreset(
            id=DEFAULT_DOODLE_PRESET["id"],
            name=DEFAULT_DOODLE_PRESET["name"],
            description=DEFAULT_DOODLE_PRESET["description"],
            category=DEFAULT_DOODLE_PRESET["category"],
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
        # Keep builtin definitions updated
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
        # Fallback to doodle-ilustrasi if available
        preset = await db.get(ImagePreset, "doodle-ilustrasi")
    return preset


async def set_active_image_preset(db: AsyncSession, preset_id: str) -> ImagePreset:
    """Activate an image preset and sync its master prompt to model_configs.image_system_prompt."""
    target = await db.get(ImagePreset, preset_id)
    if not target:
        raise ValueError(f"Image preset '{preset_id}' tidak ditemukan")

    # Set all presets is_active = False
    await db.execute(update(ImagePreset).values(is_active=False))
    target.is_active = True

    # Sync to active model_config
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
    user_text: str,
    reference_image_path: Optional[str] = None,
    db: Optional[AsyncSession] = None,
) -> Dict[str, Any]:
    """
    Reverse-engineers visual style and synthesizes a master prompt from user text + reference image.
    Uses Vision model when reference image is supplied, with intelligent prompt engineering.
    """
    clean_text = (user_text or "").strip()

    prompt_instruction = (
        "You are a World-Class AI Art Director & Master Prompt Engineer specializing in image models (FLUX Schnell, Midjourney v6, DALL-E 3).\n\n"
        "Your task: Engineer an exquisite, highly reusable Visual Style Preset for AI Storyboard Illustrations based on the user's concept "
        f"and visual reference image.\n\n"
        f"USER CONCEPT & NOTES:\n\"{clean_text or 'Doodle illustration stickman style on vintage paper'}\"\n\n"
        "INSTRUCTIONS:\n"
        "1. Reverse-engineer the distinctive visual aesthetic (medium, linework, color palette, lighting, character anatomy, framing).\n"
        "2. Formulate a comprehensive 'master_prompt' in English (100-220 words) suitable as a style prefix for storyboard scenes.\n"
        "   CRITICAL: The master prompt MUST begin with: 'Widescreen 16:9 landscape aspect ratio (horizontal orientation, 16:9 widescreen framing, wide composition, NOT square, NOT vertical).'\n"
        "   It must specify the artistic style so any scene appended as 'Visual scene: [scene description]' renders in this exact visual world.\n"
        "3. Provide a clear negative prompt (exclusions).\n"
        "4. Extract structured style attributes (medium, linework, palette hex/name list, lighting, character_style, composition).\n\n"
        "OUTPUT STRICTLY VALID JSON ONLY, matching this schema:\n"
        "{\n"
        "  \"name\": \"Nama Preset Singkat Menarik (Bahasa Indonesia)\",\n"
        "  \"category\": \"doodle\" | \"watercolor\" | \"comic\" | \"anime\" | \"vintage\" | \"cinematic\" | \"custom\",\n"
        "  \"description\": \"Ringkasan gaya visual dalam 1-2 kalimat Bahasa Indonesia\",\n"
        "  \"master_prompt\": \"Widescreen 16:9 landscape aspect ratio (horizontal orientation, 16:9 widescreen framing, wide composition, NOT square, NOT vertical). [Complete detailed artistic instructions in English]\",\n"
        "  \"negative_prompt\": \"Negative prompt exclusions in English\",\n"
        "  \"style_attributes\": {\n"
        "    \"medium\": \"Art medium description\",\n"
        "    \"linework\": \"Linework style\",\n"
        "    \"palette\": [\"Color 1\", \"Color 2\", \"Color 3\", \"Color 4\", \"Color 5\"],\n"
        "    \"lighting\": \"Lighting description\",\n"
        "    \"character_style\": \"Character anatomy & styling\",\n"
        "    \"composition\": \"16:9 composition and framing\"\n"
        "  }\n"
        "}"
    )

    parsed: Dict[str, Any] = {}

    if db:
        try:
            if reference_image_path and Path(reference_image_path).exists():
                adapter = await get_active_vision_adapter(db)
                log.info("Analyzing reference image (%s) with multimodal vision adapter...", reference_image_path)
                raw_res = await adapter.analyze_multimodal(
                    prompt=prompt_instruction,
                    image_paths=[reference_image_path],
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
            log.warning("AI model analysis encountered an error: %s. Using intelligent heuristic synthesis.", e)

    # Validate or apply intelligent heuristic fallback if model returned incomplete payload
    name = parsed.get("name") or (f"Preset {clean_text[:25]}" if clean_text else "Preset Gaya Ilustrasi AI")
    category = parsed.get("category") or ("doodle" if "doodle" in clean_text.lower() else "custom")
    description = parsed.get("description") or f"Preset visual berbasis '{clean_text or 'gaya ilustrasi visual'}' untuk serial storyboard 16:9."

    master_prompt = parsed.get("master_prompt", "")
    if not master_prompt or len(master_prompt.strip()) < 30:
        aspect = "Widescreen 16:9 landscape aspect ratio (horizontal orientation, 16:9 widescreen framing, wide composition, NOT square, NOT vertical)."
        if "doodle" in clean_text.lower() or not clean_text:
            master_prompt = DEFAULT_DOODLE_STYLE_PROMPT
        else:
            master_prompt = (
                f"{aspect} Educational explainer storyboard illustration rendered in {clean_text}. "
                "Cohesive artistic styling, distinctive handcrafted aesthetic, rich textural depth, "
                "harmonious color palette, clean diagrammatic storytelling, ample negative space. "
                "No 3D CGI, no photorealism, no modern digital glossy gradients, no text artifacts, no blurry details."
            )

    negative_prompt = parsed.get("negative_prompt") or "No 3D CGI, no photorealism, no glossy gradients, no cluttered background, no digital text artifacts, no blurry details."
    style_attributes = parsed.get("style_attributes") or {
        "medium": "Hand-drawn stylized illustration",
        "linework": "Clean, expressive ink linework",
        "palette": ["Warm Parchment", "Earth Sepia", "Terracotta", "Solid Black", "Muted Gold"],
        "lighting": "Soft ambient natural warm illumination",
        "character_style": "Minimalist stylized figurative character design",
        "composition": "16:9 widescreen landscape framing, storytelling focal point, balanced negative space",
    }

    return {
        "name": name,
        "category": category,
        "description": description,
        "master_prompt": master_prompt,
        "negative_prompt": negative_prompt,
        "style_attributes": style_attributes,
    }


async def generate_preset_test_image(
    master_prompt: str,
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
    model = None

    if db:
        res = await db.execute(select(ModelConfig).where(ModelConfig.is_active == True).limit(1))
        cfg = res.scalar_one_or_none()
        if cfg:
            base_url = cfg.image_base_url
            model = cfg.image_model
            if cfg.image_api_key_encrypted:
                api_key = decrypt_secret(cfg.image_api_key_encrypted)

    test_scene = (scene_prompt or "").strip() or "Seorang kakek bijak sedang menceritakan kisah kuno di samping lentera minyak di bawah pohon rindang"
    out_file = storage.get_presets_dir() / f"preview_{uuid.uuid4().hex[:10]}.png"

    abs_path, rel_url = await generate_image_to_path(
        prompt=test_scene,
        out_file=out_file,
        base_url=base_url,
        api_key=api_key,
        model=model,
        style_prompt=master_prompt,
        size=size,
    )

    return abs_path, rel_url
