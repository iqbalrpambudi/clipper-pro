COMPOSE := docker compose -f infrastructure/docker/docker-compose.yml --env-file .env
WEB_PORT ?= $(shell sed -n 's/^WEB_PORT=//p' .env 2>/dev/null | tail -1)
API_PORT ?= $(shell sed -n 's/^API_PORT=//p' .env 2>/dev/null | tail -1)

.PHONY: up down restart logs rebuild test sh-api sh-web sh-worker clean

up: .env
	$(COMPOSE) up -d
	@echo "===================================================="
	@echo "Cliper Pro is starting up!"
	@echo "Web UI:   http://localhost:$(or $(WEB_PORT),3030)"
	@echo "API Docs: http://localhost:$(or $(API_PORT),8080)/docs"
	@echo "===================================================="

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart

logs:
	$(COMPOSE) logs -f --tail=100

rebuild:
	$(COMPOSE) build
	$(COMPOSE) up -d

test:
	$(COMPOSE) exec api pytest -q
	$(COMPOSE) exec web npm run typecheck

sh-api:
	$(COMPOSE) exec api bash

sh-web:
	$(COMPOSE) exec web sh

sh-worker:
	$(COMPOSE) exec worker bash

clean:
	$(COMPOSE) down -v

.env:
	cp .env.example .env
	@echo "Created .env from .env.example"
