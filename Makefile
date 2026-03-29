.PHONY: dev backend frontend test

dev:
	@echo "Starting backend and frontend services..."
	docker-compose up -d db
	@sleep 3
	cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
	cd frontend && npm run dev

backend:
	cd backend && uvicorn app.main:app --reload

frontend:
	cd frontend && npm run dev

test:
	cd backend && pytest

seed:
	cd backend && python seed.py
