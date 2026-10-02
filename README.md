# Nexus — Marcadores & Notas con Clasificación Cruzada

Aplicación web local desarrollada para gestionar, clasificar y correlacionar **Marcadores del Navegador** y **Notas de Conocimiento** mediante una taxonomía multidimensional y un motor de afinidad cruzada.

---

## 🚀 Características Principales

### 1. Clasificación Jerárquica y de Propósito (en Marcadores y Notas)
Tanto los marcadores como las notas cuentan con tres niveles de organización:
- **Categoría**: Clasificación temática principal (ej. *Desarrollo*, *Finanzas*, *Diseño*).
- **Subcategoría**: Especialización o área técnica (ej. *Frontend*, *Bases de Datos*, *Inversiones*).
- **Tema / Propósito**: La razón por la que se guardó el recurso (ej. *Estudio y Referencia Técnica*, *Optimización de Consultas*, *Planificación de Ahorro*).

### 2. Sistema de Tags para Búsqueda y Coincidencias
- Podés añadir múltiples tags a cada marcador y a cada nota.
- Buscador interactivo en tiempo real y selector de tags con conteo de usos.
- Normalización automática (sin duplicados, minúsculas).

### 3. Motor de Cruce y Relación Automática (Coincidencias)
El sistema analiza constantemente las similitudes entre marcadores y notas:
- **Detección automática**: Si un marcador y una nota comparten **Categoría**, **Subcategoría**, **Tema** o **Tags**, el sistema los relaciona de inmediato.
- **Puntaje de Afinidad (Score)**: Muestra la fuerza de la relación calculando los criterios compartidos.
- **Detalle transparente de coincidencias**:
  - *Misma categoría: [Categoría]*
  - *Misma subcategoría: [Subcategoría]*
  - *Mismo tema: [Tema]*
  - *Tags compartidos (N): [tag1, tag2]*
- **Vínculos manuales directos**: Además del matching automático, podés conectar explícitamente cualquier nota con cualquier marcador y añadir una nota explicativa personal.

### 4. Matriz de Cruce y Grafo de Relaciones
Una pestaña dedicada para explorar todas las interconexiones del sistema en una sola pantalla, con filtros por nivel de afinidad, tags compartidos o vínculos manuales, y un grafo interactivo con física propia.

### 5. Notas en Markdown
Editor con vista previa, resaltado de sintaxis (highlight.js), botón de copiar en los bloques de código y enlaces `[[WikiLinks]]` entre notas y marcadores.

### 6. Copias de Seguridad e Importación
- **Exportar**: Descarga un archivo `.json` completo con todos los marcadores, notas, tags, relaciones y papelera.
- **Importar JSON**: Restaura un backup eligiendo entre **anexar** a los datos existentes o **reemplazar todo**.
- **Importar desde el navegador**: Lee el archivo HTML que exportan Chrome, Firefox o Edge; cada carpeta pasa a ser una subcategoría y se omiten los duplicados.

### 7. Privacidad
La página no hace peticiones a terceros: las fuentes van incluidas en el bundle y los favicons los descarga el propio servidor desde cada sitio guardado (no desde un servicio de Google) y los guarda en caché en `data/favicons/`.

---

## 🛠️ Stack Tecnológico

- **Backend**: Node.js + Express
- **Base de Datos**: SQLite nativo con `better-sqlite3` en modo WAL (Write-Ahead Logging) y claves foráneas activadas.
- **Frontend**: React 19 + Vite + Tailwind CSS v4 + Lucide Icons, `marked` + DOMPurify + highlight.js para Markdown.
- **Testing**: Node.js Test Runner integrado (`node:test` y `node:assert`) y oxlint.

---

## 🏁 Cómo Iniciar la Aplicación

### 0. Requisitos e Instalación
Necesitás **Node.js 20.19 o superior**. El proyecto tiene dependencias en la raíz, en `server/` y en `client/`:

```bash
git clone <url-del-repositorio>
cd <carpeta-del-repositorio>
npm run setup   # instala dependencias en la raíz, server/ y client/
```

### 1. Modo Desarrollo (Recomendado para trabajar)
Ejecuta simultáneamente el backend en `http://localhost:3001` y el frontend en `http://localhost:5173`:

```bash
npm run dev
```

Abrí tu navegador en **`http://localhost:5173`**.

### 2. Compilar y Ejecutar en Producción
```bash
# Compilar frontend
npm run build

# Iniciar servidor backend (sirve la API y el frontend estático)
npm start
```

Abrí tu navegador en **`http://localhost:3001`**.

### 3. Ejecutar Pruebas Automatizadas
```bash
npm test        # tests del servidor + build del cliente
npm run lint    # análisis estático del cliente (oxlint)
```

GitHub Actions ejecuta ambos en cada push y pull request (`.github/workflows/ci.yml`).

Las pruebas usan una base de datos temporal: nunca tocan `data/app.db`.

### Configuración y Seguridad

La API no tiene autenticación, así que está pensada para uso **solo local**:

- Escucha únicamente en `127.0.0.1`, de modo que no es accesible desde otros equipos de la red.
- Rechaza peticiones con un `Host` u `Origin` que no sea local. Así, ninguna página web abierta en el navegador puede leer ni borrar tus datos.
- Solo se aceptan URLs `http://` y `https://`.

| Variable  | Por defecto      | Uso                              |
|-----------|------------------|----------------------------------|
| `PORT`    | `3001`           | Puerto del servidor              |
| `HOST`    | `127.0.0.1`      | Interfaz de red donde escucha    |
| `DB_PATH` | `data/app.db`    | Ruta del archivo SQLite          |

---

## 📂 Estructura del Proyecto

```
.
├── client/                         # Frontend en React + Vite + Tailwind
│   └── src/
│       ├── App.jsx                 # Pestañas, modales y acciones
│       ├── api.js                  # Cliente HTTP de la API local
│       ├── graphEngine.js          # Física y geometría del grafo (sin React)
│       ├── hooks/
│       │   ├── useLibrary.js       # Biblioteca completa + resultados filtrados
│       │   ├── useDialog.js        # Foco, Escape y apilado de modales
│       │   ├── useFormState.js     # Estado de formularios y cambios sin guardar
│       │   └── useToasts.js        # Notificaciones
│       ├── components/
│       │   ├── CollectionPage.jsx  # Página común de marcadores y notas
│       │   ├── Dialog.jsx          # Contenedor accesible de los modales
│       │   ├── MarkdownViewer.jsx  # Markdown, WikiLinks y resaltado de código
│       │   ├── GraphView.jsx       # Grafo interactivo en canvas
│       │   ├── *FormModal.jsx      # Alta y edición de marcadores y notas
│       │   └── ...                 # Tarjetas, tablas, matriz, barra lateral, ajustes
│       └── utils/                  # Favicons y extractos de texto
├── server/                         # Backend en Node.js + Express + SQLite
│   ├── index.js                    # Servidor Express (solo local)
│   ├── localOnly.js                # Bloqueo de peticiones de otros orígenes
│   ├── db.js                       # Esquema, migraciones y datos de ejemplo
│   ├── routes.js                   # Endpoints REST
│   ├── matchingService.js          # Motor de afinidad y relaciones
│   ├── taxonomyService.js          # Árbol de categorías
│   ├── itemValidation.js           # Validación de entradas e importaciones
│   ├── netscapeParser.js           # Importación de marcadores del navegador
│   ├── faviconService.js           # Descarga y caché de favicons
│   └── tests/                      # Suite de pruebas (base de datos temporal)
├── data/                           # Se crea al iniciar; no se versiona
│   ├── app.db                      # Tus datos personales
│   └── favicons/                   # Caché de íconos
└── .github/workflows/ci.yml        # Lint, tests y build en cada push
```

---

## 📄 Licencia

[MIT](LICENSE) © 2026 danik0rzz
