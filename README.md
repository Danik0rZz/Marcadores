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
Una pestaña dedicada para explorar todas las interconexiones del sistema en una sola pantalla, con filtros por nivel de afinidad, tags compartidos o vínculos manuales.

### 5. Copias de Seguridad (Backup JSON)
- **Exportar**: Descarga un archivo `.json` completo con todos los marcadores, notas, tags, relaciones e historial.
- **Importar**: Permite restaurar datos desde un archivo `.json` eligiendo entre **anexar** a los datos existentes o **reemplazar todo**.

---

## 🛠️ Stack Tecnológico

- **Backend**: Node.js + Express
- **Base de Datos**: SQLite nativo con `better-sqlite3` en modo WAL (Write-Ahead Logging) y claves foráneas activadas.
- **Frontend**: React 19 + Vite + Tailwind CSS v4 + Lucide Icons.
- **Testing**: Node.js Test Runner integrado (`node:test` y `node:assert`).

---

## 🏁 Cómo Iniciar la Aplicación

### 0. Requisitos e Instalación
Necesitás **Node.js 20.19 o superior**. El proyecto tiene dependencias en la raíz, en `server/` y en `client/`:

```bash
git clone <url-del-repositorio>
cd <carpeta-del-repositorio>
npm install
npm install --prefix server
npm install --prefix client
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
npm test
```

---

## 📂 Estructura del Proyecto

```
.
├── client/                     # Frontend en React + Vite + Tailwind
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx              # Barra de navegación, pestañas y búsqueda
│   │   │   ├── FilterBar.jsx           # Filtros por categoría, subcategoría, tema y tags
│   │   │   ├── BookmarkCard.jsx        # Tarjeta de marcador con badges y acciones
│   │   │   ├── NoteCard.jsx            # Tarjeta de nota con vista previa y acciones
│   │   │   ├── RelatedDrawerModal.jsx  # Modal de coincidencias y relaciones cruzadas
│   │   │   ├── BookmarkFormModal.jsx   # Formulario de alta/edición de marcadores
│   │   │   ├── NoteFormModal.jsx       # Formulario de alta/edición de notas
│   │   │   ├── ManualLinkModal.jsx     # Modal para vincular manualmente
│   │   │   ├── CrossMatrixView.jsx     # Tablero global de conexiones
│   │   │   └── BackupModal.jsx         # Exportación e importación JSON
│   │   ├── api.js                      # Cliente HTTP para la API local
│   │   ├── App.jsx                     # Componente principal y orquestador de estado
│   │   └── index.css                   # Estilos Tailwind CSS
├── server/                     # Backend en Node.js + Express + SQLite
│   ├── db.js                   # Esquema SQLite, migraciones y datos semilla
│   ├── matchingService.js      # Motor de cálculo de afinidad y relaciones
│   ├── routes.js               # Endpoints REST (CRUD, taxonomía, matriz, backup)
│   ├── index.js                # Servidor Express
│   └── tests/
│       └── api.test.js         # Suite de pruebas automatizadas
├── data/                       # SQLite local (se crea al iniciar; no se versiona)
│   └── app.db                  # Tus datos personales: excluido por .gitignore
├── package.json                # Scripts raíz (dev, build, start, test)
└── README.md                   # Documentación técnica
```
