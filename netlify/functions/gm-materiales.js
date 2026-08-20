const { getStore } = require('@netlify/blobs');

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}

function uid() {
  return 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

exports.handler = async (event) => {
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch (e) { /* body vacío o no-JSON, ok para GET */ }
  }

  const password = event.headers['x-crm-password'] || body.password;
  if (!process.env.CRM_PASSWORD || password !== process.env.CRM_PASSWORD) {
    return jsonResponse(401, { error: 'No autorizado' });
  }

  const store = getStore({
    name: 'gm-materiales-data',
    siteID: process.env.SITE_ID_MANUAL,
    token: process.env.BLOBS_ACCESS_TOKEN
  });
  let materiales = (await store.get('materiales', { type: 'json' })) || [];

  try {
    if (event.httpMethod === 'GET') {
      return jsonResponse(200, { materiales });
    }

    if (event.httpMethod === 'POST') {
      const m = Object.assign({
        nombre: '', categoria: '', especificaciones: '', notas: ''
      }, body.material || {});
      if (!m.nombre) return jsonResponse(400, { error: 'El nombre es obligatorio' });
      m.id = uid();
      m.creado = new Date().toISOString();
      materiales.unshift(m);
      await store.setJSON('materiales', materiales);
      return jsonResponse(200, { material: m });
    }

    if (event.httpMethod === 'PUT') {
      const idx = materiales.findIndex(x => x.id === body.id);
      if (idx === -1) return jsonResponse(404, { error: 'Material no encontrado' });
      materiales[idx] = Object.assign({}, materiales[idx], body.patch || {});
      await store.setJSON('materiales', materiales);
      return jsonResponse(200, { material: materiales[idx] });
    }

    if (event.httpMethod === 'DELETE') {
      materiales = materiales.filter(x => x.id !== body.id);
      await store.setJSON('materiales', materiales);
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(405, { error: 'Método no soportado' });
  } catch (err) {
    return jsonResponse(500, { error: err.message || 'Error interno' });
  }
};
