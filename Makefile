.PHONY: help install dev build typecheck lint lint-fix format test clean

# Default target
help:
	@echo "Raidy - Storage Infrastructure Simulator"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  install    Install dependencies"
	@echo "  dev        Start development server"
	@echo "  build      Build for production"
	@echo "  typecheck  Run TypeScript type checking"
	@echo "  lint       Run Biome linter"
	@echo "  lint-fix   Run Biome linter with auto-fix"
	@echo "  format     Format code with Biome"
	@echo "  test       Run tests"
	@echo "  clean      Remove build artifacts"
	@echo "  all        Run lint, typecheck, and build"

# Install dependencies
install:
	npm install

# Development server
dev:
	npm run dev

# Production build
build:
	npm run build

# Type checking
typecheck:
	npm run typecheck

# Linting
lint:
	npm run lint

lint-fix:
	npm run lint:fix

# Formatting
format:
	npm run format

# Testing
test:
	npm test

# Clean build artifacts
clean:
	rm -rf dist
	rm -rf node_modules/.vite

# Run all checks and build
all: lint typecheck build
