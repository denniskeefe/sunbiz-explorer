"""Local, browser-backed explorer for public Florida Sunbiz records."""
from urllib.parse import urljoin, urlsplit, unquote
from typing import Literal
from fastapi import FastAPI, HTTPException, Query

BASE = 'https://search.sunbiz.org/Inquiry/CorporationSearch/'
app = FastAPI(title='Local Sunbiz Explorer')


def validate_url(url):
    try:
        parts = urlsplit(url)
        path = unquote(parts.path)
        if (parts.scheme != 'https' or parts.netloc != 'search.sunbiz.org'
                or parts.fragment or not path.startswith('/Inquiry/CorporationSearch/')
                or any(part in ('.', '..') for part in path.split('/'))
                or '%' in path or '\\' in url or any(ord(c) <= 32 for c in url)):
            raise ValueError('unsafe URL')
    except ValueError:
        raise HTTPException(400, 'Only HTTPS search.sunbiz.org/Inquiry/CorporationSearch/ URLs are allowed.')
    return url


@app.get('/api/health')
def health():
    return {'status': 'ok'}


@app.get('/api/search')
def search(q: str = Query('', max_length=200), mode: Literal['agent', 'officer', 'entity'] = 'agent', next_url: str | None = None):
    if next_url:
        validate_url(next_url)
    if not q.strip() and not next_url:
        raise HTTPException(400, 'Enter a name to search.')
    paths = {'agent': 'ByRegisteredAgent', 'officer': 'ByOfficerOrRegisteredAgent', 'entity': 'ByName'}
    return service.get('search', next_url or BASE + paths[mode], None if next_url else q.strip())


@app.get('/api/entity')
def entity(url: str):
    validate_url(url)
    return service.get('detail', url)
from bs4 import BeautifulSoup, NavigableString
import time
import threading
from datetime import datetime, timezone
from copy import deepcopy

BLOCK_MESSAGE = ('Sunbiz did not return readable records. Open Sunbiz in your normal browser '
                 'and check for a challenge or outage; ensure browser-use --doctor succeeds, then retry. '
                 'No substitute data has been returned.')


class SunbizService:
    """Serialize browser operations, rate-limit live fetches, cache successes only."""
    def __init__(self, fetch, clock=time.monotonic, sleep=time.sleep):
        self.fetch, self.clock, self.sleep = fetch, clock, sleep
        self.lock = threading.Lock()
        self.cache = {}
        self.last_request = float('-inf')

    def get(self, kind, url, query=None):
        validate_url(url)
        key = kind, url, query
        with self.lock:
            now = self.clock()
            if key in self.cache and now - self.cache[key][0] < 600:
                return deepcopy(self.cache[key][1])
            self.sleep(max(0, 1 - (now - self.last_request)))
            self.last_request = self.clock()
            try:
                payload = self.fetch(url, query)
                validate_url(payload['url'])
                soup = BeautifulSoup(payload['html'], 'html.parser')
                if kind == 'detail':
                    if not soup.select_one('.corporationName p'):
                        raise ValueError('missing detail')
                    result = parse_detail(payload['html'], payload['url'])
                else:
                    empty = any(marker in text(soup).lower() for marker in ('no records found', 'no results found', 'no matches found'))
                    if not soup.select_one('#search-results') and not empty:
                        raise ValueError('missing search results')
                    result = parse_search(payload['html'], payload['url'])
                result.update(source_url=payload['url'], retrieved_at=datetime.now(timezone.utc).isoformat())
            except Exception as exc:
                raise HTTPException(502, BLOCK_MESSAGE) from exc
            # Bound memory without changing the ten-minute lifetime of retained entries.
            self.cache = {k: v for k, v in self.cache.items() if self.clock() - v[0] < 600}
            if len(self.cache) >= 256:
                self.cache.pop(next(iter(self.cache)))
            self.cache[key] = self.clock(), result
            return deepcopy(result)


import json
import subprocess
import shutil
from pathlib import Path
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

STATIC = Path(__file__).resolve().parent / 'static'
app.mount('/static', StaticFiles(directory=STATIC, check_dir=False), name='static')


@app.get('/')
def index():
    return FileResponse(STATIC / 'index.html')


class BrowserTransport:
    """One app-owned tab, using the installed browser-use normal-browser CLI."""
    def __init__(self):
        self.tab_id = None
        self.lock = threading.Lock()

    def __call__(self, url, query=None):
        validate_url(url)
        with self.lock:
            script = f'''# Fetching public Sunbiz records
import json, time
old_tab = current_tab().get('targetId')
tab_id = {self.tab_id!r}
if tab_id:
    try:
        switch_tab({self.tab_id!r})
    except Exception:
        tab_id = None
if not tab_id:
    tab_id = new_tab()
def ready(expression, seconds=35):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            if js(expression):
                return
        except RuntimeError:
            # Page navigation can briefly destroy the execution context.
            pass
        time.sleep(0.4)
    raise RuntimeError('Sunbiz navigation timed out; inspect browser for challenge or outage')
try:
    goto_url({url!r})
    wait_for_load()
    ready('location.href === ' + json.dumps({url!r}))
    if {query is not None!r}:
        ready('!!document.querySelector("#SearchTerm")')
        fill_input('#SearchTerm', {query!r})
        js('document.querySelector("form").submit()')
        wait_for_load()
    ready('!!document.querySelector("#search-results, .searchResultDetail") || (document.body && /no records found|no results found|no matches found/i.test(document.body.innerText))')
    payload = {{'html': js('document.documentElement.outerHTML'), 'url': js('location.href'), 'tab_id': tab_id}}
    print('SUNBIZ_PAYLOAD:' + json.dumps(payload))
finally:
    if old_tab and old_tab != tab_id:
        try:
            switch_tab(old_tab)
        except Exception:
            pass
'''
            command = shutil.which('browser-use') or str(Path.home() / '.hermes/bin/browser-use')
            completed = subprocess.run([command], input=script, text=True, capture_output=True, timeout=100)
            if completed.returncode:
                raise RuntimeError('browser-use failed: ' + completed.stderr[-1000:])
            for line in reversed(completed.stdout.splitlines()):
                if line.startswith('SUNBIZ_PAYLOAD:'):
                    payload = json.loads(line.split(':', 1)[1])
                    self.tab_id = payload['tab_id']
                    return payload
            raise RuntimeError('browser-use returned no record payload')


service = SunbizService(BrowserTransport())


def address(node):
    return '\n'.join(' '.join(line.split()) for line in node.get_text('\n', strip=True).splitlines() if line.strip()) if node else ''


def parse_detail(html, source_url):
    soup = BeautifulSoup(html, 'html.parser')
    root = soup.select_one('.searchResultDetail')
    names = root.select('.corporationName p')
    info = {}
    for label in root.select('.filingInformation label'):
        info[text(label)] = text(label.find_next_sibling('span'))
    data = dict(name=text(names[-1]), entity_type=text(names[0]),
                document_number=info.get('Document Number', ''), status=info.get('Status', ''),
                principal_address='', mailing_address='', registered_agent={'name': '', 'address': ''},
                officers=[], source_url=source_url, filings=[])
    for section in root.select('.detailSection'):
        spans = section.find_all('span', recursive=False)
        heading = text(spans[0]) if spans else ''
        if heading in ('Principal Address', 'Mailing Address'):
            data[heading.lower().replace(' ', '_')] = address(section.find('div'))
        elif heading.startswith('Registered Agent'):
            data['registered_agent'] = dict(name=text(spans[1]) if len(spans) > 1 else '', address=address(section.find('div')))
        elif heading == 'Officer/Director Detail':
            for title in spans:
                if not text(title).startswith('Title '):
                    continue
                person_name = []
                person_address = ''
                for sibling in title.next_siblings:
                    if isinstance(sibling, NavigableString):
                        if str(sibling).strip():
                            person_name.append(str(sibling).strip())
                    elif sibling.name == 'span':
                        person_address = address(sibling.find('div'))
                        break
                data['officers'].append(dict(name=' '.join(' '.join(person_name).split()), title=text(title)[6:].strip(), address=person_address))
        if section.select_one('table'):
            for link in section.select('a[href]'):
                data['filings'].append(dict(label=text(link), url=urljoin(source_url, link['href'])))
    return data


def text(node):
    return ' '.join(node.get_text(' ', strip=True).split()) if node else ''


def parse_search(html, source_url):
    soup = BeautifulSoup(html, 'html.parser')
    results = []
    headers = [text(h).lower() for h in soup.select('#search-results th')]
    entity_search = bool(headers and ('corporate' in headers[0] or 'entity' in headers[0]))
    for row in soup.select('#search-results tbody tr'):
        cells = row.find_all('td', recursive=False)
        link = row.find('a', href=True)
        if len(cells) >= 3 and link:
            results.append(dict(name=text(cells[0]), entity_name=text(cells[0] if entity_search else cells[1]),
                                document_number=text(cells[1] if entity_search else cells[2]),
                                url=urljoin(source_url, link['href'])))
    nxt = soup.find('a', title='Next List')
    return dict(results=results, next_url=urljoin(source_url, nxt['href']) if nxt else None)
