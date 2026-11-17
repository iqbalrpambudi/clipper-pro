API := apps/api
WEB := apps/web

.PHONY: install build-web package install-tool dev start stop test lint lint-web lint-api format format-web format-api

# First-time setup: API venv, web deps, and bundled frontend
install:
	cd $(API) && uv sync --extra dev
	cd $(WEB) && npm install
	$(MAKE) build-web

# Build React frontend and stage it inside the Python package
build-web:
	cd $(WEB) && npm run build
	rm -rf $(API)/app/web_dist
	cp -R $(WEB)/dist $(API)/app/web_dist

# Build distributable Python wheel/tarball (includes web_dist and tray assets)
package: build-web
	cd $(API) && uv build

# Install `cliper-pro` CLI globally via uv tool
install-tool: build-web
	uv tool install --force ./$(API)

# Dev mode: API (127.0.0.1:18080, auto-reload) + Vite (localhost:3031)
dev:
	@trap 'kill 0' EXIT; \
	(cd $(API) && .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 18080 --reload) & \
	(cd $(WEB) && npm run dev) & \
	wait

start: build-web
	cd $(API) && .venv/bin/cliper-pro start

stop:
	cd $(API) && .venv/bin/cliper-pro stop

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
