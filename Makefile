run:
	cd apps/api && PYTHONPATH=. uvicorn app.main:app --reload --port 8000

test:
	cd apps/api && PYTHONPATH=. pytest -q
