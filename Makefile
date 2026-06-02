# project50 — common workflows. Run `make` (or `make help`) to list targets.
SHELL := /bin/bash
WEB := @project50/web
DB := @project50/db
MOBILE := @project50/mobile
CORE := @project50/core
RECAP := @project50/recap
UI := @project50/ui

.DEFAULT_GOAL := help
.PHONY: help setup install env services migrate generate seed dev mobile db-studio \
        test test-web test-mobile test-core test-recap test-ui \
        e2e e2e-install typecheck lint build ci recap-sample down clean reset

help: ## List available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# ---- Setup ----
setup: install env services migrate e2e-install ## One-time setup: deps + .env + services + db + browsers
	@echo "Setup complete. Run 'make dev' to start the app or 'make test' to run tests."

install: ## Install workspace dependencies
	pnpm install

env: ## Create .env from .env.example if missing
	@test -f .env || { cp .env.example .env && echo "created .env"; }

services: ## Start Postgres + MinIO (Docker)
	docker compose up -d postgres minio

migrate: env services ## Apply database migrations
	pnpm --filter $(DB) migrate:deploy

generate: env ## Regenerate the Prisma client
	pnpm --filter $(DB) generate

seed: env services migrate ## Seed a rich demo account
	pnpm --filter $(DB) seed

# ---- Run ----
dev: env services ## Run the web app (http://localhost:3000)
	pnpm --filter $(WEB) dev

mobile: ## Start the Expo native app (needs a device/simulator)
	pnpm --filter $(MOBILE) start

db-studio: env ## Open Prisma Studio (browse the dev DB)
	pnpm --filter $(DB) studio

# ---- Test ----
test: env services migrate ## Unit + integration tests, all packages (99% gate)
	pnpm test

test-web: env services migrate ## Web tests only (needs services)
	pnpm --filter $(WEB) test

test-mobile: ## Mobile Jest tests only (no services needed)
	pnpm --filter $(MOBILE) test

test-core: ## Core domain tests only
	pnpm --filter $(CORE) test

test-recap: ## Recap engine tests only
	pnpm --filter $(RECAP) test

test-ui: ## UI design-system tests only
	pnpm --filter $(UI) test

e2e: env services migrate e2e-install ## Playwright end-to-end tests (web)
	pnpm test:e2e

e2e-install: ## Install the Playwright Chromium browser
	pnpm --filter $(WEB) exec playwright install chromium

# ---- Checks ----
typecheck: ## Type-check every package
	pnpm typecheck

lint: ## Lint the repo (zero warnings)
	pnpm lint

build: ## Production build of the web app
	pnpm --filter $(WEB) build

ci: lint typecheck test e2e ## Run everything CI runs (lint, typecheck, tests, e2e)
	@echo "All CI checks passed."

# ---- Extras ----
recap-sample: ## Render a real sample recap MP4 (downloads Chromium; ~minutes)
	pnpm --filter $(RECAP) render:sample

down: ## Stop Docker services
	docker compose down

clean: ## Stop services and remove build artifacts + coverage
	docker compose down
	rm -rf apps/web/.next packages/*/coverage apps/*/coverage coverage

reset: ## DANGER: drop and recreate the dev database (wipes data)
	docker compose down -v
	docker compose up -d postgres minio
	pnpm --filter $(DB) migrate:deploy
