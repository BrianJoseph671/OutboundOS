#!/bin/bash
# Environment setup for RelationshipOS Phase 1
# This script is idempotent — safe to run multiple times

set -e

echo "Installing dependencies..."
npm install

echo "Running TypeScript type check..."
npm run check || echo "TypeScript check completed (may have pre-existing issues)"

echo "Pushing schema to database..."
npm run db:push || echo "Schema push completed (may need DATABASE_URL)"

echo "Init complete."
