const { getStore } = require('@netlify/blobs');

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}

function uid() {
  return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
    name: 'gm-crm-data',
    siteID: process.env.SITE_ID_MANUAL,
    token: process.env.BLOBS_ACCESS_TOKEN
  });
  let clientes = (await store.get('clientes', { type: 'json' })) || [];

  try {
    if (event.httpMethod === 'GET') {
      return jsonResponse(200, { clientes });
    }

    if (event.httpMethod === 'POST') {
      const c = Object.assign({
        nombre: '', localidad: '', direccion: '', telefono: '', web: '', redes: '',
        tipoNegocio: '', potencialGlobal: '', prioridad: '',
        proveedorActual: [], productosDetectados: [], categorias: [], servicios: [],
        lineasGM: [], potencial: { granFormato: '', rotulacion: '', impresion: '', sellosEspeciales: '' },
        ultimaVisita: '', proximoSeguimiento: '', observaciones: '', historial: []
      }, body.cliente || {});
      if (!c.nombre || !c.localidad) return jsonResponse(400, { error: 'Nombre y localidad son obligatorios' });
      c.id = uid();
      c.creado = new Date().toISOString();
      clientes.unshift(c);
      await store.setJSON('clientes', clientes);
      return jsonResponse(200, { cliente: c });
    }

    if (event.httpMethod === 'PUT') {
      const idx = clientes.findIndex(x => x.id === body.id);
      if (idx === -1) return jsonResponse(404, { error: 'Cliente no encontrado' });
      clientes[idx] = Object.assign({}, clientes[idx], body.patch || {});
      await store.setJSON('clientes', clientes);
      return jsonResponse(200, { cliente: clientes[idx] });
    }

    if (event.httpMethod === 'DELETE') {
      clientes = clientes.filter(x => x.id !== body.id);
      await store.setJSON('clientes', clientes);
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(405, { error: 'Método no soportado' });
  } catch (err) {
    return jsonResponse(500, { error: err.message || 'Error interno' });
  }
};
