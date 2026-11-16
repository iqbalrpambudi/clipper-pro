DESKTOP := apps/desktop
API := apps/api
WEB := apps/web

.PHONY: install resources dev build test lint lint-web lint-api format format-web format-api

# First-time setup: API venv, web + desktop deps, and the bundled Python/tools tauri needs even in dev
install:
	cd $(API) && uv sync --extra dev
	cd $(WEB) && npm install
	cd $(DESKTOP) && npm install
	$(MAKE) resources

resources:
	bash $(DESKTOP)/scripts/prepare-resources.sh

# Desktop app in dev mode: tray + API (127.0.0.1:18080) + Vite (localhost:3031)
dev:
	cd $(DESKTOP) && npm run dev

# Standalone app: apps/desktop/src-tauri/target/release/bundle/macos/Cliper Pro.app
build:
	cd $(DESKTOP) && npm run build

test:
	cd $(API) && .venv/bin/python -m pytest -q
	cd $(WEB) && npm run typecheck

lint-web:
	cd $(WEB) && npm run typecheck && npm run lint

lint-api:
	cd $(API) && .venv/bin/ruff check .

lint: lint-web lint-api

format-web:
	cd $(WEB) && npm run format

format-api:
	cd $(API) && .venv/bin/ruff format . && .venv/bin/ruff check --fix .

format: format-web format-api
