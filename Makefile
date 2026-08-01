SHELL := /bin/sh

GITLEAKS_IMAGE := zricethezav/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f
TRIVY_IMAGE := aquasec/trivy:0.72.0@sha256:cffe3f5161a47a6823fbd23d985795b3ed72a4c806da4c4df16266c02accdd6f
ACTIONLINT_IMAGE := rhysd/actionlint:1.7.10@sha256:ef8299f97635c4c30e2298f48f30763ab782a4ad2c95b744649439a039421e36
IMAGE ?= dxr-frontend-starter-kit:local

.PHONY: help install dev test ci security secrets workflow-lint trivy-config image image-scan release-gate clean

help:
	@awk 'BEGIN {FS = ":.*## "}; /^[a-zA-Z0-9_-]+:.*## / {printf "%-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install the exact locked graph without running lifecycle scripts
	npm ci --ignore-scripts

dev: ## Run the local development server
	npm run dev

test: ## Run unit tests
	npm run test

ci: ## Run formatting, type, unit, and production-build gates
	npm run check

secrets: ## Scan the repository for secrets using a pinned scanner image
	docker run --rm --volume "$(CURDIR):/repo:ro" $(GITLEAKS_IMAGE) dir /repo --no-banner --redact

workflow-lint: ## Validate GitHub Actions syntax and expressions
	docker run --rm --volume "$(CURDIR):/repo:ro" --workdir /repo $(ACTIONLINT_IMAGE) -no-color

trivy-config: ## Scan container and workflow configuration
	docker run --rm --volume "$(CURDIR):/repo:ro" $(TRIVY_IMAGE) config --exit-code 1 --severity HIGH,CRITICAL /repo

security: ## Run dependency, license, secret, and configuration gates
	npm run security:lock
	npm run security:licenses
	npm run security:audit
	$(MAKE) secrets
	$(MAKE) workflow-lint
	$(MAKE) trivy-config

image: ## Build the production image
	docker build --tag "$(IMAGE)" --file deploy/docker/Dockerfile .

image-scan: ## Scan the exact locally built image
	docker run --rm --volume /var/run/docker.sock:/var/run/docker.sock $(TRIVY_IMAGE) image --exit-code 1 --severity HIGH,CRITICAL --ignore-unfixed "$(IMAGE)"

release-gate: ci security image image-scan ## Run all source and image release gates

clean: ## Remove generated local outputs
	rm -rf dist coverage playwright-report test-results
