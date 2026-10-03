# Sunbiz Explorer — local first version

Search Florida's Sunbiz corporate records by registered agent, officer/agent, or entity name. Inspect businesses and expand searches from their listed people. View source-linked record connections and export the investigation.

## Run locally

Clone the repository, double-click `start.command` on macOS, then open http://127.0.0.1:8765. Alternatively:

```sh
git clone https://github.com/denniskeefe/sunbiz-explorer.git
cd sunbiz-explorer
./start.command
```

Prerequisites: `uv`, the installed `browser-use` CLI, and its connected Chrome browser. Allow Chrome's remote-debugging prompt if shown. This build uses the existing local browser integration rather than direct HTTP, which Sunbiz currently blocks. It does not bypass challenges: if the site presents one, use the browser normally or retry later. Backend requests are serialized, paced, and cached. The app binds only to localhost; do not expose this development server publicly.

## Workflow

1. Choose **Registered agent**, enter a name (individuals: Last Name, First Name), and search.
2. Select a result to inspect its current listed agent, officers/managers, addresses, and source filings.
3. Search a listed person's name to find candidate additional entities. Inspected records remain in the investigation.
4. Open the connections view to review the records you've inspected, then export them.
5. Follow pagination for more candidates; this is not an exhaustive crawl.

## What a connection means

The connection view records **a name appearing in a role on a particular entity record**. It does not establish ownership, beneficial control, personal relationships, or that same-name appearances represent the same person. Professional registered agents may serve unrelated entities. Verify candidates against source documents. Inactive entities are included where returned by Sunbiz. Historical filings may be linked, but their contents are not automatically parsed in this version. Search results may reflect indexing or earlier filings; inspect the current detail before drawing conclusions.

No sample dataset is shown as live results. HTML fixtures under `fixtures/` are captured public Sunbiz pages used only for parser tests.

## Tests

```sh
env -u PYTHONPATH .venv/bin/python -m pytest -q
node --test tests/*.mjs
```

## Vercel deployment status

`pyproject.toml` declares `backend:app` as the FastAPI entrypoint so Vercel can discover the existing application. Use the **FastAPI** framework preset with the repository root as the Root Directory.

This setting addresses entrypoint discovery only. **The current live-search transport is local-only:** it invokes `browser-use` connected to Chrome on the developer's computer. Deploying the Python app does not provide that connection on Vercel, so hosted live searches are not functional yet. A protected Vercel-only headless-browser feasibility test is prepared locally but has not been deployed or validated. Do not treat a successful build as a working hosted Sunbiz search service.

## Limits / next steps

- Searches and inspected records only: no claim to find every connection.
- Local browser dependency; not yet a hosted multi-user service.
- No automatic identity resolution, historical PDF extraction, or cross-registry enrichment.
- Investigations are session-based; export before closing the page.
- Review Sunbiz access rules and data redistribution requirements before scaling or publishing.
