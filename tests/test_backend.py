from pathlib import Path
import importlib
import pytest
from fastapi.testclient import TestClient


@pytest.mark.parametrize('url', [
    'http://search.sunbiz.org/Inquiry/CorporationSearch/ByName',
    'https://evil.test/Inquiry/CorporationSearch/ByName',
    'https://search.sunbiz.org.evil.test/Inquiry/CorporationSearch/ByName',
    'https://user@search.sunbiz.org/Inquiry/CorporationSearch/ByName',
    'https://search.sunbiz.org:8443/Inquiry/CorporationSearch/ByName',
    'https://search.sunbiz.org/Inquiry/CorporationSearch/../Other',
    'https://search.sunbiz.org/Inquiry/CorporationSearch/%2e%2e/Other',
    'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName#fragment',
    'https://search.sunbiz.org/Other', 'file:///etc/passwd',
])
def test_api_rejects_unsafe_urls_without_browser(url):
    backend = importlib.import_module('backend')
    client = TestClient(backend.app)
    assert client.get('/api/entity', params={'url': url}).status_code == 400
    assert client.get('/api/search', params={'q': 'Smith', 'next_url': url}).status_code == 400


def test_health_and_query_validation():
    backend = importlib.import_module('backend')
    client = TestClient(backend.app)
    assert client.get('/api/health').json() == {'status': 'ok'}
    assert client.get('/api/search', params={'q': '   '}).status_code == 400
    assert client.get('/api/search', params={'q': 'Smith', 'mode': 'invalid'}).status_code == 422

def test_browser_service_cache_expiry_and_rate_limit():
    backend = importlib.import_module('backend')
    now = [0.0]
    calls = []
    def sleep(seconds):
        now[0] += seconds
    def fetch(url, query):
        calls.append((now[0], url, query))
        return {'html': (FIXTURES / 'search.html').read_text(), 'url': SOURCE}
    service = backend.SunbizService(fetch, clock=lambda: now[0], sleep=sleep)
    first = service.get('search', SOURCE, 'Smith')
    assert len(first['results']) == 20
    assert first['source_url'] == SOURCE
    assert first['retrieved_at'].endswith('+00:00')
    assert service.get('search', SOURCE, 'Smith') == first
    assert len(calls) == 1
    service.get('search', SOURCE, 'Other')
    assert calls[1][0] >= calls[0][0] + 1
    now[0] = 601
    service.get('search', SOURCE, 'Smith')
    assert len(calls) == 3


def test_api_real_fixture_through_service(monkeypatch):
    backend = importlib.import_module('backend')
    calls = []
    def fetch(url, query):
        calls.append((url, query))
        filename = 'detail.html' if 'SearchResultDetail' in url else 'agent_search.html'
        return {'html': (FIXTURES / filename).read_text(), 'url': url}
    monkeypatch.setattr(backend, 'service', backend.SunbizService(fetch, sleep=lambda _: None))
    client = TestClient(backend.app)
    data = client.get('/api/search', params={'q': 'SMITH JOHN'}).json()
    assert len(data['results']) == 20
    assert data['results'][0]['entity_name'] == 'F M E CONSTRUCTION, INC.'
    assert calls[0] == (backend.BASE + 'ByRegisteredAgent', 'SMITH JOHN')
    response = client.get('/api/entity', params={'url': data['results'][0]['url']})
    assert response.status_code == 200
    assert response.json()['document_number'] == '187189'


@pytest.mark.parametrize('html', ['<html>Just a moment... Cloudflare</html>', '<html>unrecognized upstream page</html>'])
def test_blocked_pages_return_actionable_502(monkeypatch, html):
    backend = importlib.import_module('backend')
    monkeypatch.setattr(backend, 'service', backend.SunbizService(lambda url, query: {'url': url, 'html': html}))
    response = TestClient(backend.app).get('/api/search', params={'q': 'Smith'})
    assert response.status_code == 502
    assert 'browser' in response.json()['detail'].lower()


def test_browser_transport_executes_safe_script_and_decodes_stdout(monkeypatch):
    backend = importlib.import_module('backend')
    scripts = []
    class Completed:
        returncode = 0
        stdout = 'navigation log\nSUNBIZ_PAYLOAD:' + __import__('json').dumps({'html': '<html>records</html>', 'url': SOURCE, 'tab_id': 'app-tab'})
        stderr = ''
    def run(command, **kwargs):
        assert command[-1] == 'browser-use' or command[-1].endswith('/browser-use')
        scripts.append(kwargs['input'])
        return Completed()
    monkeypatch.setattr(backend.subprocess, 'run', run)
    browser = backend.BrowserTransport()
    assert browser(SOURCE, 'Smith "quoted"')['url'] == SOURCE
    assert 'new_tab(' in scripts[0]
    assert 'fill_input(' in scripts[0]
    assert 'time.monotonic()' in scripts[0]
    assert 'document.body &&' in scripts[0]
    assert 'except RuntimeError:' in scripts[0]
    assert 'location.href ===' in scripts[0]
    browser(SOURCE, None)
    assert "switch_tab('app-tab')" in scripts[1]
    assert 'goto_url(' in scripts[1]


def test_root_serves_actual_frontend():
    backend = importlib.import_module('backend')
    response = TestClient(backend.app).get('/')
    assert response.status_code == 200
    assert '<html' in response.text.lower() or '<!doctype html' in response.text.lower()


def test_entity_name_search_columns():
    backend = importlib.import_module('backend')
    html = '<div id="search-results"><table><thead><tr><th>Corporate Name</th><th>Document Number</th><th>Status</th></tr></thead><tbody><tr><td><a href="SearchResultDetail?id=1">TEST LLC</a></td><td>L123</td><td>Active</td></tr></tbody></table></div>'
    result = backend.parse_search(html, SOURCE)['results'][0]
    assert result['name'] == result['entity_name'] == 'TEST LLC'
    assert result['document_number'] == 'L123'


def test_detail_filing_links_and_duplicate_officers():
    backend = importlib.import_module('backend')
    html = (FIXTURES / 'detail.html').read_text().replace('SMITH, EILEEN', 'SMITH, JOHN').replace('No images are available for this filing.', '<a href="/Inquiry/CorporationSearch/DocumentImage?x=1">2025 Annual Report</a>')
    data = backend.parse_detail(html, SOURCE)
    assert [o['name'] for o in data['officers']].count('SMITH, JOHN') == 2
    assert data['filings'] == [{'label': '2025 Annual Report', 'url': 'https://search.sunbiz.org/Inquiry/CorporationSearch/DocumentImage?x=1'}]


FIXTURES = Path(__file__).resolve().parents[1] / 'fixtures'
SOURCE = 'https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults'

def test_real_search_preserves_all_rows_and_pagination():
    backend = importlib.import_module('backend')
    data = backend.parse_search((FIXTURES / 'search.html').read_text(), SOURCE)
    assert len(data['results']) == 20
    first = data['results'][0]
    assert first['name'] == 'SMITH, JOHN'
    assert first['entity_name'] == 'HI-VOLT BATTERY SALES & SERVICE, INC.'
    assert first['document_number'] == '187189'
    assert first['url'].startswith(SOURCE.replace('SearchResults', 'SearchResultDetail'))
    assert 'ForwardList' in data['next_url']
    assert data['results'][2]['document_number'] == data['results'][3]['document_number']


def test_real_detail_keeps_separate_people():
    backend = importlib.import_module('backend')
    data = backend.parse_detail((FIXTURES / 'detail.html').read_text(), SOURCE)
    assert data['name'] == 'HI-VOLT BATTERY SALES & SERVICE, INC.'
    assert data['entity_type'] == 'Florida Profit Corporation'
    assert data['document_number'] == '187189'
    assert data['status'] == 'INACTIVE'
    assert data['principal_address'] == '1880 N W 7TH AVE\nP. O. BOX 016067\nMIAMI FLA 33101'
    assert data['mailing_address'] == data['principal_address']
    assert data['registered_agent'] == {'name': 'SMITH,CHARLES', 'address': '6401 SW 112TH ST.\nMIAMI, FL'}
    assert [(p['name'], p['title']) for p in data['officers']] == [('SCHILB, SHARON', 'V'), ('SMITH, JOHN', 'P'), ('SMITH, EILEEN', 'STD'), ('SMITH, CAHRLES', 'D')]
    assert data['officers'][1]['address'] == '14822 SW 74TH PLACE\nMIAMI, FL 00000'
    assert data['source_url'] == SOURCE
    assert data['filings'] == []
