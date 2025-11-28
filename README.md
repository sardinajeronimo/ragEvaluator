# RAG Evaluator

Sistema de evaluación automatizado para chatbots y sistemas RAG (Retrieval-Augmented Generation).

## 🎯 Características

- **Interfaz minimalista oscura**: Diseño limpio y fácil de usar
- **Configuración flexible**: Soporta cualquier API de chatbot (URL, método HTTP, headers de autenticación)
- **Prueba de conexión**: Valida que tu sistema esté funcionando antes de evaluar
- **Evaluación con IA**: Usa OpenAI GPT-4 para evaluar respuestas según 5 criterios
- **Resultados visuales**: Interfaz clara con código de colores y barras de progreso
- **Exportación a Excel**: Descarga los resultados en formato Excel

## 📋 Los 5 Criterios de Evaluación

1. **C1 - Correctitud**: ¿Qué tan correcta es la respuesta comparada con lo esperado?
2. **C2 - Cobertura**: ¿Qué tanto cubre todos los aspectos de la respuesta esperada?
3. **C3 - Relevancia**: ¿La respuesta es relevante y directa sin divagar?
4. **C4 - Factualidad**: ¿Los datos específicos son correctos? ¿Hay alucinaciones?
5. **C5 - Claridad**: ¿La respuesta está bien estructurada y es útil?

Cada criterio recibe un score de 0 a 1. El promedio determina PASS (≥0.75) o FAIL (<0.75).

## 🚀 Inicio Rápido

### Frontend (React + Vite + Tailwind)

```bash
cd frontend
npm install
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

## 📖 Cómo Usar

### 1. Configurar Sistema a Evaluar

- **Base URL**: La URL base de tu API (ej: `http://localhost:3000`)
- **Endpoint**: La ruta específica (ej: `/chat` o `/api/message`)
- **Método HTTP**: Selecciona POST, GET o PUT según tu API
- **Headers de Autenticación**: Agrega los headers necesarios, por ejemplo:
  - `Authorization: Bearer token123`
  - `x-api-key: mi-api-key`

### 2. Probar Conexión

Haz click en "Probar Conexión" para validar que tu sistema responde correctamente.

### 3. Ingresar Caso de Prueba

- **Pregunta**: La consulta que enviarás al chatbot
- **Respuesta Esperada**: La respuesta ideal que debería dar el chatbot

### 4. Ejecutar Evaluación

Haz click en "Ejecutar Evaluación". El sistema:
1. Enviará la pregunta a tu chatbot
2. Recibirá la respuesta obtenida
3. Evaluará con OpenAI según los 5 criterios
4. Mostrará los resultados con visualizaciones

### 5. Ver Resultados

Los resultados muestran:
- **Resultado Final**: PASS o FAIL
- **Score Promedio**: Porcentaje general
- **Respuesta Obtenida**: Lo que respondió tu chatbot
- **Evaluación por Criterios**: Score y comentario para cada uno de los 5 criterios

### 6. Descargar Excel (opcional)

Exporta los resultados a un archivo Excel con todas las métricas.

## 🎨 Diseño

La interfaz usa un diseño de 2 columnas:
- **Izquierda**: Configuración y entrada de datos
- **Derecha**: Resultados en tiempo real

Todo el diseño es oscuro, minimalista y responsivo.

## 🔧 Tecnologías

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS 4
- **Evaluación**: OpenAI GPT-4

## 📝 Notas

- Los datos de configuración se guardan en el estado del componente (se pierden al recargar)
- La aplicación es completamente frontend, no requiere backend propio
- Se conecta directamente a tu API y a OpenAI

## 🔜 Próximas Mejoras

- [ ] Persistencia de configuración (localStorage)
- [ ] Carga de datasets desde CSV/Excel
- [ ] Evaluación en batch de múltiples casos
- [ ] Historial de evaluaciones
- [ ] Configuración personalizada de criterios
- [ ] Soporte para más proveedores de IA (Anthropic, Gemini, etc.)

## 📄 Licencia

MIT
