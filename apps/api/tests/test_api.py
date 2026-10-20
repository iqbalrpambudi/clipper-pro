"""Test suite facade preserving backward-compatible execution of all API tests.

Individual modular test files are organized in:
- tests/services/test_subtitle_ass.py
- tests/services/test_tts.py
- tests/services/test_narrative.py
- tests/services/test_storyboard.py
- tests/services/test_image_gen.py
- tests/workers/test_render.py
- tests/api/test_api_endpoints.py
"""

# Re-export all tests for backwards compatibility with `pytest tests/test_api.py`
from tests.api.test_api_endpoints import *  # noqa: F401, F403
from tests.services.test_image_gen import *  # noqa: F401, F403
from tests.services.test_narrative import *  # noqa: F401, F403
from tests.services.test_storyboard import *  # noqa: F401, F403
from tests.services.test_subtitle_ass import *  # noqa: F401, F403
from tests.services.test_tts import *  # noqa: F401, F403
from tests.workers.test_render import *  # noqa: F401, F403
