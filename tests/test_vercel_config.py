from pathlib import Path
import importlib
import tomllib
from fastapi.testclient import TestClient


def test_vercel_config_resolves_the_existing_fastapi_app():
    root = Path(__file__).resolve().parents[1]
    config_path = root / 'pyproject.toml'
    assert config_path.exists(), 'Missing Vercel entrypoint configuration'
    config = tomllib.loads(config_path.read_text())
    assert config['project']['name'] == 'sunbiz-explorer'
    assert config['project']['version']
    assert config['project']['requires-python'] == '>=3.11,<3.14'
    assert config['project']['dependencies'] == [
        line for line in (root / 'requirements.txt').read_text().splitlines() if line
    ]
    entrypoint = config['tool']['vercel']['entrypoint']
    assert entrypoint == 'backend:app'
    module, variable = entrypoint.split(':')
    app = getattr(importlib.import_module(module), variable)
    client = TestClient(app)
    assert client.get('/api/health').json() == {'status': 'ok'}
    assert client.get('/').status_code == 200
    assert client.get('/static/app.js').status_code == 200
