from typing import Dict, List, Optional, Tuple

from app.schemas.discovery import PresetCategory

# 7 Pilar Preset Video Sumber — Format Dokumenter Proses / Satisfying Curiosity
PRESET_CATEGORIES: List[PresetCategory] = [
    PresetCategory(
        id="factory",
        title="Pabrik & Manufaktur",
        description="Lini produksi modern, otomasi mesin pabrik, dan cara benda dibuat dari bahan mentah.",
        badge="🏭 Pabrik",
        search_query="how it is made factory mass production process no talking",
        icon_name="Factory",
    ),
    PresetCategory(
        id="farming",
        title="Pertanian & Panen",
        description="Proses tanam, panen, dan olah hasil bumi di desa maupun perkebunan modern.",
        badge="🌾 Pertanian",
        search_query="traditional farming harvest process village no talking",
        icon_name="Sprout",
    ),
    PresetCategory(
        id="food",
        title="Makanan & Kuliner Proses",
        description="Pembuatan makanan skala besar, street food artisan, dan olahan tradisional.",
        badge="🍲 Makanan",
        search_query="traditional food making process village factory satisfying",
        icon_name="Sparkles",
    ),
    PresetCategory(
        id="craft",
        title="Kerajinan & Teknik Unik",
        description="Bata, kayu, bambu, keramik, tenun: teknik pengerjaan tangan yang memicu rasa penasaran.",
        badge="🔨 Kerajinan",
        search_query="traditional craft process village unique technique how it is made",
        icon_name="Hammer",
    ),
    PresetCategory(
        id="restoration",
        title="Restorasi & Perbaikan",
        description="Transformasi benda berkarat, barang antik, dan mesin tua hingga kembali seperti baru.",
        badge="🔧 Restorasi",
        search_query="satisfying restoration rusty antique tool repair no talking",
        icon_name="Wrench",
    ),
    PresetCategory(
        id="engineering",
        title="Mesin, CNC & Metalurgi",
        description="Proses penempaan baja, pengecoran logam, bubut CNC, dan mesin industri presisi.",
        badge="⚙️ Mesin & Logam",
        search_query="cnc machining forging steel metalworking process documentary",
        icon_name="HardHat",
    ),
    PresetCategory(
        id="nature_harvest",
        title="Panen Alam & Laut",
        description="Panen madu hutan, tambak garam, penangkapan ikan tradisional, dan eksplorasi alam.",
        badge="🏔️ Alam & Laut",
        search_query="honey harvesting deep sea fishing traditional process documentary",
        icon_name="Mountain",
    ),
]

# Query rotation pool per preset: tiap halaman memakai variasi query berbeda agar pool tidak cepat habis
PRESET_QUERY_POOLS: Dict[str, List[str]] = {
    "factory": [
        "how it is made factory mass production process no talking",
        "modern factory production line manufacturing documentary",
        "amazing industrial manufacturing process inside factory",
        "automated factory packaging machine food glass steel process",
        "mass production in factory step by step process",
        "artisan vs factory production process documentary",
    ],
    "farming": [
        "traditional farming harvest process village no talking",
        "amazing agriculture harvesting machine farm process",
        "rural village rice tea coffee cocoa harvest processing",
        "modern greenhouse harvest agriculture technology documentary",
        "traditional irrigation soil farming technique documentary",
        "fruit vegetable harvest sorting factory farm process",
    ],
    "food": [
        "traditional food making process village factory satisfying",
        "artisan street food mass production preparation no talking",
        "traditional noodle tofu cheese sugar making process",
        "bakery chocolate candy factory production line satisfying",
        "fish drying fermentation salt food processing village",
        "asmr cooking huge pot traditional food process",
    ],
    "craft": [
        "traditional craft process village unique technique how it is made",
        "handmade pottery weaving bamboo wood craft no talking",
        "japanese traditional woodworking joinery craft documentary",
        "artisan glassblowing ceramics leather craft workshop",
        "handmade brick tile paper making traditional village",
        "master craftsman carving sculpting workshop process",
    ],
    "restoration": [
        "satisfying restoration rusty antique tool repair no talking",
        "full restoration vintage machine engine workshop asmr",
        "rusty knife axe watch restoration satisfying process",
        "old furniture wood boat restoration transformation process",
        "vintage camera bike mechanical restoration workshop",
        "cleaning restoring muddy carpet engine metal satisfying",
    ],
    "engineering": [
        "cnc machining forging steel metalworking process documentary",
        "blacksmith sword hammer anvil forging metal process",
        "hydraulic press foundry molten metal casting factory",
        "shipbuilding bridge construction heavy engineering timelapse",
        "precision lathe milling machine steel gear manufacturing",
        "copper wire motor transformer winding factory process",
    ],
    "nature_harvest": [
        "honey harvesting deep sea fishing traditional process documentary",
        "traditional salt harvesting sea evaporation process",
        "wild honey cliff harvesting forest foraging process",
        "crab lobster deep sea fishing boat catch process",
        "bamboo charcoal sulfur mining mountain workers process",
        "oyster pearl seaweed harvesting ocean farm process",
    ],
}

# Suffix ringan untuk memperluas custom query pada halaman > 1
_CUSTOM_PAGE_SUFFIXES = [
    "",
    "process documentary",
    "no talking",
    "how it is made",
    "satisfying workshop",
    "step by step",
]


def get_preset_categories() -> List[PresetCategory]:
    return PRESET_CATEGORIES


def resolve_query_for_page(
    preset_id: Optional[str],
    custom_query: Optional[str],
    page: int = 1,
) -> Tuple[str, Optional[str]]:
    """Return `(query_used, resolved_preset_id)` rotating variations across pages."""
    safe_page = max(1, page)

    if custom_query and custom_query.strip():
        base = custom_query.strip()
        suffix = _CUSTOM_PAGE_SUFFIXES[(safe_page - 1) % len(_CUSTOM_PAGE_SUFFIXES)]
        if suffix and suffix.lower() not in base.lower():
            return f"{base} {suffix}", None
        return base, None

    selected_preset = None
    if preset_id:
        for p in PRESET_CATEGORIES:
            if p.id == preset_id:
                selected_preset = p
                break

    if not selected_preset:
        selected_preset = PRESET_CATEGORIES[0]

    pool = PRESET_QUERY_POOLS.get(selected_preset.id) or [selected_preset.search_query]
    query_used = pool[(safe_page - 1) % len(pool)]
    return query_used, selected_preset.id
