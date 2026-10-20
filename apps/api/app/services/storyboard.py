import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.narration import AudioTrack, Narration
from app.models.project import Project
from app.models.storyboard import StoryboardItem
from app.services.ai_adapters.factory import get_active_llm_adapter

log = logging.getLogger(__name__)


def _normalize_key(text: str) -> str:
    """Normalize names/labels for fuzzy token matching: lowercase alphanumeric only."""
    if not text:
        return ""
    return re.sub(r"[^a-z0-9]", "", str(text).lower())


def resolve_prompt_variables(
    prompt_template: str,
    characters: Optional[List[Dict[str, Any]]] = None,
    locations: Optional[List[Dict[str, Any]]] = None,
    world_setting: Optional[Dict[str, Any]] = None,
    preset_master_prompt: Optional[str] = None,
) -> str:
    """
    Resolve and compile variable tokens in a storyboard image prompt template.

    Supported tokens:
    - [preset:style], [style], [Preset Style] -> preset master prompt
    - [era], [world:era] -> world_setting era
    - [char:<char_id_or_name>:<variant_id_or_label>] -> specific character variant
    - [char:<char_id_or_name>] -> default character anchor
    - [<char_name_or_id>:<variant>] -> shorthand character variant (e.g. [malinkundang:batu])
    - [loc:<loc_id_or_name>] or [location:<loc_id_or_name>] -> location anchor
    - [<loc_name_or_id>] -> shorthand location (e.g. [pesisirairmanis])
    """
    if not prompt_template or not isinstance(prompt_template, str):
        return ""

    chars = characters or []
    locs = locations or []
    world = world_setting or {}
    style_text = (preset_master_prompt or "").strip()

    # Pre-index characters for rapid and fuzzy lookup
    char_map: Dict[str, Dict[str, Any]] = {}
    for c in chars:
        if not isinstance(c, dict):
            continue
        c_id = _normalize_key(c.get("id", ""))
        c_name = _normalize_key(c.get("name", ""))
        if c_id:
            char_map[c_id] = c
        if c_name:
            char_map[c_name] = c

    # Pre-index locations
    loc_map: Dict[str, Dict[str, Any]] = {}
    for loc in locs:
        if not isinstance(loc, dict):
            continue
        l_id = _normalize_key(loc.get("id", "") or loc.get("location_id", ""))
        l_name = _normalize_key(loc.get("name", ""))
        if l_id:
            loc_map[l_id] = loc
        if l_name:
            loc_map[l_name] = loc

    def _find_character(query: str) -> Optional[Dict[str, Any]]:
        norm_q = _normalize_key(query)
        if not norm_q:
            return None
        if norm_q in char_map:
            return char_map[norm_q]
        # Partial containment match
        for k, c in char_map.items():
            if norm_q in k or k in norm_q:
                return c
        return None

    def _find_variant(char_dict: Dict[str, Any], variant_query: str) -> str:
        norm_v = _normalize_key(variant_query)
        variants = char_dict.get("variants")
        if isinstance(variants, list) and len(variants) > 0:
            for v in variants:
                if not isinstance(v, dict):
                    continue
                v_id = _normalize_key(v.get("variant_id", ""))
                v_lbl = _normalize_key(v.get("label", "") or v.get("name", ""))
                if norm_v == v_id or norm_v == v_lbl or norm_v in v_lbl or v_lbl in norm_v:
                    return v.get("visual_anchor") or v.get("description") or ""
            # Fallback to first variant if none matched
            first_v = variants[0]
            if isinstance(first_v, dict):
                return first_v.get("visual_anchor") or first_v.get("description") or ""
        return char_dict.get("visual_anchor") or ""

    def _find_location(query: str) -> Optional[str]:
        norm_q = _normalize_key(query)
        if not norm_q:
            return None
        if norm_q in loc_map:
            loc_item = loc_map[norm_q]
            return loc_item.get("environment_anchor") or loc_item.get("description") or ""
        # Partial containment match
        for k, loc_item in loc_map.items():
            if norm_q in k or k in norm_q:
                return loc_item.get("environment_anchor") or loc_item.get("description") or ""
        return None

    def _token_replacer(match: re.Match) -> str:
        raw_inner = match.group(1).strip()
        lower_inner = raw_inner.lower()

        # 1. Preset Style
        if lower_inner in ["preset:style", "style", "preset style", "preset_style"]:
            return style_text

        # 2. Era & World Setting
        if lower_inner in ["era", "world:era", "world_setting:era"]:
            return (world.get("era") or "").strip()
        if lower_inner.startswith("time:") or lower_inner.startswith("mood:"):
            key = raw_inner.split(":", 1)[1].strip()
            return (world.get(key) or world.get("atmosphere") or "").strip()

        # 3. Explicit Character Token [char:name:variant] or [char:name]
        if lower_inner.startswith("char:") or lower_inner.startswith("character:"):
            parts = raw_inner.split(":", 2)
            c_name = parts[1].strip()
            v_name = parts[2].strip() if len(parts) > 2 else ""
            c_obj = _find_character(c_name)
            if c_obj:
                if v_name:
                    return _find_variant(c_obj, v_name)
                return c_obj.get("visual_anchor") or ""

        # 4. Explicit Location Token [loc:name] or [location:name]
        if lower_inner.startswith("loc:") or lower_inner.startswith("location:"):
            l_name = raw_inner.split(":", 1)[1].strip()
            found_loc = _find_location(l_name)
            if found_loc is not None:
                return found_loc

        # 5. Shorthand character variant [malinkundang:batu]
        if ":" in raw_inner and not lower_inner.startswith("http"):
            parts = raw_inner.split(":", 1)
            c_cand = _find_character(parts[0].strip())
            if c_cand:
                return _find_variant(c_cand, parts[1].strip())

        # 6. Shorthand single token: check character or location
        c_cand = _find_character(raw_inner)
        if c_cand:
            return _find_variant(c_cand, "")

        l_cand = _find_location(raw_inner)
        if l_cand is not None:
            return l_cand

        # If not matched to any token pattern (e.g. aspect ratio [16:9]), leave original
        return match.group(0)

    # Replace bracketed tokens: matches [token] but avoids nested or mismatched
    resolved = re.sub(r"\[([a-zA-Z0-9_: -]+)\]", _token_replacer, prompt_template)

    # Clean up whitespace and stray punctuation
    resolved = re.sub(r"\s+", " ", resolved)
    resolved = re.sub(r"\s+([,.;])", r"\1", resolved)
    resolved = re.sub(r"([,])\s*([,])", r",", resolved)
    return resolved.strip()


# Alias for backward and forward compatibility
resolve_prompt_tokens = resolve_prompt_variables


def clean_narration_for_tts(
    text: str,
    characters: Optional[List[Dict[str, Any]]] = None,
    locations: Optional[List[Dict[str, Any]]] = None,
    world_setting: Optional[Dict[str, Any]] = None,
) -> str:
    """Clean and sanitize voiceover narration text for optimal TTS delivery.

    1. Resolves leaked prompt tokens ([char:aladin:muda], [char:penyihir], [loc:pantai])
       into plain, natural spoken entity names ('Aladin', 'Penyihir', 'Pantai').
    2. Completely removes visual styling/preset tokens ([preset:style], [style], [era]).
    3. Eliminates semicolons (;) by turning them into commas (,) for smooth TTS pauses.
    4. Eliminates colons (:) by converting time formats (e.g. 10:00 -> 10.00) and replacing
       other colons with commas (,) so voice synthesis never stumbles.
    5. Normalizes consecutive commas, stray commas before sentence closers, and redundant whitespace.
    """
    if not text or not isinstance(text, str):
        return ""

    chars = characters or []
    locs = locations or []
    world = world_setting or {}

    # Pre-index characters
    char_map: Dict[str, str] = {}
    for c in chars:
        if not isinstance(c, dict):
            continue
        c_name = (c.get("name") or "").strip()
        c_id = _normalize_key(c.get("id") or "")
        c_norm_name = _normalize_key(c_name)
        if c_name:
            if c_id:
                char_map[c_id] = c_name
            if c_norm_name:
                char_map[c_norm_name] = c_name

    # Pre-index locations
    loc_map: Dict[str, str] = {}
    for loc in locs:
        if not isinstance(loc, dict):
            continue
        l_name = (loc.get("name") or "").strip()
        l_id = _normalize_key(loc.get("id") or loc.get("location_id") or "")
        l_norm_name = _normalize_key(l_name)
        if l_name:
            if l_id:
                loc_map[l_id] = l_name
            if l_norm_name:
                loc_map[l_norm_name] = l_name

    def _replace_narration_token(match: re.Match) -> str:
        raw = match.group(1).strip()
        lower = raw.lower()

        # 1. Preset style / style tokens -> remove completely
        if any(lower.startswith(p) for p in ["preset:", "style", "preset_style", "preset style"]):
            return ""

        # 2. Era / world setting tokens
        if lower in ["era", "world:era", "world_setting:era"]:
            return (world.get("era") or "").strip()
        if lower.startswith("time:") or lower.startswith("mood:"):
            return ""

        # 3. Explicit character tokens [char:<id>:<variant>] or [char:<id>]
        if lower.startswith("char:") or lower.startswith("character:"):
            parts = raw.split(":", 2)
            c_key = parts[1].strip()
            norm_k = _normalize_key(c_key)
            if norm_k in char_map:
                return char_map[norm_k]
            # Try partial matching in char_map
            for k, name in char_map.items():
                if norm_k in k or k in norm_k:
                    return name
            # Fallback to human readable name from the key itself
            return c_key.replace("_", " ").replace("-", " ").title()

        # 4. Explicit location tokens [loc:<id>] or [location:<id>]
        if lower.startswith("loc:") or lower.startswith("location:"):
            parts = raw.split(":", 1)
            l_key = parts[1].strip()
            norm_k = _normalize_key(l_key)
            if norm_k in loc_map:
                return loc_map[norm_k]
            for k, name in loc_map.items():
                if norm_k in k or k in norm_k:
                    return name
            return l_key.replace("_", " ").replace("-", " ").title()

        # 5. Shorthand character variant [malinkundang:batu]
        if ":" in raw and not lower.startswith("http"):
            parts = raw.split(":", 1)
            norm_cand = _normalize_key(parts[0].strip())
            if norm_cand in char_map:
                return char_map[norm_cand]

        # 6. Shorthand single token match
        norm_raw = _normalize_key(raw)
        if norm_raw in char_map:
            return char_map[norm_raw]
        if norm_raw in loc_map:
            return loc_map[norm_raw]

        # 7. Unknown bracket tags / SFX -> strip
        return ""

    # Replace bracketed tokens: matches [token]
    cleaned = re.sub(r"\[([a-zA-Z0-9_: -]+)\]", _replace_narration_token, text)

    # Also strip any leftover bracketed annotations e.g. [Musik Tegang], [Laughs], etc.
    cleaned = re.sub(r"\[.*?\]", "", cleaned)

    # Punctuation cleaning:
    # 1. Convert clock/timestamp formats (e.g. 10:00 -> 10.00, 14:30 -> 14.30)
    cleaned = re.sub(r"(\d+):(\d+)", r"\1.\2", cleaned)

    # 2. Replace semicolons (;) with commas (,)
    cleaned = re.sub(r"\s*;\s*", ", ", cleaned)

    # 3. Replace colons (:) with commas (,)
    cleaned = re.sub(r"\s*:\s*", ", ", cleaned)

    # 4. Clean up any resulting multiple commas, e.g. ",," or ", ," -> ","
    cleaned = re.sub(r",(\s*,)+", ",", cleaned)

    # 5. Clean up comma before period, exclamation, or question mark e.g. ",." -> "."
    cleaned = re.sub(r",\s*([.!?])", r"\1", cleaned)

    # 6. Replace comma at end of string or before closing quote with period
    cleaned = re.sub(r",\s*(['”\"’])$", r".\1", cleaned)
    cleaned = re.sub(r",\s*$", ".", cleaned)

    # 7. Clean up comma at start of sentence or after opening quote
    cleaned = re.sub(r'(^|["“\'‘])\s*,\s*', r'\1', cleaned)

    # 8. Clean up multiple spaces
    cleaned = re.sub(r"[ \t]+", " ", cleaned)

    return cleaned.strip()


def _build_visual_guidelines(preset: Optional[Any]) -> Tuple[str, str, str, str]:
    """Helper to extract consistent visual guidelines and example prompts from preset."""
    if preset:
        preset_name = preset.name
        preset_master = (preset.master_prompt or "").strip()
        attrs = getattr(preset, "style_attributes", {}) or {}
        art_style = attrs.get("art_style", "")
        char_style = attrs.get("character_style", "")
        lighting_style = attrs.get("lighting", "")
        bg_style = attrs.get("background", "")

        visual_guidelines = (
            f"3. GAYA VISUAL KONSISTEN PRESET AKTIF ({preset_name.upper()}):\n"
            f"   - Nama Preset: {preset_name}\n"
            f"   - Master Prompt & Estetika Visual: {preset_master}\n"
        )
        if art_style:
            visual_guidelines += f"   - Art Style: {art_style}\n"
        if char_style:
            visual_guidelines += f"   - Karakter & Sosok: {char_style}\n"
        if lighting_style or bg_style:
            visual_guidelines += f"   - Pencahayaan & Suasana: {lighting_style} {bg_style}\n"

        visual_guidelines += (
            "   - ATURAN KUNCI PEMBUATAN PROMPT GAMBAR (image_prompt):\n"
            f"     * Setiap adegan (scene) WAJIB memuat 1 `image_prompt` dalam Bahasa Inggris yang secara detail, hidup, dan konkret mendeskripsikan subjek visual, pose/ekspresi karakter, aksi kontekstual, dan komposisi 16:9 landscape.\n"
            f"     * Gaya seni, anatomi karakter, palet warna, dan pencahayaan WAJIB mengadopsi gaya visual '{preset_name}'.\n"
            "     * PENTING: JANGAN menyertakan gaya stickman doodle atau kertas perkamen antik jika preset aktif BUKAN gaya stickman!\n"
            "   - LARANGAN KERAS: DILARANG menyertakan teks, tulisan, huruf, label, speech bubbles, frame/bingkai tepi, atau watermark di dalam prompt visual.\n\n"
        )
        example_prompt_1 = f"A compelling widescreen 16:9 shot of an ancient wooden ship sailing across calm night ocean waters, a sailor looking through a brass spyglass at glowing constellations in the night sky, rendered in {preset_name} style ({preset_master[:70]})."
        example_prompt_2 = f"A dramatic close-up scene of the sailor holding a vintage brass compass in shock as thick swirling fog surrounds the ship deck, rendered in {preset_name} style ({preset_master[:70]})."
        preset_label = preset_name
    else:
        visual_guidelines = (
            "3. GAYA VISUAL STICKMAN PARCHMENT (WAJIB DIIKUTI KONSISTEN):\n"
            "   - Karakter: Karakter stickman / doodle minimalis khas (smooth round bald white head without hair, expressive black dot eyes, thin stick limbs, mengenakan jubah/kain longgar bertumpuk earthy-toned robes atau busana sederhana).\n"
            "- Aksi & Properti: Tindakan bercerita yang jelas dengan properti kontekstual esensial (mis. bejana tanah liat, gulungan naskah kuno, kompas kuno, diagram rasi bintang bergaris putus-putus).\n"
            "   - Latar: Kertas perkamen antik hangat (warm vintage tea-stained parchment paper background) dengan tekstur sapuan cat air gurun/terracotta/ochre yang lembut.\n"
            "   - LARANGAN KERAS: DILARANG menyertakan teks, tulisan, huruf, label, speech bubbles, frame/bingkai tepi, atau watermark di dalam prompt visual.\n\n"
        )
        example_prompt_1 = "A minimalist stickman sailor in a draped robe standing at the wooden bow of an ancient ship, looking up through a brass spyglass at constellations drawn with dotted lines, smooth round bald white head, dot eyes, warm vintage parchment background with desert watercolor washes."
        example_prompt_2 = "The stickman sailor holding a vintage brass compass in utter shock as the needle spins frantically with motion blur lines, thick swirling fog around, smooth round bald head, dot eyes, loose robe, warm parchment background."
        preset_label = "Doodle Ilustrasi Perkamen"

    return visual_guidelines, example_prompt_1, example_prompt_2, preset_label


def _format_tone_storytelling_guidelines(tone: str, language: str = "id") -> str:
    """Format high-AVD storytelling rules tailored to the selected tone.
    Enforces integrated world-building (anti-lecture), rich sensory immersion,
    strict linear chronology without time loops, high emotional stakes, and memorable philosophical punchlines.
    """
    clean_tone = (tone or "").strip().lower()
    if clean_tone in ["dramatis", "dramatic"]:
        if language == "en":
            return (
                "=== HIGH-RETENTION STANDARD: DRAMATIC & CINEMATIC TONE (MANDATORY) ===\n"
                "1. INTEGRATED WORLD-BUILDING (SHOW, DON'T LECTURE):\n"
                "   - NEVER interrupt the story with dry academic essays, textbook citations, or detached lectures mid-chapter.\n"
                "   - Weave all folklore, cultural taboos, historical setting, and ancient warnings directly into character dialogue, mentor advice, and immediate obstacles.\n"
                "2. RICH SENSORY IMMERSION:\n"
                "   - Evoke intense sensory stimuli: freezing mountain mist, rustling nocturnal footsteps, pungent incense, hollow stares, and flickering lantern flames.\n"
                "3. HIGH EMOTIONAL STAKES:\n"
                "   - Characters must be driven by urgent, relatable human desperation (crushing debts, family survival, illicit ambition) pushing them past forbidden boundaries.\n"
                "4. STRICT CHRONOLOGY & ANTI-LOOPING:\n"
                "   - Enforce rigorous linear causality. NEVER duplicate morning/dawn transitions or wake-up scenes.\n"
                "5. PSYCHOLOGICAL WEIGHT & FATAL TOLL:\n"
                "   - The consequences of shortcuts must devastate what is truly irreplaceable: loss of identity, loved ones forgetting their name, existential void.\n"
                "6. MEMORABLE PHILOSOPHICAL RESOLUTION:\n"
                "   - Conclude with a striking philosophical truth: the cursed place or dark realm is merely a mirror reflecting human greed.\n\n"
            )
        return (
            "=== PEDOMAN FORMULA DRAMATIS & SINEMATIK BERKUALITAS TINGGI (HIGH RETENTION AVD) ===\n"
            "1. INTEGRASI LATAR KE DALAM AKSI (SHOW, DON'T LECTURE):\n"
            "   - DILARANG KERAS memotong alur cerita dengan kuliah teori, kutipan buku antropologi/etnografi, atau esai akademis kaku (seperti 'Dalam catatan etnografi...', 'Berdasarkan kepercayaan animisme...').\n"
            "   - Leburkan semua latar mitos, aturan adat, pantangan gaib, atau fakta sejarah langsung ke dalam adegan: melalui peringatan tokoh sesepuh, dialog tajam, desas-desus warga, atau rintangan konkret yang dihadapi karakter.\n"
            "2. DETAIL SENSORIK PEKAT & PENGALAMAN IMERSIF:\n"
            "   - Hadirkan detail yang merangsang panca indera pendengar: dinginnya kabut yang menusuk tulang, derit dahan pohon tua, aroma kemenyan yang menyengat, temaram lentera minyak bergoyang, serta tatapan mata kosong di balik kegelapan.\n"
            "3. TARUHAN EMOSIONAL NYATA (HIGH STAKES):\n"
            "   - Tokoh utama harus digerakkan oleh motif mendesak yang dapat dirasakan penonton (himpitan hutang, keselamatan keluarga, kutukan, keputusasaan, atau ambisi gelap) yang memaksanya menempuh jalan berbahaya.\n"
            "4. KONTINUITAS WAKTU LINIER & BEBAS PLOT-HOLE (ANTI-LOOPING):\n"
            "   - Jaga urutan waktu secara kronologis dan ketat. DILARANG mengulang waktu fajar/pagi hari atau adegan bangun tidur dua kali. Satu akibat, satu fajar, satu konklusi.\n"
            "5. HOROR PSIKOLOGIS & KONSEKUENSI FATAL:\n"
            "   - Jalan pintas selalu menuntut harga mengerikan: bukan sekadar kerugian materi, tetapi lenyapnya eksistensi diri, ingatan orang tercinta, atau kehancuran jiwa.\n"
            "6. PUNCHLINE FILOSOFIS YANG MENAMPAR:\n"
            "   - Tutup cerita dengan refleksi kearifan yang mendalam: bahwa tempat terkutuk, pasar gaib, atau misteri gelap sesungguhnya adalah cermin yang memantulkan keserakahan dan pilihan batin manusia.\n\n"
        )
    elif clean_tone in ["misterius", "mysterious"]:
        if language == "en":
            return (
                "=== HIGH-RETENTION STANDARD: MYSTERIOUS & SUSPENSE TONE ===\n"
                "1. GRADUAL SUSPENSE & DELAYED GRATIFICATION:\n"
                "   - Hook viewer curiosity from second zero with strange anomalies without prematurely unraveling the core secret.\n"
                "2. VIVID SENSORY STRANGENESS:\n"
                "   - Detail abnormal occurrences, disembodied sounds, shifting shadows, and palpable dread.\n"
                "3. PUNCHY TENSION CADENCE:\n"
                "   - Alternate between creeping descriptive atmosphere and rapid-fire revelations when tension peaks.\n"
                "4. THOUGHT-PROVOKING UNRESOLVED QUESTIONS:\n"
                "   - Conclude with lingering puzzles that spark lively viewer debates in the comments.\n\n"
            )
        return (
            "=== PEDOMAN FORMULA MISTERI & TEGANG (HIGH RETENTION AVD) ===\n"
            "1. SUSPENSE BERTAHAP (DELAYED GRATIFICATION):\n"
            "   - Bangun rasa penasaran dan kejanggalan sejak detik awal tanpa membongkar misteri terlalu cepat.\n"
            "2. DETAIL ANOMALI & TEKSTUR HOROR:\n"
            "   - Deskripsikan keanehan fisik, bayangan mencurigakan, suara tak berwujud, dan firasat buruk yang mengendap.\n"
            "3. RITME MENGHENTAK:\n"
            "   - Gunakan kalimat tajam dan lugas saat tensi meninggi untuk menaikkan detak jantung penonton.\n"
            "4. KONKLUSI MENGGANTUNG / PERENUNGAN:\n"
            "   - Sisakan ruang tanya atau teka-teki yang memancing penonton mendiskusikannya di kolom komentar.\n\n"
        )
    elif clean_tone in ["edukasi", "edukatif", "educational"]:
        if language == "en":
            return (
                "=== HIGH-RETENTION STANDARD: ENGAGING & EDUCATIONAL TONE ===\n"
                "1. VIVID ANALOGIES: Clarify profound ideas using accessible, intuitive everyday metaphors.\n"
                "2. CRISP LOGICAL CAUSALITY: Connect premise, process, and outcome seamlessly without disjointed leaps.\n"
                "3. MEMORABLE INSIGHT: Deliver clear, actionable takeaways that leave viewers enlightened.\n\n"
            )
        return (
            "=== PEDOMAN PENCERITAAN EDUKATIF & BERBOBOT (HIGH RETENTION AVD) ===\n"
            "1. ANALOGI HIDUP & RELEVAN: Sampaikan konsep mendalam dengan perumpamaan sehari-hari yang mudah dicerna dalam sekali dengar.\n"
            "2. ALUR KAUSALITAS JELAS: Hubungkan sebab, proses, dan akibat secara runtut tanpa melompat-lompat.\n"
            "3. KESIMPULAN BERBOBOT: Hadirkan nilai tambah baru yang membuat penonton merasa mendapatkan wawasan berharga.\n\n"
        )
    else:
        if language == "en":
            return (
                "=== HIGH-RETENTION STANDARD: CONVERSATIONAL & DYNAMIC TONE ===\n"
                "1. FLUID NARRATIVE FLOW: Natural transitions between scenes, avoiding stiff or robotic phrasing.\n"
                "2. ACTIVE STORYTELLING: Keep viewers engaged with dynamic pacing and relatable, vivid observations.\n\n"
            )
        return (
            "=== PEDOMAN PENCERITAAN SANTAI & MENGALIR (HIGH RETENTION AVD) ===\n"
            "1. ALUR MENGALIR ALAMI: Gunakan frasa transisi yang luwes antar adegan, hindari bahasa buku yang kaku.\n"
            "2. PENCERITAAN AKTIF: Buat penonton betah menyimak dengan ritme dinamis dan observasi yang segar.\n\n"
        )


def build_storyboard_outline_prompt(
    topic: str,
    duration_mins: int = 5,
    tone: str = "santai",
    num_chapters: int = 5,
    custom_instructions: Optional[str] = None,
    existing_characters: Optional[List[Dict[str, Any]]] = None,
    existing_locations: Optional[List[Dict[str, Any]]] = None,
    existing_world_setting: Optional[Dict[str, Any]] = None,
    language: str = "id",
) -> Tuple[str, str]:
    """Build prompts for Phase 1: High-level Master Storyboard Outline + Story Continuity Bible (Characters with variants, locations, world setting)."""
    target_words = max(400, int(duration_mins * 135))
    words_per_chapter = int(round(target_words / max(1, num_chapters)))
    tone_clean = (tone or "").strip().lower()
    tone_guidelines = _format_tone_storytelling_guidelines(tone, language)

    if language == "en":
        if tone_clean in ["dramatis", "dramatic", "misterius", "mysterious"]:
            narrative_arc_en = (
                "- Narrative Arc Must Follow Cinematic High-Retention Storytelling:\n"
                "  1. Opening Chapter (Cold Open & Urgent Hook): High-stakes anomaly, emotional desperation, or gripping atmosphere hooking viewers from second zero.\n"
                "  2. Escalation & Integrated Lore Chapter: Weave historical context, folklore, and mentor warnings directly into active conflict (NEVER make an isolated textbook essay chapter).\n"
                "  3. Point of No Return & Confrontation Chapter: Breaching forbidden grounds, direct encounter with the uncanny, and making an irreversible bargain.\n"
                "  4. Tragic Toll & Psychological Shock Chapter: The unraveling of illusions and severe irreversible consequences (strict linear chronology, no duplicated dawn/wake-up scenes).\n"
                "  5. Resolution & Philosophical Truth: Deep moral resonance, reckoning with mentors, and a memorable philosophical takeaway.\n\n"
            )
        else:
            narrative_arc_en = (
                "- Narrative Arc Must Follow Dramatic Pacing:\n"
                "  1. Opening Chapter: Intriguing hook, paradox, or compelling question driving viewer curiosity.\n"
                "  2. Exploration Chapter: Delving into root causes, historical context, data, or underlying mechanisms.\n"
                "  3. Climax / Complication Chapter: Presenting conflict, critical challenges, or surprising twists.\n"
                "  4. Breakthrough / Solution Chapter: Explaining the turning point, major discovery, or new perspective.\n"
                "  5. Concluding Reflection: Philosophical insights, future impact, and a memorable takeaway.\n\n"
            )

        system_prompt = (
            "You are a world-class YouTube Master Storyteller & Executive Producer for high-retention documentary/explainer videos "
            "(in the style of MinutePhysics, Kurzgesagt, Big Think, Vox, or Veritasium).\n"
            "Your task is to design a highly structured, captivating Master Outline in ENGLISH for a long-form YouTube video, "
            "AND formulate a complete 'Story World & Continuity Bible' (characters with age/form variants, recurring locations, and historical/era setting) "
            "so that visuals remain 100% consistent across all scenes.\n\n"
            "CRITICAL LANGUAGE RULE: Write the entire outline ('title', 'overview', 'chapter_title', 'synopsis', 'key_points') in fluent, compelling spoken ENGLISH.\n\n"
            f"{tone_guidelines}"
            "=== OUTLINE STRUCTURE GUIDELINES ===\n"
            f"- Target Total Speech Duration: {duration_mins} Minutes (~{target_words} total words).\n"
            f"- Number of Chapters: Exactly {num_chapters} chapters, each developed into ~{words_per_chapter} words of in-depth narrative.\n"
            f"{narrative_arc_en}"
            "=== STORY CONTINUITY BIBLE (CHARACTERS, VARIANTS, LOCATIONS, ERA) ===\n"
            "1. World Setting (`world_setting`):\n"
            "   - `era`: Historical, contemporary, or futuristic era (e.g. '14th Century Ancient Nusantara Maritime Kingdom (pre-modern, no modern tech)').\n"
            "   - `time_setting`: Narrative timeline (e.g. 'Traditional Past', 'Near Future', 'Modern Era').\n"
            "   - `atmosphere`: Visual mood, color palette, and lighting progression.\n"
            "2. Characters (`characters`):\n"
            "   Identify ALL characters and key figures involved in the story (NOT restricted to 4; include protagonists, antagonists, mentors, and all supporting figures, e.g. 2 to 8+ characters as needed). For each character, provide:\n"
            "   - `id`: Short unique slug (e.g. 'malin', 'mother').\n"
            "   - `name`: Full character name.\n"
            "   - `role`: 'Protagonist', 'Antagonist', 'Supporting', etc.\n"
            "   - `visual_anchor`: Default permanent physical traits and signature style in English.\n"
            "   - `variants`: If the character undergoes aging, costume changes, or physical transformations across the story, provide distinct variants:\n"
            "     * e.g., young version, wealthy adult merchant version, cursed stone statue pose version.\n"
            "     * Each variant has `variant_id` ('muda', 'dewasa', 'batu'), `label`, and specific English `visual_anchor`.\n"
            "3. Key Locations (`locations`):\n"
            "   Define 2-6 key recurring environments in the story:\n"
            "   - `id`: Short unique slug (e.g. 'coastal_village', 'merchant_ship', 'cliff_storm').\n"
            "   - `name`: Location name.\n"
            "   - `environment_anchor`: Specific English visual description of architecture, geography, and lighting.\n\n"
            "=== OUTPUT FORMAT (STRICT PURE JSON ONLY) ===\n"
            "Return ONLY valid JSON matching this schema:\n"
            "{\n"
            '  "title": "Engaging & High-CTR Video Title in English",\n'
            '  "overview": "Short, captivating 2-3 sentence overview of the entire story arc in English",\n'
            '  "world_setting": {\n'
            '    "era": "Historical / Futuristic Era context",\n'
            '    "time_setting": "Traditional Past / Modern",\n'
            '    "atmosphere": "Visual lighting and color mood"\n'
            "  },\n"
            '  "characters": [\n'
            "    {\n"
            '      "id": "char_id",\n'
            '      "name": "Character Name",\n'
            '      "role": "Protagonist",\n'
            '      "visual_anchor": "Default physical description in English",\n'
            '      "variants": [\n'
            "        {\n"
            '          "variant_id": "young",\n'
            '          "label": "Youth / Young Version",\n'
            '          "visual_anchor": "Specific physical and outfit details for young stage"\n'
            "        }\n"
            "      ]\n"
            "    }\n"
            "  ],\n"
            '  "locations": [\n'
            "    {\n"
            '      "id": "loc_id",\n'
            '      "name": "Location Name",\n'
            '      "environment_anchor": "Detailed architectural and environmental description in English"\n'
            "    }\n"
            "  ],\n"
            '  "chapters": [\n'
            "    {\n"
            '      "chapter_index": 1,\n'
            '      "chapter_title": "Chapter 1: The Initial Hook & Paradox",\n'
            '      "synopsis": "Overview of storytelling focus, conflict, and tension built in this chapter in English.",\n'
            '      "key_points": [\n'
            '        "Key insight 1 to be covered",\n'
            '        "Key insight 2 to be covered"\n'
            '      ]\n'
            "    }\n"
            "  ]\n"
            "}"
        )

        user_prompt = (
            f"Video Topic: {topic}\n"
            f"Target Total Duration: {duration_mins} Minutes (~{target_words} words total)\n"
            f"Number of Chapters: Exactly {num_chapters} chapters (~{words_per_chapter} words per chapter)\n"
            f"Tone: {tone}\n"
            "Language: ENGLISH (Generate all outline text in English)\n"
        )
        if existing_characters:
            user_prompt += f"Previously Locked Characters: {json.dumps(existing_characters, ensure_ascii=False)}\n"
        if existing_locations:
            user_prompt += f"Previously Locked Locations: {json.dumps(existing_locations, ensure_ascii=False)}\n"
        if existing_world_setting:
            user_prompt += f"Previously Locked World Setting: {json.dumps(existing_world_setting, ensure_ascii=False)}\n"
        if custom_instructions:
            user_prompt += f"Additional Instructions: {custom_instructions}\n"

        user_prompt += (
            f"\nGenerate the Master Outline and Story Continuity Bible for exactly {num_chapters} chapters now in pure JSON format."
        )
        return system_prompt, user_prompt

    if tone_clean in ["dramatis", "dramatic", "misterius", "mysterious"]:
        narrative_arc_id = (
            "- Alur Narasi Wajib Mengikuti Ritme Sinematik & Dramaturgi Berbobot (Retensi Tinggi):\n"
            "  1. Babak Pembuka (Cold Open & Tensi Awal): Hook atmosferik, situasi mendesak, atau anomali yang langsung mengikat emosi penonton sejak detik pertama.\n"
            "  2. Babak Eskalasi & Lore Terintegrasi: Hadirkan latar mitos/budaya/sejarah melalui konflik nyata karakter atau peringatan tokoh sesepuh (DILARANG membuat babak kuliah/makalah teori terpisah).\n"
            "  3. Babak Titik Kritis & Menembus Batas: Karakter melangkah ke wilayah terlarang, konfrontasi langsung dengan misteri, dan keputusan krusial tanpa jalan kembali (point of no return).\n"
            "  4. Babak Konsekuensi Tragis & Horor Psikologis: Dampak nyata dari pilihan karakter, runtuhnya ilusi, atau twist emosional yang memukul (jaga kontinuitas waktu linier, jangan ada pengulangan waktu fajar/bangun tidur).\n"
            "  5. Babak Resolusi & Refleksi Luhur: Penutup bermakna mendalam, dialog/perenungan bersama sesepuh, dan kesimpulan filosofis yang membekas kuat di ingatan penonton.\n\n"
        )
    else:
        narrative_arc_id = (
            "- Alur Narasi Wajib Mengikuti Ritme Dramatis:\n"
            "  1. Babak Pembuka: Hook menarik, paradoks, atau pertanyaan besar yang memicu rasa ingin tahu penonton.\n"
            "  2. Babak Penjelajahan: Menyelami akar masalah, sejarah, data, atau mekanisme di balik fenomena.\n"
            "  3. Babak Puncak / Komplikasi: Menghadirkan konflik, krisis, tantangan kritis, atau plot twist tak terduga.\n"
            "  4. Babak Solusi / Terobosan: Menjelaskan jalan keluar, penemuan penting, atau pemahaman baru.\n"
            "  5. Babak Penutup: Refleksi filosofis, dampak masa depan, dan kesimpulan yang membekas di pikiran penonton.\n\n"
        )

    system_prompt = (
        "Anda adalah Master Storyteller & Produser Eksekutif naskah video YouTube explainer/dokumenter "
        "(gaya MinutePhysics, Kurzgesagt, Big Think, Vox, atau Veritasium).\n"
        "Tugas Anda adalah merancang Master Outline alur cerita video YouTube berdurasi panjang yang sangat terstruktur, "
        "memikat, dan memiliki ritme penceritaan dramatis yang kuat dari awal hingga akhir, "
        "SERTA menyusun 'Story World & Continuity Bible' (penguncian identitas karakter dengan varian bentuk/usia, latar tempat utama, dan era waktu kejadian) "
        "agar seluruh ilustrasi visual tetap 100% konsisten antar adegan.\n\n"
        f"{tone_guidelines}"
        "=== PANDUAN STRUKTUR OUTLINE ===\n"
        f"- Target Total Durasi Bicara: {duration_mins} Menit (~{target_words} kata total narasi).\n"
        f"- Jumlah Babak (Chapters): Tepat {num_chapters} babak, di mana setiap babak akan dikembangkan menjadi ~{words_per_chapter} kata narasi mendalam.\n"
        f"{narrative_arc_id}"
        "=== DETEKSI & PENGUNCIAN STORY CONTINUITY & CHARACTER BIBLE ===\n"
        "1. Latar Waktu & Era (`world_setting`):\n"
        "   - `era`: Periode sejarah / masa (misal: 'Zaman Kerajaan Maritim Nusantara Abad ke-14 (Pra-modern, tanpa teknologi mesin/listrik)').\n"
        "   - `time_setting`: Garis waktu (misal: 'Masa Lalu Tradisional').\n"
        "   - `atmosphere`: Mood visual, palet warna, dan gaya pencahayaan.\n"
        "2. Karakter & Varian Wujud (`characters`):\n"
        "   Identifikasi SEMUA karakter dan tokoh yang terlibat dalam cerita (TIDAK DIBATASI 4; masukkan semua tokoh utama, antagonis, pendamping, maupun tokoh pendukung yang memiliki dialog/peran, misal 2 hingga 8+ karakter sesuai kebutuhan naskah cerita). Untuk setiap karakter sertakan:\n"
        "   - `id`: Slug pendek (misal 'malin', 'ibu').\n"
        "   - `name`: Nama Karakter (misal 'Malin Kundang').\n"
        "   - `role`: Peran (misal 'Tokoh Utama').\n"
        "   - `visual_anchor`: Deskripsi visual Bahasa Inggris permanen.\n"
        "   - `variants`: Jika karakter mengalami perubahan usia (muda vs tua/dewasa) atau transformasi bentuk (seperti Malin berubah menjadi patung batu bersujud), buat varian terpisah:\n"
        "     * Varian 'muda': 'a lean young Indonesian boy, sun-tanned skin, wearing a faded crimson red cotton shirt, brown fabric headband (ikat kepala udeng), bare feet'\n"
        "     * Varian 'dewasa': 'a confident mature Indonesian merchant in his 30s, wearing an opulent emerald-green and gold-embroidered silk royal tunic, royal destar headcloth, golden keris'\n"
        "     * Varian 'batu': 'a dramatic weathered grey andesite stone statue of a man frozen in a prostrating kneeling pose (sujud) with face touching the ground, mossy texture, sea spray crashing against stone surface'\n"
        "3. Latar Tempat Utama (`locations`):\n"
        "   Definisikan 2-6 lingkungan tempat kejadian utama:\n"
        "   - `id`: Slug pendek (misal 'pesisir_air_manis', 'kapal_saudagar').\n"
        "   - `name`: Nama tempat (misal 'Pesisir Pantai Air Manis').\n"
        "   - `environment_anchor`: Deskripsi visual lingkungan dalam Bahasa Inggris (arsitektur gubuk panggung kayu, pohon kelapa, pasir pantai berkarang, perahu cadik tradisional).\n\n"
        "=== FORMAT KELUARAN (WAJIB JSON MURNI) ===\n"
        "Kembalikan HANYA JSON valid tanpa teks pembuka/penutup dengan skema berikut:\n"
        "{\n"
        '  "title": "Judul Menarik & Menggugah Rasa Ingin Tahu",\n'
        '  "overview": "Sinopsis singkat alur cerita keseluruhan 2-3 kalimat yang memikat",\n'
        '  "world_setting": {\n'
        '    "era": "Zaman Kerajaan Kuno Nusantara Abad ke-14",\n'
        '    "time_setting": "Masa Lalu Tradisional",\n'
        '    "atmosphere": "Warm vintage cinematic with stormy contrast in climax"\n'
        "  },\n"
        '  "characters": [\n'
        "    {\n"
        '      "id": "malin",\n'
        '      "name": "Malin Kundang",\n'
        '      "role": "Tokoh Utama",\n'
        '      "visual_anchor": "a lean Indonesian man with expressive eyes...",\n'
        '      "variants": [\n'
        "        {\n"
        '          "variant_id": "muda",\n'
        '          "label": "Masa Kecil / Nelayan",\n'
        '          "visual_anchor": "a lean young Indonesian boy, sun-tanned skin, wearing faded crimson red shirt, rolled-up dark trousers, woven brown fabric headband (udeng), bare feet"\n'
        "        },\n"
        "        {\n"
        '          "variant_id": "dewasa",\n'
        '          "label": "Dewasa / Saudagar",\n'
        '          "visual_anchor": "a confident mature Indonesian merchant in his 30s, wearing emerald-green and gold-embroidered silk royal tunic, royal destar headcloth, golden keris"\n'
        "        },\n"
        "        {\n"
        '          "variant_id": "batu",\n'
        '          "label": "Patung Batu Sujud",\n'
        '          "visual_anchor": "a dramatic weathered grey andesite stone statue of a man frozen in a prostrating kneeling pose (sujud) with face touching the ground, mossy texture, sea spray crashing against stone surface"\n'
        "        }\n"
        "      ]\n"
        "    }\n"
        "  ],\n"
        '  "locations": [\n'
        "    {\n"
        '      "id": "pesisir_air_manis",\n'
        '      "name": "Pesisir Pantai Air Manis",\n'
        '      "environment_anchor": "traditional coastal Indonesian village, simple wooden stilt huts with thatched nipah palm roofs, coconut palms leaning over sandy beach, wooden outrigger canoes resting on shore"\n'
        "    }\n"
        "  ],\n"
        '  "chapters": [\n'
        "    {\n"
        '      "chapter_index": 1,\n'
        '      "chapter_title": "Babak 1: Hook & Paradoks Awal",\n'
        '      "synopsis": "Penjelasan fokus penceritaan pada babak ini, apa yang dibahas dan tensi apa yang dibangun.",\n'
        '      "key_points": [\n'
        '        "Poin penting 1 yang akan dibahas",\n'
        '        "Poin penting 2 yang akan dibahas"\n'
        '      ]\n'
        "    }\n"
        "  ]\n"
        "}"
    )

    user_prompt = (
        f"Topik Video: {topic}\n"
        f"Target Total Durasi: {duration_mins} Menit (~{target_words} kata total)\n"
        f"Jumlah Babak (Chapters): Tepat {num_chapters} babak (~{words_per_chapter} kata per babak)\n"
        f"Tone: {tone}\n"
        "Bahasa: BAHASA INDONESIA (Buat outline dalam Bahasa Indonesia)\n"
    )
    if existing_characters:
        user_prompt += f"Karakter yang telah dikunci sebelumnya: {json.dumps(existing_characters, ensure_ascii=False)}\n"
    if existing_locations:
        user_prompt += f"Latar tempat yang telah dikunci sebelumnya: {json.dumps(existing_locations, ensure_ascii=False)}\n"
    if existing_world_setting:
        user_prompt += f"Setting dunia/era sebelumnya: {json.dumps(existing_world_setting, ensure_ascii=False)}\n"
    if custom_instructions:
        user_prompt += f"Instruksi Tambahan: {custom_instructions}\n"

    user_prompt += (
        f"\nBuatlah Master Outline dan Story Continuity Bible untuk tepat {num_chapters} babak sekarang dalam format JSON murni."
    )
    return system_prompt, user_prompt


def _format_continuity_bible_instructions(
    characters: Optional[List[Dict[str, Any]]] = None,
    locations: Optional[List[Dict[str, Any]]] = None,
    world_setting: Optional[Dict[str, Any]] = None,
    language: str = "id",
) -> str:
    """Format Character Variants, Locations, and World Setting into tokenized instructions."""
    lines: List[str] = []

    # 1. Characters and their variants
    if characters and len(characters) > 0:
        if language == "en":
            lines.append("1. CHARACTER CONSISTENCY & VARIANT TOKENS:")
        else:
            lines.append("1. PENGUNCIAN KONSISTENSI KARAKTER & VARIAN BENTUK/USIA:")

        for c in characters:
            c_name = c.get("name", "Character" if language == "en" else "Karakter")
            c_id = c.get("id") or _normalize_key(c_name)
            c_role = f" ({c.get('role')})" if c.get("role") else ""
            c_anchor = c.get("visual_anchor", "")
            variants = c.get("variants")

            if isinstance(variants, list) and len(variants) > 0:
                lines.append(f"   • {c_name}{c_role}:")
                for v in variants:
                    v_id = v.get("variant_id") or _normalize_key(v.get("label", ""))
                    v_lbl = v.get("label", v_id)
                    v_anchor = v.get("visual_anchor", "")
                    lines.append(f"     - Use token `[char:{c_id}:{v_id}]` for {v_lbl} (Visual: {v_anchor})")
            else:
                lines.append(f"   • {c_name}{c_role}: Use token `[char:{c_id}]` (Visual: {c_anchor})")
        lines.append("")

    # 2. Locations
    if locations and len(locations) > 0:
        if language == "en":
            lines.append("2. KEY RECURRING LOCATION TOKENS:")
        else:
            lines.append("2. TOKEN LATAR TEMPAT UTAMA (LOCATIONS):")

        for loc in locations:
            l_name = loc.get("name", "Location" if language == "en" else "Lokasi")
            l_id = loc.get("id") or loc.get("location_id") or _normalize_key(l_name)
            l_anchor = loc.get("environment_anchor", "")
            lines.append(f"   • {l_name}: Use token `[loc:{l_id}]` (Environment: {l_anchor})")
        lines.append("")

    # 3. World Setting
    if world_setting and isinstance(world_setting, dict) and any(world_setting.values()):
        if language == "en":
            lines.append("3. WORLD SETTING & ERA CONTEXT:")
        else:
            lines.append("3. SETTING ERA & ATMOSFER DUNIA:")
        if world_setting.get("era"):
            lines.append(f"   • Era: {world_setting.get('era')}")
        if world_setting.get("time_setting"):
            lines.append(f"   • Time Timeline: {world_setting.get('time_setting')}")
        if world_setting.get("atmosphere"):
            lines.append(f"   • Visual Atmosphere/Lighting: {world_setting.get('atmosphere')}")
        lines.append("")

    # 4. Mandatory tokenized rule
    if language == "en":
        lines.append(
            "=== MANDATORY TOKENIZED IMAGE PROMPT RULES ===\n"
            "To keep prompts readable and 100% consistent across scenes, you MUST write every `image_prompt` using variable tokens:\n"
            "- Insert character variant token: `[char:<char_id>:<variant_id>]` (or `[char:<char_id>]`).\n"
            "- Insert location token: `[loc:<loc_id>]`.\n"
            "- Insert visual preset token: `[preset:style]`.\n"
            "- Describe the specific character action, emotion, full-bleed 16:9 widescreen framing (edge-to-edge, NO letterbox, NO black bars, NO white border), and lighting vividly.\n"
            "Examples:\n"
            "  * `A full-bleed 16:9 widescreen shot in [preset:style] of [char:malin:muda] repairing a fishing net on [loc:pesisir_air_manis], looking out towards horizon under gentle morning sunlight.`\n"
            "  * `A dramatic low-angle full-bleed 16:9 shot in [preset:style] of [char:malin:batu] weeping in despair on [loc:pesisir_air_manis], torrential rain and lightning strikes.`\n\n"
            "=== CRITICAL RULES FOR NARRATION_TEXT (VOICEOVER / TTS) ===\n"
            "1. STRICTLY NO TOKENS IN NARRATION: Bracket tokens like `[char:...]`, `[loc:...]`, `[preset:...]` are EXCLUSIVELY for `image_prompt`!\n"
            "   In `narration_text`, NEVER include bracket tokens. Always write the natural spoken character and location names (e.g. write 'Aladdin' or 'the Sorcerer', NEVER '[char:aladin:muda]' or '[char:penyihir]'). This narration will be read aloud by TTS.\n"
            "2. NO COLONS OR SEMICOLONS: NEVER use semicolons (;) or colons (:) in `narration_text` as TTS voice synthesis glitches or stumbles on them. Use commas (,) for breath pauses and periods (.) for full stops."
        )
    else:
        lines.append(
            "=== ATURAN WAJIB PENULISAN IMAGE PROMPT BERBASIS TOKEN (SANGAT PENTING) ===\n"
            "Agar prompt ringkas, sangat mudah dibaca/di-review manusia, dan 100% konsisten antar slide, Anda WAJIB menyusun setiap `image_prompt` menggunakan TOKEN VARIABEL:\n"
            "- Sisipkan token karakter & varian: `[char:<char_id>:<variant_id>]` (contoh: `[char:malin:muda]`, `[char:malin:dewasa]`, `[char:malin:batu]`).\n"
            "- Sisipkan token latar tempat: `[loc:<loc_id>]` (contoh: `[loc:pesisir_air_manis]`, `[loc:kapal_saudagar]`).\n"
            "- Sisipkan token gaya visual preset: `[preset:style]`.\n"
            "- Tuliskan aksi konkret tokoh, ekspresi emosi, framing 16:9 widescreen full-bleed (penuh layar edge-to-edge, TANPA letterbox, TANPA bar hitam/putih, TANPA bingkai), dan pencahayaan secara hidup.\n"
            "Contoh format prompt yang WAJIB ditaati:\n"
            "  * Adegan 1: `A full-bleed 16:9 widescreen shot in [preset:style] of [char:malin:muda] repairing a fishing net on [loc:pesisir_air_manis], looking out towards the ocean with ambitious eyes under gentle morning sunlight.`\n"
            "  * Adegan 2: `A dramatic low-angle full-bleed 16:9 shot in [preset:style] of [char:malin:batu] weeping in despair on [loc:pesisir_air_manis], torrential rain, lightning flashing in dark stormy sky.`\n\n"
            "=== ATURAN MUTLAK NARRATION_TEXT (NASKAHPENYUARAAN TTS) ===\n"
            "1. DILARANG KERAS MENGGUNAKAN TOKEN PADA NARASI: Token variabel seperti `[char:...]`, `[loc:...]`, `[preset:...]` HANYA untuk `image_prompt`!\n"
            "   Pada `narration_text`, DILARANG menuliskan token kurung siku. Selalu tulis nama asli tokoh/tempat secara alami (contoh: tulis 'Aladin', 'Penyihir', BUKAN '[char:aladin:muda]' atau '[char:penyihir]'). Naskah narasi ini akan langsung dibacakan oleh mesin suara (TTS).\n"
            "2. HILANGKAN TANDA TITIK DUA (:) DAN TITIK KOMA (;): DILARANG menggunakan tanda baca titik dua (:) dan titik koma (;) pada `narration_text`. Mesin TTS tersendat atau salah membaca tanda baca ini. Gunakan tanda koma (,) untuk jeda pendek atau titik (.) untuk jeda antar kalimat."
        )

    return "\n".join(lines) + "\n\n"


def build_chapter_expansion_prompt(
    video_title: str,
    video_overview: str,
    chapter_index: int,
    total_chapters: int,
    chapter_title: str,
    chapter_synopsis: str,
    chapter_key_points: List[str],
    target_chapter_words: int,
    target_segments: int,
    images_per_segment: int,
    tone: str,
    preset: Optional[Any] = None,
    custom_instructions: Optional[str] = None,
    chapters_roadmap: Optional[List[Dict[str, Any]]] = None,
    characters: Optional[List[Dict[str, Any]]] = None,
    locations: Optional[List[Dict[str, Any]]] = None,
    world_setting: Optional[Dict[str, Any]] = None,
    language: str = "id",
) -> Tuple[str, str]:
    """Build prompts for Phase 2: Expanding a single chapter into full narration & visual scenes."""
    visual_guidelines, example_prompt_1, example_prompt_2, preset_label = _build_visual_guidelines(preset)
    min_chapter_words = int(round(target_chapter_words * 0.90))
    total_chapter_scenes = target_segments * images_per_segment
    tone_guidelines = _format_tone_storytelling_guidelines(tone, language)

    continuity_instruction = _format_continuity_bible_instructions(
        characters=characters,
        locations=locations,
        world_setting=world_setting,
        language=language,
    )

    if language == "en":
        system_prompt = (
            "You are a world-class Master Storyteller, Visual Director & Scriptwriter for YouTube documentary videos.\n"
            f"Your task is to write the COMPLETE narration script for Chapter {chapter_index} of {total_chapters} video chapters, "
            "structured into segments and visual scenes with a strict 1-to-1 coupling between the spoken English narration sentence and the image prompt.\n\n"
            "=== CRITICAL LANGUAGE RULE ===\n"
            "All `narration_text` MUST be written in natural, engaging, fluent spoken ENGLISH (18–25 words per scene). "
            "Under NO circumstances should any Indonesian words appear in the narration.\n\n"
            f"{tone_guidelines}"
            "=== KEY NARRATION & VISUAL RULES ===\n"
            "1. 1-TO-1 COUPLING (1 Scene = 1 Narration Sentence & 1 Visual Prompt):\n"
            f"   - This chapter MUST contain exactly {target_segments} segments.\n"
            f"   - Each segment MUST have exactly {images_per_segment} scenes -> Exactly {total_chapter_scenes} scenes total for this chapter.\n"
            "   - Each scene has directly coupled `narration_text` and `image_prompt`.\n"
            "   - `narration_text`: 1–2 complete, expressive, descriptive narration sentences in ENGLISH (18–25 words per scene). DO NOT make sentences too short! NEVER include bracket tokens (e.g. [char:...]), semicolons (;), or colons (:).\n"
            "   - `image_prompt`: Concise, tokenized visual prompt in English (16:9 widescreen) using Continuity tokens.\n\n"
            f"{continuity_instruction}"
            f"{visual_guidelines}"
            "4. TARGET WORD COUNT & STORY CONTINUITY (CRITICAL):\n"
            f"   - Total narration words for Chapter {chapter_index} MUST reach at least {min_chapter_words} words (target ~{target_chapter_words} words).\n"
            "   - DO NOT abbreviate explanations! Elaborate on insights, metaphors, and narrative pacing.\n"
            "   - STORY CONTINUITY: The script must flow seamlessly as part of the overall video roadmap.\n\n"
            "=== OUTPUT FORMAT (STRICT PURE JSON ONLY) ===\n"
            "Return ONLY valid JSON without markdown fences:\n"
            "{\n"
            f'  "chapter_title": "{chapter_title}",\n'
            '  "segments": [\n'
            "    {\n"
            f'      "segment_id": "seg-{chapter_index}_1",\n'
            '      "scenes": [\n'
            "        {\n"
            '          "scene_id": "scene-1",\n'
            '          "narration_text": "Detailed, immersive first scene narration sentence in natural English...",\n'
            '          "image_prompt": "A cinematic 16:9 shot in [preset:style] of [char:char_id:variant_id] action on [loc:loc_id], morning lighting, dramatic angle."\n'
            "        },\n"
            "        {\n"
            '          "scene_id": "scene-2",\n'
            '          "narration_text": "Subsequent narration sentence driving the narrative forward in English...",\n'
            '          "image_prompt": "A cinematic 16:9 shot in [preset:style] of [char:char_id:variant_id] reaction on [loc:loc_id], atmospheric mood."\n'
            "        }\n"
            "      ]\n"
            "    }\n"
            "  ]\n"
            "}"
        )
    else:
        system_prompt = (
            "Anda adalah Master Storyteller, Sutradara Visual & Scriptwriter kelas dunia untuk video dokumenter YouTube.\n"
            f"Tugas Anda adalah menulis naskah narasi LENGKAP untuk Babak {chapter_index} dari {total_chapters} babak video, "
            "terstruktur ke dalam segmen dan adegan visual (scenes) dengan kopling 1-to-1 antara kalimat narasi dan prompt gambar.\n\n"
            f"{tone_guidelines}"
            "=== ATURAN KUNCI NARASI & VISUAL ===\n"
            "1. KOPLING 1-TO-1 (1 Adegan = 1 Kalimat Narasi & 1 Prompt Visual):\n"
            f"   - Babak ini WAJIB berisi tepat {target_segments} segmen.\n"
            f"   - Setiap segmen WAJIB memiliki tepat {images_per_segment} adegan (scenes) -> Total tepat {total_chapter_scenes} scenes untuk babak ini.\n"
            "   - Setiap scene memiliki `narration_text` dan `image_prompt` yang berpasangan langsung.\n"
            "   - `narration_text`: 1–2 kalimat narasi utuh yang bernas, deskriptif, dan ekspresif (18–25 kata per scene). JANGAN membuat narasi terlalu pendek! DILARANG KERAS menyertakan token kurung siku (seperti [char:...]), tanda titik dua (:), atau tanda titik koma (;).\n"
            "   - `image_prompt`: Prompt visual ringkas berbasis token variabel ([char:...], [loc:...], [preset:style]) yang secara konkret merepresentasikan kalimat narasi.\n\n"
            f"{continuity_instruction}"
            f"{visual_guidelines}"
            "4. TARGET PANJANG KATA & KESINAMBUNGAN (SANGAT PENTING):\n"
            f"   - Total kata narasi untuk Babak {chapter_index} ini WAJIB mencapai minimal {min_chapter_words} kata (target ideal ~{target_chapter_words} kata).\n"
            "   - DILARANG menyingkat atau memangkas penjelasan! Uraikan argumen, metafora, dan cerita dengan detail dan memikat.\n"
            "   - KESINAMBUNGAN CERITA: Naskah babak ini harus mengalir alami sebagai bagian dari keseluruhan video. "
            "Jembatani awal babak secara mulus dari babak sebelumnya tanpa mengulang kalimat pembuka/salam, dan jangan mendahului topik babak berikutnya.\n\n"
            "=== FORMAT KELUARAN (WAJIB JSON MURNI) ===\n"
            "Kembalikan HANYA JSON valid tanpa teks pembuka/penutup:\n"
            "{\n"
            f'  "chapter_title": "{chapter_title}",\n'
            '  "segments": [\n'
            "    {\n"
            f'      "segment_id": "seg-{chapter_index}_1",\n'
            '      "scenes": [\n'
            "        {\n"
            '          "scene_id": "scene-1",\n'
            '          "narration_text": "Kalimat narasi adegan pertama yang kaya detail dan mendalam...",\n'
            '          "image_prompt": "A cinematic 16:9 shot in [preset:style] of [char:char_id:variant_id] action on [loc:loc_id], morning sunlight, dramatic angle."\n'
            "        },\n"
            "        {\n"
            '          "scene_id": "scene-2",\n'
            '          "narration_text": "Kelanjutan narasi yang membangun keterhubungan logis atau visual progression...",\n'
            '          "image_prompt": "A cinematic 16:9 shot in [preset:style] of [char:char_id:variant_id] reaction on [loc:loc_id], atmospheric mood."\n'
            "        }\n"
            "      ]\n"
            "    }\n"
            "  ]\n"
            "}"
        )

    roadmap_str = ""
    if chapters_roadmap:
        roadmap_lines = []
        for i, ch in enumerate(chapters_roadmap):
            c_idx = i + 1
            c_title = ch.get("chapter_title", f"Babak {c_idx}" if language == "id" else f"Chapter {c_idx}")
            c_syn = ch.get("synopsis", "")
            marker = (" ➔ [CURRENT FOCUS]" if language == "en" else " ➔ [FOKUS SAAT INI]") if c_idx == chapter_index else ""
            roadmap_lines.append(f"  {c_idx}. {c_title}{marker}: {c_syn}")
        roadmap_header = "OVERALL STORY ROADMAP (FOR STORY CONTINUITY):\n" if language == "en" else "ROADMAP KESELURUHAN ALUR CERITA (AGAR CERITA TETAP KONSISTEN & NYAMBUNG):\n"
        roadmap_str = roadmap_header + "\n".join(roadmap_lines) + "\n\n"

    char_remind_str = ""
    if characters and len(characters) > 0:
        names = ", ".join(c.get("name", "") for c in characters if c.get("name"))
        char_remind_str = f"- Locked Characters (Use exact visual anchors): {names}\n" if language == "en" else f"- Karakter Terkunci (Gunakan visual anchor mereka persis): {names}\n"

    kp_str = "\n".join(f"- {kp}" for kp in chapter_key_points) if chapter_key_points else ("- Develop according to chapter synopsis" if language == "en" else "- Kembangkan sesuai sinopsis babak")

    if language == "en":
        user_prompt = (
            f"Overall Video Context:\n"
            f"- Video Title: {video_title}\n"
            f"- Overview: {video_overview}\n\n"
            f"{roadmap_str}"
            f"CHAPTER WRITING FOCUS:\n"
            f"- Chapter: {chapter_title} (Chapter {chapter_index} of {total_chapters})\n"
            f"- Chapter Synopsis: {chapter_synopsis}\n"
            f"- Key Points to Cover:\n{kp_str}\n\n"
            f"TECHNICAL TARGETS:\n"
            f"- Target Chapter Word Count: Minimum {min_chapter_words} words (target ~{target_chapter_words} words)\n"
            f"- Chapter Structure: Exactly {target_segments} segments, {images_per_segment} scenes each (Total exactly {total_chapter_scenes} scenes)\n"
            f"- Tone: {tone}\n"
            f"- Language: ENGLISH ONLY\n"
            f"- Visual Style Preset: {preset_label}\n"
            f"{char_remind_str}"
        )
        if custom_instructions:
            user_prompt += f"- Additional Instructions: {custom_instructions}\n"

        user_prompt += (
            f"\nWrite the complete script for Chapter {chapter_index} now in pure JSON format in ENGLISH.\n"
            f"CRITICAL: Ensure the narration connects fluidly with the roadmap above, meets the minimum {min_chapter_words} words, is FREE of bracket tokens (plain names only), and contains NO colons or semicolons!"
        )
    else:
        user_prompt = (
            f"Konteks Video Keseluruhan:\n"
            f"- Judul Video: {video_title}\n"
            f"- Overview: {video_overview}\n\n"
            f"{roadmap_str}"
            f"FOKUS PENULISAN BABAK INI:\n"
            f"- Babak: {chapter_title} (Babak {chapter_index} dari {total_chapters})\n"
            f"- Sinopsis Babak: {chapter_synopsis}\n"
            f"- Poin Kunci yang Harus Dibahas:\n{kp_str}\n\n"
            f"TARGET TEKNIS:\n"
            f"- Target Kata Narasi Babak Ini: Minimal {min_chapter_words} kata (target ~{target_chapter_words} kata)\n"
            f"- Struktur Babak: Tepat {target_segments} segmen, masing-masing {images_per_segment} scenes (Total tepat {total_chapter_scenes} scenes)\n"
            f"- Tone: {tone}\n"
            f"- Bahasa: BAHASA INDONESIA\n"
            f"- Gaya Visual Preset: {preset_label}\n"
            f"{char_remind_str}"
        )
        if custom_instructions:
            user_prompt += f"- Instruksi Tambahan: {custom_instructions}\n"

        user_prompt += (
            f"\nTuliskan naskah lengkap Babak {chapter_index} sekarang dalam format JSON murni.\n"
            f"PENTING: Pastikan alur cerita menyambung secara alami dengan roadmap di atas, memenuhi minimal {min_chapter_words} kata, BEBAS token variabel pada teks narasi (tulis nama asli tokoh biasa), dan TANPA tanda titik dua (:) atau titik koma (;)."
        )
    return system_prompt, user_prompt


def build_storyboard_prompt(
    topic: str,
    duration_mins: int = 5,
    tone: str = "santai",
    images_per_segment: int = 2,
    preset: Optional[Any] = None,
    custom_instructions: Optional[str] = None,
    existing_characters: Optional[List[Dict[str, Any]]] = None,
    existing_locations: Optional[List[Dict[str, Any]]] = None,
    existing_world_setting: Optional[Dict[str, Any]] = None,
    language: str = "id",
) -> Tuple[str, str]:
    """Build system and user prompts for single-shot long-form storyboard scriptwriting + Story Continuity Bible."""
    target_words = max(400, int(duration_mins * 135))
    min_words = int(target_words * 0.90)
    max_words = int(target_words * 1.10)

    # Visual pacing: 1 illustration per ~7.5-8.5 seconds (each scene ~16-22 spoken words)
    seconds_per_scene = 8.0
    total_scenes = max(10, int(round((duration_mins * 60) / seconds_per_scene)))
    target_segments = max(4, int(round(total_scenes / max(1, images_per_segment))))
    num_chapters = max(3, min(6, int(round(duration_mins * 0.7))))

    visual_guidelines, example_prompt_1, example_prompt_2, preset_label = _build_visual_guidelines(preset)
    tone_guidelines = _format_tone_storytelling_guidelines(tone, language)
    continuity_instruction = _format_continuity_bible_instructions(
        characters=existing_characters,
        locations=existing_locations,
        world_setting=existing_world_setting,
        language=language,
    )

    if language == "en":
        system_prompt = (
            "You are a world-class Master Storyteller, Visual Director & Scriptwriter for YouTube documentary/explainer videos.\n"
            "Your task is to write an in-depth, captivating long-form video narration script (landscape 16:9) in ENGLISH, "
            "structured into visual scenes with PERFECT 1-to-1 synchronization between the spoken English narration and the illustration prompts, "
            "AND formulate a complete Story Continuity Bible (character variants, locations, world setting) with tokenized variable prompts.\n\n"
            "=== CRITICAL LANGUAGE INSTRUCTION ===\n"
            "All narration text (`narration_text`), titles, and overview MUST be written in natural, engaging spoken ENGLISH. "
            "Under NO circumstances should Indonesian be used in the narration text.\n\n"
            f"{tone_guidelines}"
            f"{continuity_instruction}"
            "=== AUDIO-VISUAL COUPLING (1-TO-1) ===\n"
            f"1. Exactly {images_per_segment} scenes per segment.\n"
            "2. Each scene has paired `narration_text` and `image_prompt`.\n"
            "3. `narration_text`: 1–2 complete, expressive sentences in ENGLISH (18–25 words per scene). NEVER include bracket tokens ([char:...]), semicolons (;), or colons (:).\n"
            "4. `image_prompt`: Concise English illustration prompt using variable tokens (`[preset:style]`, `[char:id:variant]`, `[loc:id]`).\n\n"
            f"{visual_guidelines}"
            "4. TARGET WORD COUNT & STORY STRUCTURE:\n"
            f"- Target Total Speech Duration: {duration_mins} Minutes.\n"
            f"- Target Total Narration Words: ~{target_words} words (strict range {min_words}–{max_words} words).\n"
            f"- Tone: {tone}. Dynamic, smart, conversational English.\n\n"
            "=== OUTPUT FORMAT (STRICT PURE JSON ONLY) ===\n"
            "Return ONLY valid JSON matching this schema:\n"
            "{\n"
            '  "title": "Engaging Video Title in English",\n'
            '  "overview": "Short 1-2 sentence synopsis in English",\n'
            '  "world_setting": {\n'
            '    "era": "Historical or futuristic era setting",\n'
            '    "time_setting": "Traditional Past / Modern",\n'
            '    "atmosphere": "Visual lighting and mood"\n'
            "  },\n"
            '  "characters": [\n'
            "    {\n"
            '      "id": "char_id",\n'
            '      "name": "Character Name",\n'
            '      "role": "Protagonist",\n'
            '      "visual_anchor": "Default physical description in English",\n'
            '      "variants": [\n'
            "        {\n"
            '          "variant_id": "young",\n'
            '          "label": "Youth / Young Version",\n'
            '          "visual_anchor": "Specific physical traits and outfit for young stage"\n'
            "        }\n"
            "      ]\n"
            "    }\n"
            "  ],\n"
            '  "locations": [\n'
            "    {\n"
            '      "id": "loc_id",\n'
            '      "name": "Location Name",\n'
            '      "environment_anchor": "Specific architectural and landscape description in English"\n'
            "    }\n"
            "  ],\n"
            '  "chapters": [\n'
            "    {\n"
            '      "chapter_title": "Chapter 1: The Ocean Mystery",\n'
            '      "segments": [\n'
            "        {\n"
            '          "segment_id": "seg-1",\n'
            '          "scenes": [\n'
            "            {\n"
            '              "scene_id": "scene-1",\n'
            '              "narration_text": "Across the tranquil ocean, ancient navigators steered their wooden ships by the silent constellations burning in the night sky.",\n'
            '              "image_prompt": "A cinematic 16:9 shot in [preset:style] of [char:char_id:variant_id] on [loc:loc_id], looking through a brass spyglass under night sky."\n'
            "            }\n"
            "          ]\n"
            "        }\n"
            "      ]\n"
            "    }\n"
            "  ]\n"
            "}"
        )

        user_prompt = (
            f"Video Topic: {topic}\n"
            f"Target Duration: {duration_mins} minutes (~{target_words} words, minimum {min_words} words)\n"
            f"AI Visual Style Preset: {preset_label}\n"
            f"Structure: {num_chapters} Chapters, ~{target_segments} segments, exactly {images_per_segment} scenes per segment (total ~{total_scenes} scenes)\n"
            f"Tone: {tone}\n"
            "Language: ENGLISH (Write all narration exclusively in English)\n"
        )
    else:
        system_prompt = (
            "Anda adalah Master Storyteller, Sutradara Visual & Scriptwriter kelas dunia untuk video dokumenter/explainer YouTube "
            "(gaya penceritaan sinematik mendalam, memikat emosi penonton, dan berbobot).\n"
            "Tugas Anda adalah menulis naskah narasi video panjang (landscape 16:9) yang mendalam, memikat, dan terstruktur "
            "ke dalam adegan-adegan visual (scenes) dengan sinkronisasi 1-to-1 yang SEMPURNA antara kalimat narasi dan prompt gambar,\n"
            "SERTA menyusun Story Continuity Bible (varian bentuk/usia karakter, latar tempat, dan era waktu kejadian) menggunakan prompt berbasis token variabel.\n\n"
            f"{tone_guidelines}"
            f"{continuity_instruction}"
            "=== PRINSIP KEKUATAN AUDIO-VISUAL (SINKRON & TIDAK AMBIGU) ===\n"
            "1. KOPLING 1-TO-1 (1 Adegan = Tepat 1 Kalimat Narasi & 1 Prompt Visual):\n"
            f"   - Setiap segmen dipecah menjadi tepat sejumlah adegan (scenes) sesuai parameter `Jumlah Gambar per Segmen` ({images_per_segment} scene per segmen).\n"
            "   - Setiap adegan (scene) WAJIB memiliki `narration_text` dan `image_prompt` yang berpasangan secara langsung.\n"
            "   - `narration_text`: 1–2 kalimat narasi utuh yang tuntas, mendalam, dan alami (panjang 16–22 kata per scene). JANGAN membuat kalimat terlalu pendek! DILARANG KERAS menyertakan token variabel kurung siku (seperti [char:...]), titik dua (:), atau titik koma (;).\n"
            "   - `image_prompt`: Prompt visual ringkas (Bahasa Inggris) yang menyematkan token variabel `[preset:style]`, `[char:id:variant]`, dan `[loc:id]` secara tepat.\n\n"
            f"{visual_guidelines}"
            "4. TARGET PANJANG KATA & STRUKTUR CERITA:\n"
            f"- Target Total Durasi Bicara: {duration_mins} Menit.\n"
            f"- Target Total Kata Narasi: Sekitar {target_words} kata (rentang ketat {min_words}–{max_words} kata). Naskah narasi WAJIB memenuhi target kata ini!\n"
            f"- Struktur Keseluruhan: {num_chapters} Babak, sekitar {target_segments} Segmen (total tepat ~{total_scenes} adegan visual scenes).\n"
            f"- Nada Bicara (Tone): {tone}.\n\n"
            "=== FORMAT KELUARAN (WAJIB JSON MURNI) ===\n"
            "Kembalikan HANYA JSON valid tanpa teks pembuka/penutup dengan struktur hierarkis berikut:\n"
            "{\n"
            '  "title": "Judul Menarik Video",\n'
            '  "overview": "Sinopsis singkat 1-2 kalimat",\n'
            '  "world_setting": {\n'
            '    "era": "Zaman Kerajaan Kuno Nusantara Abad ke-14",\n'
            '    "time_setting": "Masa Lalu Tradisional",\n'
            '    "atmosphere": "Warm vintage cinematic with stormy contrast in climax"\n'
            "  },\n"
            '  "characters": [\n'
            "    {\n"
            '      "id": "malin",\n'
            '      "name": "Malin Kundang",\n'
            '      "role": "Tokoh Utama",\n'
            '      "visual_anchor": "a lean Indonesian man with expressive eyes...",\n'
            '      "variants": [\n'
            "        {\n"
            '          "variant_id": "muda",\n'
            '          "label": "Masa Kecil / Nelayan",\n'
            '          "visual_anchor": "a lean young Indonesian boy in faded crimson red shirt and udeng headband"\n'
            "        },\n"
            "        {\n"
            '          "variant_id": "batu",\n'
            '          "label": "Patung Batu Sujud",\n'
            '          "visual_anchor": "a dramatic weathered grey andesite stone statue in prostrating kneeling pose (sujud)"\n'
            "        }\n"
            "      ]\n"
            "    }\n"
            "  ],\n"
            '  "locations": [\n'
            "    {\n"
            '      "id": "pesisir_air_manis",\n'
            '      "name": "Pesisir Pantai Air Manis",\n'
            '      "environment_anchor": "traditional coastal Indonesian village, simple wooden stilt huts with thatched nipah palm roofs, coconut palms leaning over sandy beach"\n'
            "    }\n"
            "  ],\n"
            '  "chapters": [\n'
            "    {\n"
            '      "chapter_title": "Babak 1: Misteri di Lautan Lepas",\n'
            '      "segments": [\n'
            "        {\n"
            '          "segment_id": "seg-1",\n'
            '          "scenes": [\n'
            "            {\n"
            '              "scene_id": "scene-1",\n'
            '              "narration_text": "Di tengah samudra yang tampak tenang, para pelaut kuno mengarungi ombak hanya berpedoman pada rasi bintang yang berpijar di langit malam.",\n'
            '              "image_prompt": "A cinematic 16:9 shot in [preset:style] of [char:malin:muda] on [loc:pesisir_air_manis], looking out towards horizon with ambitious eyes under gentle morning sunlight."\n'
            "            }\n"
            "          ]\n"
            "        }\n"
            "      ]\n"
            "    }\n"
            "  ]\n"
            "}"
        )

        user_prompt = (
            f"Topik Video: {topic}\n"
            f"Target Durasi: {duration_mins} menit (~{target_words} kata, minimal {min_words} kata)\n"
            f"Gaya Visual Preset AI: {preset_label}\n"
            f"Struktur: {num_chapters} Babak, sekitar {target_segments} segmen, tepat {images_per_segment} scenes per segmen (total ~{total_scenes} adegan visual)\n"
            f"Tone: {tone}\n"
            f"Jumlah Gambar per Segmen: {images_per_segment} scene per segmen\n"
            "Bahasa: BAHASA INDONESIA\n"
        )
    if existing_characters:
        user_prompt += f"Karakter yang telah dikunci sebelumnya: {json.dumps(existing_characters, ensure_ascii=False)}\n"
    if existing_locations:
        user_prompt += f"Latar tempat yang telah dikunci sebelumnya: {json.dumps(existing_locations, ensure_ascii=False)}\n"
    if existing_world_setting:
        user_prompt += f"Setting dunia/era sebelumnya: {json.dumps(existing_world_setting, ensure_ascii=False)}\n"
    if custom_instructions:
        user_prompt += f"Instruksi Tambahan: {custom_instructions}\n"

    user_prompt += (
        f"\nTuliskan naskah narasi lengkap dan Story Continuity Bible sekarang dalam format JSON murni.\n"
        f"PENTING SEKALI TENTANG PANJANG KATA & DURASI:\n"
        f"- Target durasi bicara adalah {duration_mins} menit penuh.\n"
        f"- Total kata narasi WAJIB mencapai minimal {min_words} kata (target ideal ~{target_words} kata).\n"
        f"- Kembangkan setiap scene menjadi 2 kalimat narasi yang padat, ekspresif, dan mendalam (18–25 kata per scene).\n"
        f"- Gunakan token variabel [preset:style], [char:id:variant], dan [loc:id] pada setiap image_prompt secara konsisten.\n"
        f"- DILARANG KERAS menyertakan token kurung siku (seperti [char:...]), titik dua (:), atau titik koma (;) pada narration_text!"
    )
    return system_prompt, user_prompt


def _split_text_into_subsegments(text: str, n_parts: int) -> List[str]:
    """Split segment text into n_parts subsegments aligned with visual cues (fallback)."""
    text = (text or "").strip()
    if n_parts <= 1 or not text:
        return [text] * max(1, n_parts)

    raw_sentences = re.split(r"(?<=[.!?])\s+", text)
    sentences = [s.strip() for s in raw_sentences if s.strip()]

    if len(sentences) == n_parts:
        return sentences

    if len(sentences) > n_parts:
        parts = []
        step = len(sentences) / n_parts
        for i in range(n_parts):
            start_idx = int(round(i * step))
            end_idx = int(round((i + 1) * step))
            chunk = " ".join(sentences[start_idx:end_idx]).strip()
            if chunk:
                parts.append(chunk)
        if len(parts) == n_parts:
            return parts

    # Fewer sentences than parts: Try splitting by natural clauses or conjunctions
    clause_delims = r"(?<=[,;:\—\-])\s+|(?<=\s)(?:namun|tetapi|sedangkan|sehingga|sementara|lalu|kemudian|di mana|ketika|saat)\s+"
    raw_clauses = re.split(clause_delims, text, flags=re.IGNORECASE)
    clauses = [c.strip() for c in raw_clauses if c.strip()]
    if len(clauses) >= n_parts:
        parts = []
        step = len(clauses) / n_parts
        for i in range(n_parts):
            start_idx = int(round(i * step))
            end_idx = int(round((i + 1) * step))
            chunk = " ".join(clauses[start_idx:end_idx]).strip()
            parts.append(chunk if chunk else text)
        if len(parts) == n_parts:
            return parts

    words = text.split()
    if len(words) >= n_parts * 2:
        step = len(words) / n_parts
        parts = []
        for i in range(n_parts):
            start_idx = int(round(i * step))
            end_idx = int(round((i + 1) * step))
            parts.append(" ".join(words[start_idx:end_idx]))
        return parts

    return [text] * n_parts


def extract_json_payload(raw_content: str) -> Dict[str, Any]:
    """Safely extract JSON from LLM output with fence and regex stripping."""
    text = raw_content.strip()

    # Remove markdown code fences
    fence_pattern = r"^```(?:json)?\s*\n?(.*?)\n?```$"
    match = re.search(fence_pattern, text, re.DOTALL | re.IGNORECASE)
    if match:
        text = match.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError as err:
                log.error("Failed to parse extracted JSON substring: %s", err)
        raise ValueError("Gagal mengurai respons AI ke dalam format JSON naskah storyboard.")


async def generate_storyboard_script(
    db: AsyncSession,
    project_id: str,
    topic: str,
    duration_mins: int = 5,
    tone: str = "santai",
    images_per_segment: int = 2,
    preset_id: Optional[str] = None,
    custom_instructions: Optional[str] = None,
    language: str = "id",
    reset_bible: bool = True,
) -> Tuple[Narration, List[StoryboardItem]]:
    """Generate long-form storyboard script and save Narration + StoryboardItem records."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise ValueError(f"Project {project_id} tidak ditemukan.")

    proj.language = language

    from app.models.image_preset import ImagePreset
    from app.services.image_studio import get_active_image_preset

    preset = None
    if preset_id:
        preset = await db.get(ImagePreset, preset_id)
    if not preset:
        preset = await get_active_image_preset(db)

    llm_adapter = await get_active_llm_adapter(db)

    # Calculate target words and chapter counts
    target_total_words = max(400, int(duration_mins * 135))
    num_chapters = max(2, min(8, int(round(duration_mins * 0.75))))
    words_per_chapter = int(round(target_total_words / num_chapters))
    scenes_per_chapter = max(images_per_segment * 2, int(round(words_per_chapter / 19)))
    segments_per_chapter = max(2, int(round(scenes_per_chapter / max(1, images_per_segment))))

    # Check if the story topic changed compared to previous narration or project name
    res_last_narration = await db.execute(
        select(Narration).where(Narration.project_id == project_id).order_by(Narration.created_at.desc()).limit(1)
    )
    last_narration = res_last_narration.scalar_one_or_none()
    last_topic = ((last_narration.topic if last_narration and last_narration.topic else proj.name) or "").strip().lower()
    clean_topic = topic.strip()
    topic_changed = bool(clean_topic and last_topic and clean_topic.lower() != last_topic)

    chapters: List[Dict[str, Any]] = []
    if reset_bible or topic_changed:
        log.info("Resetting Continuity Bible for project %s (reset_bible=%s, topic_changed=%s)", project_id, reset_bible, topic_changed)
        existing_characters = None
        existing_locations = None
        existing_world_setting = None
    else:
        existing_characters = proj.characters if (isinstance(proj.characters, list) and len(proj.characters) > 0) else None
        existing_locations = proj.locations if (isinstance(proj.locations, list) and len(proj.locations) > 0) else None
        existing_world_setting = proj.world_setting if (isinstance(proj.world_setting, dict) and len(proj.world_setting) > 0) else None

    detected_characters: List[Dict[str, Any]] = list(existing_characters) if existing_characters else []
    detected_locations: List[Dict[str, Any]] = list(existing_locations) if existing_locations else []
    detected_world_setting: Dict[str, Any] = dict(existing_world_setting) if existing_world_setting else {}

    # TWO-PHASE CHUNKED GENERATION (for duration_mins >= 3)
    if duration_mins >= 3:
        try:
            # PHASE 1: Generate Master Outline + Continuity Bible
            outline_sys, outline_usr = build_storyboard_outline_prompt(
                topic=topic,
                duration_mins=duration_mins,
                tone=tone,
                num_chapters=num_chapters,
                custom_instructions=custom_instructions,
                existing_characters=existing_characters,
                existing_locations=existing_locations,
                existing_world_setting=existing_world_setting,
                language=language,
            )
            log.info(
                "Phase 1: Generating Master Outline & Continuity Bible for project %s (topic='%s', dur=%dm, chapters=%d, target=%d words)...",
                project_id, topic, duration_mins, num_chapters, target_total_words
            )
            raw_outline = await llm_adapter.generate_chat(
                prompt=outline_usr,
                system_prompt=outline_sys,
                json_mode=True,
                timeout=90.0,
                max_tokens=4096,
            )
            outline_data = extract_json_payload(raw_outline)
            outline_chapters = outline_data.get("chapters", [])
            video_title = outline_data.get("title", topic)
            video_overview = outline_data.get("overview", f"Video explainer mengenai {topic}")
            if outline_data.get("characters"):
                detected_characters = outline_data.get("characters", []) or []
                log.info("Detected %d locked characters from outline: %s", len(detected_characters), [c.get("name") for c in detected_characters])
            if outline_data.get("locations"):
                detected_locations = outline_data.get("locations", []) or []
                log.info("Detected %d locations from outline: %s", len(detected_locations), [loc.get("name") for loc in detected_locations])
            if outline_data.get("world_setting"):
                detected_world_setting = outline_data.get("world_setting", {}) or {}
                log.info("Detected world setting from outline: %s", detected_world_setting.get("era"))

            if outline_chapters and len(outline_chapters) > 0:
                # PHASE 2: Expand each chapter concurrently with Semaphore
                sem = asyncio.Semaphore(2)

                async def _expand_single_chapter(ch_idx: int, ch_info: Dict[str, Any]) -> Dict[str, Any]:
                    async with sem:
                        ch_title = ch_info.get("chapter_title", f"Babak {ch_idx + 1}")
                        ch_synopsis = ch_info.get("synopsis", "")
                        ch_kp = ch_info.get("key_points", [])
                        log.info(
                            "Phase 2: Expanding chapter %d/%d ('%s') for project %s...",
                            ch_idx + 1, len(outline_chapters), ch_title, project_id
                        )

                        sys_p, usr_p = build_chapter_expansion_prompt(
                            video_title=video_title,
                            video_overview=video_overview,
                            chapter_index=ch_idx + 1,
                            total_chapters=len(outline_chapters),
                            chapter_title=ch_title,
                            chapter_synopsis=ch_synopsis,
                            chapter_key_points=ch_kp,
                            target_chapter_words=words_per_chapter,
                            target_segments=segments_per_chapter,
                            images_per_segment=images_per_segment,
                            tone=tone,
                            preset=preset,
                            custom_instructions=custom_instructions,
                            chapters_roadmap=outline_chapters,
                            characters=detected_characters,
                            locations=detected_locations,
                            world_setting=detected_world_setting,
                            language=language,
                        )

                        last_err = None
                        for attempt in range(2):
                            try:
                                raw_ch = await llm_adapter.generate_chat(
                                    prompt=usr_p,
                                    system_prompt=sys_p,
                                    json_mode=True,
                                    timeout=120.0,
                                    max_tokens=4096,
                                )
                                ch_res = extract_json_payload(raw_ch)
                                if not ch_res.get("chapter_title"):
                                    ch_res["chapter_title"] = ch_title
                                for s_seg in ch_res.get("segments", []):
                                    if isinstance(s_seg.get("scenes"), list):
                                        for sc in s_seg["scenes"]:
                                            if sc.get("narration_text"):
                                                sc["narration_text"] = clean_narration_for_tts(
                                                    sc["narration_text"],
                                                    characters=detected_characters,
                                                    locations=detected_locations,
                                                    world_setting=detected_world_setting,
                                                )
                                    elif s_seg.get("narration_text"):
                                        s_seg["narration_text"] = clean_narration_for_tts(
                                            s_seg["narration_text"],
                                            characters=detected_characters,
                                            locations=detected_locations,
                                            world_setting=detected_world_setting,
                                        )
                                return ch_res
                            except Exception as err:
                                last_err = err
                                log.warning("Attempt %d failed expanding chapter %d: %s", attempt + 1, ch_idx + 1, err)
                                if attempt == 0:
                                    await asyncio.sleep(1.0)
                        raise last_err or ValueError(f"Gagal generate babak {ch_idx + 1}")

                chapters_results = await asyncio.gather(*[
                    _expand_single_chapter(i, ch) for i, ch in enumerate(outline_chapters)
                ])
                chapters = list(chapters_results)
            else:
                log.warning("Master outline did not contain chapters, falling back to single-shot...")
        except Exception as e:
            log.warning("Two-phase storyboard generation encountered error: %s. Falling back to single-shot...", e)
            chapters = []

    # FALLBACK TO SINGLE-SHOT GENERATION (if duration < 3 or two-phase failed)
    if not chapters:
        log.info("Executing single-shot storyboard generation for project %s...", project_id)
        system_prompt, user_prompt = build_storyboard_prompt(
            topic=topic,
            duration_mins=duration_mins,
            tone=tone,
            images_per_segment=images_per_segment,
            preset=preset,
            custom_instructions=custom_instructions,
            existing_characters=existing_characters,
            existing_locations=existing_locations,
            existing_world_setting=existing_world_setting,
            language=language,
        )
        raw_response = await llm_adapter.generate_chat(
            prompt=user_prompt,
            system_prompt=system_prompt,
            json_mode=True,
            timeout=240.0,
            max_tokens=8192,
        )
        data = extract_json_payload(raw_response)
        chapters = data.get("chapters", [])
        if not chapters:
            raise ValueError("Respons AI tidak mengandung data chapters.")
        if data.get("characters"):
            detected_characters = data.get("characters", []) or []
            log.info("Detected %d locked characters from single-shot: %s", len(detected_characters), [c.get("name") for c in detected_characters])
        if data.get("locations"):
            detected_locations = data.get("locations", []) or []
            log.info("Detected %d locations from single-shot: %s", len(detected_locations), [loc.get("name") for loc in detected_locations])
        if data.get("world_setting"):
            detected_world_setting = data.get("world_setting", {}) or {}
            log.info("Detected world setting from single-shot: %s", detected_world_setting.get("era"))

        for ch in chapters:
            for s_seg in ch.get("segments", []):
                if isinstance(s_seg.get("scenes"), list):
                    for sc in s_seg["scenes"]:
                        if sc.get("narration_text"):
                            sc["narration_text"] = clean_narration_for_tts(
                                sc["narration_text"],
                                characters=detected_characters,
                                locations=detected_locations,
                                world_setting=detected_world_setting,
                            )
                elif s_seg.get("narration_text"):
                    s_seg["narration_text"] = clean_narration_for_tts(
                        s_seg["narration_text"],
                        characters=detected_characters,
                        locations=detected_locations,
                        world_setting=detected_world_setting,
                    )

    # Flatten segments for the Narration model
    all_segments: List[Dict[str, Any]] = []
    full_script_lines: List[str] = []
    storyboard_items: List[StoryboardItem] = []

    motion_cycle = ["zoom_in", "zoom_out", "pan_left", "pan_right"]
    global_img_order = 0
    seg_counter = 1

    for chap_idx, chapter in enumerate(chapters):
        chap_title = chapter.get("chapter_title", f"Babak {chap_idx + 1}")
        for seg in chapter.get("segments", []):
            scenes = seg.get("scenes")

            # PRIMARY FORMAT: 1-to-1 Discrete Scenes inside each segment
            if isinstance(scenes, list) and len(scenes) > 0:
                for scene_idx, scene in enumerate(scenes):
                    scene_text = clean_narration_for_tts(
                        scene.get("narration_text") or "",
                        characters=detected_characters,
                        locations=detected_locations,
                        world_setting=detected_world_setting,
                    ).strip()
                    scene_prompt = (scene.get("image_prompt") or "").strip()
                    if not scene_text and not scene_prompt:
                        continue
                    if not scene_text:
                        scene_text = "..."
                    if not scene_prompt:
                        if preset:
                            scene_prompt = f"Scene illustration in the visual style of {preset.name} representing {scene_text[:80]}"
                        else:
                            scene_prompt = f"Minimalist stickman illustration on warm vintage parchment representing {scene_text[:80]}"

                    sub_seg_id = f"seg-{seg_counter}_{scene_idx + 1}" if len(scenes) > 1 else f"seg-{seg_counter}"
                    all_segments.append({
                        "id": sub_seg_id,
                        "chapter": chap_title,
                        "text": scene_text,
                        "image_count": 1,
                        "start_ms": 0,
                        "end_ms": 0,
                    })
                    full_script_lines.append(scene_text)

                    motion = motion_cycle[global_img_order % len(motion_cycle)]
                    item = StoryboardItem(
                        project_id=project_id,
                        chapter_title=chap_title,
                        segment_id=sub_seg_id,
                        order_index=global_img_order,
                        script_text=scene_text,
                        image_prompt=scene_prompt,
                        motion_effect=motion,
                        status="pending",
                    )
                    storyboard_items.append(item)
                    global_img_order += 1

                seg_counter += 1
                continue

            # SECONDARY / FALLBACK FORMAT: segment with narration_text and image_prompts list
            seg_text = clean_narration_for_tts(
                seg.get("narration_text") or "",
                characters=detected_characters,
                locations=detected_locations,
                world_setting=detected_world_setting,
            ).strip()
            if not seg_text:
                continue

            img_prompts = seg.get("image_prompts", [])
            if not isinstance(img_prompts, list) or len(img_prompts) == 0:
                img_prompts = [f"Illustration representing {seg_text[:80]}"]

            # If a segment has multiple images, split the segment into subsegments
            if len(img_prompts) > 1:
                sub_texts = _split_text_into_subsegments(seg_text, len(img_prompts))
                for sub_idx, (sub_text, prompt) in enumerate(zip(sub_texts, img_prompts, strict=False)):
                    clean_sub = clean_narration_for_tts(
                        sub_text,
                        characters=detected_characters,
                        locations=detected_locations,
                        world_setting=detected_world_setting,
                    ).strip()
                    sub_seg_id = f"seg-{seg_counter}_{sub_idx + 1}"
                    all_segments.append({
                        "id": sub_seg_id,
                        "chapter": chap_title,
                        "text": clean_sub,
                        "image_count": 1,
                        "start_ms": 0,
                        "end_ms": 0,
                    })
                    full_script_lines.append(clean_sub)

                    motion = motion_cycle[global_img_order % len(motion_cycle)]
                    item = StoryboardItem(
                        project_id=project_id,
                        chapter_title=chap_title,
                        segment_id=sub_seg_id,
                        order_index=global_img_order,
                        script_text=clean_sub,
                        image_prompt=str(prompt).strip(),
                        motion_effect=motion,
                        status="pending",
                    )
                    storyboard_items.append(item)
                    global_img_order += 1
            else:
                single_seg_id = f"seg-{seg_counter}"
                all_segments.append({
                    "id": single_seg_id,
                    "chapter": chap_title,
                    "text": seg_text,
                    "image_count": 1,
                    "start_ms": 0,
                    "end_ms": 0,
                })
                full_script_lines.append(seg_text)

                motion = motion_cycle[global_img_order % len(motion_cycle)]
                item = StoryboardItem(
                    project_id=project_id,
                    chapter_title=chap_title,
                    segment_id=single_seg_id,
                    order_index=global_img_order,
                    script_text=seg_text,
                    image_prompt=str(img_prompts[0]).strip(),
                    motion_effect=motion,
                    status="pending",
                )
                storyboard_items.append(item)
                global_img_order += 1

            seg_counter += 1

    raw_script = "\n\n".join(full_script_lines)
    word_count = len(raw_script.split()) if raw_script else 0
    actual_duration_seconds = max(1, int(round((word_count / 135) * 60))) if word_count > 0 else (duration_mins * 60)

    log.info(
        "Storyboard script generated: %d words, ~%d seconds (~%.1f mins), %d segments, %d image slots",
        word_count, actual_duration_seconds, actual_duration_seconds / 60, len(all_segments), len(storyboard_items)
    )

    # Delete older narration, storyboard items, and audio tracks for this project
    await db.execute(delete(StoryboardItem).where(StoryboardItem.project_id == project_id))
    await db.execute(delete(AudioTrack).where(AudioTrack.project_id == project_id))
    await db.execute(delete(Narration).where(Narration.project_id == project_id))

    narration = Narration(
        project_id=project_id,
        topic=topic,
        tone=tone,
        target_duration=actual_duration_seconds,
        raw_text=raw_script,
        segments=all_segments,
        status="generated",
        language=language,
    )
    db.add(narration)
    await db.flush()

    for item in storyboard_items:
        item.narration_id = narration.id
        db.add(item)

    if clean_topic:
        proj.name = clean_topic
    # Clear stale YouTube metadata because script and story topic have been regenerated
    proj.youtube_metadata = {}

    proj.characters = detected_characters
    proj.locations = detected_locations
    proj.world_setting = detected_world_setting
    proj.status = "ready"
    await db.commit()
    await db.refresh(narration)
    await db.refresh(proj)

    log.info("Successfully created narration with %d segments and %d storyboard image slots.", len(all_segments), len(storyboard_items))
    return narration, storyboard_items


async def sync_storyboard_timing_from_alignment(
    db: AsyncSession,
    project_id: str,
    aligned_segments: List[Dict[str, Any]],
) -> None:
    """Sync start_time, end_time, and duration of StoryboardItems with Whisper audio alignment."""
    res = await db.execute(
        select(StoryboardItem)
        .where(StoryboardItem.project_id == project_id)
        .order_by(StoryboardItem.order_index)
    )
    items = list(res.scalars().all())
    if not items or not aligned_segments:
        return

    aligned_map = {seg.get("id"): seg for seg in aligned_segments if seg.get("id")}

    # Group items by segment_id
    items_by_seg: Dict[str, List[StoryboardItem]] = {}
    for item in items:
        items_by_seg.setdefault(item.segment_id, []).append(item)

    # Distribute timing from Whisper alignment
    for seg_id, seg_items in items_by_seg.items():
        seg = aligned_map.get(seg_id)
        if not seg:
            continue

        seg_start_sec = float(seg.get("start_ms", 0)) / 1000.0
        seg_end_sec = float(seg.get("end_ms", 0)) / 1000.0
        seg_duration = max(seg_end_sec - seg_start_sec, 1.0)

        count = len(seg_items)
        if count == 1:
            item = seg_items[0]
            item.start_time = round(seg_start_sec, 3)
            item.end_time = round(seg_end_sec, 3)
            item.duration = round(seg_duration, 3)
        elif count > 1:
            # Distribute proportionally by word count
            word_counts = [max(1, len((it.script_text or "").split())) for it in seg_items]
            total_words = sum(word_counts)
            cur_time = seg_start_sec
            for idx, item in enumerate(seg_items):
                fraction = word_counts[idx] / total_words
                it_dur = round(seg_duration * fraction, 3)
                item.start_time = round(cur_time, 3)
                item.end_time = round(cur_time + it_dur, 3)
                item.duration = it_dur
                cur_time += it_dur

    # Continuity check: ensure monotonic timestamps and prevent unassigned gaps
    cur_t = 0.0
    for item in items:
        if item.end_time <= item.start_time or item.duration <= 0.0:
            w_count = len((item.script_text or "").split())
            calc_dur = max(3.0, round(w_count * 0.4, 2))
            item.start_time = round(cur_t, 3)
            item.duration = calc_dur
            item.end_time = round(cur_t + calc_dur, 3)
        cur_t = max(cur_t, item.end_time)

    await db.commit()
    log.info("Synchronized timing for %d storyboard items in project %s.", len(items), project_id)


async def extract_storyboard_continuity_bible_from_script(
    db: AsyncSession,
    project_id: str,
    custom_instructions: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Extract Story Continuity Bible (characters & variants, locations, world setting)
    directly from the existing narration/script of the project using LLM.
    """
    proj = await db.get(Project, project_id)
    if not proj:
        raise ValueError(f"Project {project_id} tidak ditemukan.")

    # 1. Gather all narration text from Narration or StoryboardItems
    narration_query = await db.execute(select(Narration).where(Narration.project_id == project_id))
    narrations = narration_query.scalars().all()
    narration = narrations[0] if narrations else None

    items_query = await db.execute(
        select(StoryboardItem)
        .where(StoryboardItem.project_id == project_id)
        .order_by(StoryboardItem.order_index)
    )
    items = items_query.scalars().all()

    text_parts = []
    if narration and narration.raw_text:
        text_parts.append(narration.raw_text)
    elif narration and narration.segments:
        for seg in narration.segments:
            if isinstance(seg, dict) and seg.get("text"):
                text_parts.append(seg.get("text"))

    if not text_parts and items:
        for it in items:
            if it.script_text:
                text_parts.append(it.script_text)

    full_story_text = "\n\n".join(text_parts).strip()
    if not full_story_text:
        raise ValueError("Naskah cerita belum tersedia. Buat atau generate naskah terlebih dahulu sebelum mengekstrak karakter.")

    llm_adapter = await get_active_llm_adapter(db)

    system_prompt = (
        "You are an Elite Visual Story Director, Character Supervisor, and Script Analyst for cinematic video production.\n"
        "Your task is to thoroughly analyze the provided story script and extract the definitive 'Story Continuity Bible':\n\n"
        "1. ALL CHARACTERS (`characters`):\n"
        "   Extract EVERY character who appears, speaks, or acts in the story (protagonists, antagonists, mentors, companions, supporting roles).\n"
        "   Do NOT arbitrarily limit the count to 3 or 4; if 5, 6, 8, or more characters are in the script, list ALL of them.\n"
        "   For each character provide:\n"
        "   - `id`: Unique short lowercase slug (e.g. 'aladin', 'penyihir', 'jasmine', 'sultan', 'jin').\n"
        "   - `name`: Full character name in Indonesian or original story name.\n"
        "   - `role`: Role in narrative ('Tokoh Utama / Protagonist', 'Antagonis', 'Pendukung', etc.).\n"
        "   - `visual_anchor`: Detailed, consistent visual description in ENGLISH suitable for image generation prompts "
        "     (exact age/range, ethnic appearance/skin tone, facial structure, eye color, hair style/color, facial hair, body build, signature attire/costume with colors & fabric textures, accessories/weapons).\n"
        "   - `variants`: If the character undergoes visual changes (aging from youth to adult, poor vs royal costume, magical transformation or statue form), provide distinct variants:\n"
        "     * `variant_id`: Short slug ('muda', 'dewasa', 'batu', 'raja', etc.)\n"
        "     * `label`: Descriptive label (e.g. 'Masa Muda', 'Bentuk Patung Batu')\n"
        "     * `visual_anchor`: Specific English physical & costume description for that stage.\n\n"
        "2. RECURRING LOCATIONS (`locations`):\n"
        "   Identify 2 to 6 key distinct locations/settings where events take place:\n"
        "   - `id`: Short slug (e.g. 'istana_agrabah', 'gua_keajaiban', 'pasar_kota').\n"
        "   - `name`: Full location name.\n"
        "   - `environment_anchor`: Detailed architectural, environmental, and lighting description in ENGLISH.\n\n"
        "3. WORLD SETTING & ERA (`world_setting`):\n"
        "   - `era`: Specific historical period or universe setting (e.g. 'Zaman Kerajaan Maritim Nusantara Abad ke-14', 'Ancient Middle Eastern Golden Age').\n"
        "   - `time_setting`: Narrative timeline (e.g. 'Masa Lalu Tradisional', 'Masa Depan').\n"
        "   - `atmosphere`: Visual mood, color palette, and cinematic lighting progression.\n\n"
        "=== STRICT OUTPUT FORMAT (PURE JSON ONLY) ===\n"
        "Return ONLY a valid JSON object matching this schema without any markdown formatting or commentary:\n"
        "{\n"
        '  "world_setting": {\n'
        '    "era": "...",\n'
        '    "time_setting": "...",\n'
        '    "atmosphere": "..."\n'
        '  },\n'
        '  "characters": [\n'
        '    {\n'
        '      "id": "char_slug",\n'
        '      "name": "Nama Karakter",\n'
        '      "role": "Peran",\n'
        '      "visual_anchor": "Detailed English visual description...",\n'
        '      "variants": [\n'
        '        {\n'
        '          "variant_id": "muda",\n'
        '          "label": "Masa Muda",\n'
        '          "visual_anchor": "Specific visual description for young variant..."\n'
        '        }\n'
        '      ]\n'
        '    }\n'
        '  ],\n'
        '  "locations": [\n'
        '    {\n'
        '      "id": "loc_slug",\n'
        '      "name": "Nama Lokasi",\n'
        '      "environment_anchor": "Detailed English environment description..."\n'
        '    }\n'
        '  ]\n'
        "}"
    )

    script_topic = (narration.topic if narration and narration.topic else proj.name) or "Story Script"

    user_prompt = (
        f"Topic / Story Title: {script_topic}\n\n"
        f"Naskah Cerita Lengkap:\n"
        f"\"\"\"\n{full_story_text}\n\"\"\"\n\n"
        + (f"Instruksi Tambahan Pengguna:\n{custom_instructions}\n\n" if custom_instructions else "")
        + "Ekstrak seluruh karakter, varian wujud, latar tempat, dan era setting dari naskah di atas ke dalam format JSON Continuity Bible."
    )

    log.info("Extracting Continuity Bible from script for project %s (script length=%d chars)...", project_id, len(full_story_text))
    raw_response = await llm_adapter.generate_chat(
        prompt=user_prompt,
        system_prompt=system_prompt,
        json_mode=True,
        timeout=90.0,
        max_tokens=4096,
    )

    data = extract_json_payload(raw_response)
    characters = data.get("characters", []) or []
    locations = data.get("locations", []) or []
    world_setting = data.get("world_setting", {}) or {}

    proj.characters = characters
    proj.locations = locations
    proj.world_setting = world_setting
    if narration and narration.topic and narration.topic.strip():
        proj.name = narration.topic.strip()
    # Reset stale YouTube metadata
    proj.youtube_metadata = {}

    await db.commit()
    await db.refresh(proj)
    log.info(
        "Successfully extracted %d characters, %d locations, era='%s' for project %s",
        len(characters), len(locations), world_setting.get("era"), project_id
    )

    return {
        "success": True,
        "characters": characters,
        "locations": locations,
        "world_setting": world_setting,
    }

