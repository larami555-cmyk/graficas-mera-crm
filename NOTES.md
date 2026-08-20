# Gráficas Mera — CRM de Inteligencia Comercial

Réplica del CRM de MCS Representaciones (mcsrepresentaciones-web), adaptado para el sector de artes gráficas e
imprenta industrial. MCarmen colabora como comercial con Gráficas Mera (imprenta industrial, A Coruña), que
trabaja con PVC, cartón pluma, aluminio, metacrilato, madera, caucho y lonas, en estas líneas de producto:
- Gran formato (lonas, banderolas, vinilos, cartelería)
- Rotulación y señalética (neones, rótulos en aluminio/metacrilato/madera)
- Impresión offset y digital (talonarios, dípticos, trípticos, revistas, papelería)
- Sellos y productos especiales (sellos de caucho, loterías, numeración)

## Estado actual
- Frontend en `/crm/`, protegido con contraseña (`CRM_PASSWORD`).
- Backend: Netlify Functions (`crm-clientes.js` CRUD, `crm-investigar.js` agente investigador).
- Base de datos: Netlify Blobs, store `gm-crm-data`.
- Agente: Claude Sonnet 4.6 + web search, mismo patrón que MCS pero con esquema de campos y líneas de producto
  propias de artes gráficas (ver SYSTEM_PROMPT en crm-investigar.js).

## Variables de entorno necesarias en Netlify (Site settings → Environment variables)
- `ANTHROPIC_API_KEY` — misma clave de console/platform.claude.com que MCS (cuenta personal de MCarmen).
- `CRM_PASSWORD` — contraseña de acceso a /crm/ (distinta a la de MCS, es otro cliente).
- `BLOBS_ACCESS_TOKEN` — personal access token de Netlify (puede reutilizarse el mismo que en MCS, es a nivel de
  cuenta de usuario, no de sitio).
- `SITE_ID_MANUAL` — el Site ID de este proyecto en Netlify (ver Project details → Project ID). Necesario porque
  Netlify Blobs a veces no inyecta el contexto automáticamente (`MissingBlobsEnvironmentError`), así que las
  funciones pasan siteID + token explícitos a `getStore()`. Ver lección equivalente en mcsrepresentaciones-web/NOTES.md.

## Lecciones heredadas del proyecto MCS (mismas trampas, misma solución)
- Netlify descarta en silencio cualquier variable de entorno que empiece por `NETLIFY_`. Por eso el token de
  Blobs se llama `BLOBS_ACCESS_TOKEN`, no `NETLIFY_BLOBS_TOKEN`.
- Los cambios de variables de entorno no se aplican hasta el siguiente deploy — hay que forzar "Trigger deploy"
  después de cada cambio.
- `getStore()` necesita `{ name, siteID, token }` explícitos en producción si el contexto automático falla.
