export function matchLabel(result) {
  return result.name && result.name !== result.entity_name ? 'Listed name: ' + result.name : '';
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function buildNetwork(records) {
  const nodes = [], edges = [];
  records.forEach((record, index) => {
    const entityKey = recordKey(record) || String(index);
    const id = `entity:${index}:${entityKey}`;
    nodes.push({id, kind:'entity', name:record.name, entityKey, source_url:record.source_url});
    const people = [];
    if (record.registered_agent?.name) people.push({...record.registered_agent, role:'Registered agent'});
    for (const officer of record.officers || []) people.push({...officer, role:officer.title || 'Officer'});
    people.forEach((person, occurrence) => {
      const personId = `${id}:person:${occurrence}`;
      nodes.push({...person,id:personId,kind:'person',entityKey,source_url:record.source_url});
      edges.push({from:id,to:personId,role:person.role,entityKey,source_url:record.source_url});
    });
  });
  return {nodes,edges};
}
export function recordKey(record) { return record.document_number || record.source_url || record.url; }
export function mergeResults(current, incoming) {
  const seen = new Set();
  return [...current, ...incoming].filter(record => {
    const key = recordKey(record);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function safeLink(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
