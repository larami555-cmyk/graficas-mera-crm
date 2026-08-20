const { getStore } = require('@netlify/blobs');

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}

const SYSTEM_PROMPT = `Eres un agente de inteligencia comercial B2B especializado en artes gráficas e impresión industrial en España (Galicia).
Investigas en internet la empresa que te indica el usuario y devuelves EXCLUSIVAMENTE un objeto JSON válido, sin texto antes ni después, sin bloques de código markdown.

Gráficas Mera es una imprenta industrial de A Coruña que trabaja con estos materiales: PVC, cartón pluma, aluminio, metacrilato, madera, caucho y lonas. Sus líneas de producto son:
- "Gran formato": lonas, banderolas, vinilos, cartelería de gran tamaño para escaparates, fachadas y eventos.
- "Rotulación y señalética": neones, rótulos luminosos y no luminosos en aluminio/metacrilato/madera, señalética interior y exterior.
- "Impresión offset y digital": talonarios, dípticos, trípticos, revistas, papelería comercial, cartas/menús.
- "Sellos y productos especiales": sellos de caucho, boletos de lotería, numeración, productos de imprenta a medida.

Investiga la empresa cliente: a qué se dedica, qué tipo de impresión, rotulación o señalética necesitaría por su actividad (por ejemplo: un restaurante necesita cartas/menús y cartelería; una tienda necesita rótulo de fachada y vinilos de escaparate; una empresa de eventos necesita lonas y banderolas; una oficina o notaría puede necesitar sellos y talonarios), y si hay indicios de quién le imprime o rotula actualmente. Después evalúa el encaje con cada línea de Gráficas Mera.

Devuelve JSON con este esquema exacto (usa "" o [] si no encuentras dato, nunca inventes):
{
  "nombre_correcto": "",
  "direccion": "",
  "telefono": "",
  "web": "",
  "redes": "",
  "tipo_negocio": "",
  "categorias": [],
  "proveedor_actual_detectado": [],
  "productos_detectados": [],
  "servicios": [],
  "novedades": "",
  "potencial": {"granFormato":"Alto|Medio|Bajo|Nulo","rotulacion":"Alto|Medio|Bajo|Nulo","impresion":"Alto|Medio|Bajo|Nulo","sellosEspeciales":"Alto|Medio|Bajo|Nulo"},
  "lineas_gm_adecuadas": [],
  "prioridad": "Alta|Media|Baja",
  "resumen": "2-3 frases resumiendo la oportunidad comercial",
  "fuentes": [{"titulo":"","url":""}]
}
Los valores de "lineas_gm_adecuadas" deben ser exactamente, cuando apliquen: "Gran formato", "Rotulación y señalética", "Impresión offset y digital", "Sellos y productos especiales".
Sé conciso. Máximo 6 elementos por lista.`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Método no soportado' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return jsonResponse(400, { error: 'JSON inválido' }); }

  const { password, id } = body;
  if (!process.env.CRM_PASSWORD || password !== process.env.CRM_PASSWORD) {
    return jsonResponse(401, { error: 'No autorizado' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonResponse(500, { error: 'Falta configurar ANTHROPIC_API_KEY en Netlify (Site settings → Environment variables)' });
  }

  const store = getStore({
    name: 'gm-crm-data',
    siteID: process.env.SITE_ID_MANUAL,
    token: process.env.BLOBS_ACCESS_TOKEN
  });
  let clientes = (await store.get('clientes', { type: 'json' })) || [];
  const idx = clientes.findIndex(x => x.id === id);
  if (idx === -1) return jsonResponse(404, { error: 'Cliente no encontrado' });
  const c = clientes[idx];

  const userPrompt = `Investiga esta empresa cliente potencial:
Nombre: ${c.nombre}
Localidad: ${c.localidad}
${c.web ? 'Web conocida: ' + c.web : ''}
${c.direccion ? 'Dirección conocida: ' + c.direccion : ''}

Busca en internet información real y actual. Devuelve solo el JSON.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }]
      })
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || 'Error de la API de Anthropic');

    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const start = textBlocks.indexOf('{');
    const end = textBlocks.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) throw new Error('El agente no devolvió un JSON válido');
    const result = JSON.parse(textBlocks.slice(start, end + 1));

    if (result.nombre_correcto) c.nombre = result.nombre_correcto;
    if (result.direccion) c.direccion = result.direccion;
    if (result.telefono) c.telefono = result.telefono;
    if (result.web) c.web = result.web;
    if (result.redes) c.redes = result.redes;
    if (result.tipo_negocio) c.tipoNegocio = result.tipo_negocio;
    if (Array.isArray(result.categorias)) c.categorias = result.categorias;
    if (Array.isArray(result.proveedor_actual_detectado)) c.proveedorActual = result.proveedor_actual_detectado;
    if (Array.isArray(result.productos_detectados)) c.productosDetectados = result.productos_detectados;
    if (Array.isArray(result.servicios)) c.servicios = result.servicios;
    if (result.novedades) c.novedades = result.novedades;
    if (result.potencial) c.potencial = Object.assign({ granFormato: '', rotulacion: '', impresion: '', sellosEspeciales: '' }, result.potencial);
    if (Array.isArray(result.lineas_gm_adecuadas)) c.lineasGM = result.lineas_gm_adecuadas;
    if (result.prioridad) c.prioridad = result.prioridad;
    c.potencialGlobal = result.prioridad || c.potencialGlobal;
    c.historial = c.historial || [];
    c.historial.push({
      fecha: new Date().toISOString(),
      resumen: result.resumen || '',
      fuentes: Array.isArray(result.fuentes) ? result.fuentes.filter(f => f && f.url) : []
    });

    clientes[idx] = c;
    await store.setJSON('clientes', clientes);

    return jsonResponse(200, { cliente: c });
  } catch (err) {
    return jsonResponse(500, { error: err.message || 'Error investigando el cliente' });
  }
};
