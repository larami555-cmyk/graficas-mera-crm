const { getStore } = require('@netlify/blobs');

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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

  const coleccion = (event.queryStringParameters && event.queryStringParameters.coleccion) || body.coleccion || 'materiales';
  const COLECCIONES_LISTA = ['materiales', 'productos', 'maquinas'];
  const COLECCIONES_NOTAS = ['notas', 'notasgenerales', 'vehiculos'];
  if (!COLECCIONES_LISTA.includes(coleccion) && !COLECCIONES_NOTAS.includes(coleccion)) {
    return jsonResponse(400, { error: 'Colección no válida' });
  }

  const store = getStore({
    name: 'gm-materiales-data',
    siteID: process.env.SITE_ID_MANUAL,
    token: process.env.BLOBS_ACCESS_TOKEN
  });

  // texto libre (cuadernos de notas), no son listas de fichas
  const CUADERNOS = { 'notas': 'notas-comoimprimimos', 'notasgenerales': 'notas-generales', 'vehiculos': 'notas-vehiculos' };
  if (CUADERNOS[coleccion]) {
    const storageKey = CUADERNOS[coleccion];
    try {
      if (event.httpMethod === 'GET') {
        const texto = (await store.get(storageKey)) || '';
        return jsonResponse(200, { texto });
      }
      if (event.httpMethod === 'PUT' || event.httpMethod === 'POST') {
        const texto = body.texto || '';
        await store.set(storageKey, texto);
        return jsonResponse(200, { texto });
      }
      return jsonResponse(405, { error: 'Método no soportado' });
    } catch (err) {
      return jsonResponse(500, { error: err.message || 'Error interno' });
    }
  }

  const prefixes = { materiales: 'm', productos: 'p', maquinas: 'q', vehiculos: 'v' };
  const itemKeys = { materiales: 'material', productos: 'producto', maquinas: 'maquina', vehiculos: 'vehiculo' };
  const prefix = prefixes[coleccion];
  const itemKey = itemKeys[coleccion];

  let items = (await store.get(coleccion, { type: 'json' })) || [];

  try {
    if (event.httpMethod === 'GET') {
      return jsonResponse(200, { [coleccion]: items });
    }

    if (event.httpMethod === 'POST') {
      const defaults = coleccion === 'materiales'
        ? { nombre: '', categoria: '', especificaciones: '', notas: '' }
        : coleccion === 'productos' || coleccion === 'vehiculos'
          ? { nombre: '', categoria: '', variantes: '', especificaciones: '', notas: '' }
          : { nombre: '', categoria: '', materialesCompatibles: '', tamanos: '', colores: '', varios: '' };
      const it = Object.assign({}, defaults, body[itemKey] || {});
      if (!it.nombre) return jsonResponse(400, { error: 'El nombre es obligatorio' });
      it.id = uid(prefix);
      it.creado = new Date().toISOString();
      items.unshift(it);
      await store.setJSON(coleccion, items);
      return jsonResponse(200, { [itemKey]: it });
    }

    if (event.httpMethod === 'PUT') {
      const idx = items.findIndex(x => x.id === body.id);
      if (idx === -1) return jsonResponse(404, { error: 'No encontrado' });
      items[idx] = Object.assign({}, items[idx], body.patch || {});
      await store.setJSON(coleccion, items);
      return jsonResponse(200, { [itemKey]: items[idx] });
    }

    if (event.httpMethod === 'DELETE') {
      items = items.filter(x => x.id !== body.id);
      await store.setJSON(coleccion, items);
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(405, { error: 'Método no soportado' });
  } catch (err) {
    return jsonResponse(500, { error: err.message || 'Error interno' });
  }
};
