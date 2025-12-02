import * as XLSX from 'xlsx';

// ==================================================================================================
// COMPONENTE PRINCIPAL (App.tsx)
// ==================================================================================================
// Este archivo contiene toda la lógica y la interfaz de usuario de la aplicación frontend.
// Está construido con React y TypeScript, utilizando el hook `useState` para manejar el estado.
// La UI está diseñada con TailwindCSS para un estilo moderno y responsivo.
// ==================================================================================================

// --------------------------------------------------------------------------------------------------
// EVALUADOR RAG UNIVERSAL
// Esta aplicación se conecta a CUALQUIER API (n8n, FastAPI, chatbots, etc.) para:
// 1. Enviar preguntas de prueba al sistema RAG configurado
// 2. Recibir las respuestas generadas
// 3. Evaluarlas con OpenAI GPT-4 usando 11 métricas de calidad
// 4. Generar un Excel con los resultados siguiendo el template exacto
//
// FLUJO:
// - El usuario configura la URL, endpoint y método de su API
// - La app extrae automáticamente la respuesta de cualquier estructura JSON
// - OpenAI evalúa cada respuesta comparándola con la respuesta esperada
// - Los resultados se exportan a Excel manteniendo el formato del template
// --------------------------------------------------------------------------------------------------

import { useState } from 'react'

// --- Tipos de Datos ---
// Estos tipos definen la estructura de los datos que maneja la aplicación.
// Es una buena práctica mantenerlos consistentes con los modelos Pydantic del backend.

interface SystemConfig {
  baseUrl: string
  endpoint: string
  method: 'POST' | 'GET' | 'PUT'
  headers: { key: string; value: string }[]
  openaiApiKey: string
  openaiModel: 'gpt-4' | 'gpt-4-turbo' | 'gpt-3.5-turbo'
  temperature: number
  commentLength: 'short' | 'detailed'
}

interface TestCase {
  id: number
  pregunta: string
  respuesta_esperada: string
}

// Interfaces para la respuesta del backend (no usadas actualmente, solo para compatibilidad futura)
// interface MetricResult {
//   metric: string
//   score: number
//   explanation: string
// }

// interface BackendEvaluationResponse {
//   query: string
//   context: string
//   response: string
//   results: MetricResult[]
// }

// Interfaz que coincide con el template Excel
interface EvaluationResult {
  id: number
  pregunta: string
  respuesta_esperada: string
  respuesta_obtenida: string
  // 5 Métricas con puntuación y comentario
  c1_correctness_score: number
  c1_correctness_comment: string
  c2_coverage_score: number
  c2_coverage_comment: string
  c3_relevance_score: number
  c3_relevance_comment: string
  c4_faithfulness_score: number
  c4_faithfulness_comment: string
  c5_clarity_score: number
  c5_clarity_comment: string
  juicio_final: 'PASS' | 'FAIL'
  comentario_final: string
  score_promedio: number // Para mostrar en UI
}


function App() {
  // --- Estados de la Aplicación ---
  // El estado se gestiona con `useState` para mantener la UI reactiva a los cambios de datos.

  // Estado para la configuración de la API a la que nos conectaremos.
  const [config, setConfig] = useState<SystemConfig>({
    baseUrl: '', // URL de tu API (n8n, FastAPI, etc.)
    endpoint: '',
    method: 'POST',
    headers: [],
    openaiApiKey: '',
    openaiModel: 'gpt-4',
    temperature: 0.3,
    commentLength: 'short'
  })

  // Estado para verificar si la conexión con el backend es exitosa.
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [connectionMessage, setConnectionMessage] = useState('')

  // Estado para la lista de casos de prueba que el usuario agrega.
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [currentCase, setCurrentCase] = useState({ pregunta: '', respuesta_esperada: '' })
  const [nextId, setNextId] = useState(1)

  // Estado para gestionar el proceso de evaluación.
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [evaluationProgress, setEvaluationProgress] = useState({ current: 0, total: 0, currentQuestion: '' })
  const [results, setResults] = useState<EvaluationResult[]>([])

  // Estados para búsqueda y filtrado
  const [searchQuery, setSearchQuery] = useState('')


  // --- Lógica de la Aplicación ---

  // Función para extraer la respuesta de cualquier API (universal)
  const extractResponseFromAPI = (apiResponse: any): string => {
    // Intentar extraer la respuesta de diferentes estructuras comunes
    if (typeof apiResponse === 'string') {
      return apiResponse;
    }

    // Probar diferentes campos comunes
    const possibleFields = [
      'respuesta', 'response', 'answer', 'text', 'content',
      'message', 'output', 'result', 'reply', 'data'
    ];

    for (const field of possibleFields) {
      if (apiResponse[field] && typeof apiResponse[field] === 'string') {
        return apiResponse[field];
      }
    }

    // Si tiene nested data
    if (apiResponse.data && typeof apiResponse.data === 'object') {
      return extractResponseFromAPI(apiResponse.data);
    }

    // Último recurso: stringificar el objeto
    return JSON.stringify(apiResponse);
  };

  // Función para evaluar con OpenAI (5 métricas con puntuación y comentario)
  const evaluateWithOpenAI = async (pregunta: string, respuestaEsperada: string, respuestaObtenida: string) => {
    const commentInstruction = config.commentLength === 'detailed'
      ? 'Proporciona comentarios detallados y exhaustivos (2-3 oraciones por métrica).'
      : 'Proporciona comentarios breves y concisos (1 oración por métrica).';

    const prompt = `Eres un evaluador experto de sistemas RAG. Tu trabajo es SOLO comparar la "RESPUESTA OBTENIDA" con la "RESPUESTA ESPERADA". NO busques información externa ni verifiques hechos en internet. Evalúa únicamente en base a la comparación entre ambas respuestas.

PREGUNTA: ${pregunta}

RESPUESTA ESPERADA: ${respuestaEsperada}

RESPUESTA OBTENIDA: ${respuestaObtenida}

IMPORTANTE: Evalúa ÚNICAMENTE comparando ambas respuestas. NO uses conocimiento externo.

${commentInstruction}

Evalúa los siguientes 5 criterios (escala 0-1 para puntuación):

C1 — CORRECTITUD (vs expected):
- Puntuación: ¿Qué tan similar es la respuesta obtenida a la esperada en términos de contenido?
- Comentario: Compara qué aspectos coinciden o difieren entre ambas respuestas

C2 — COBERTURA (qué tanto cubre lo esperado):
- Puntuación: ¿La respuesta obtenida cubre todos los puntos mencionados en la esperada?
- Comentario: Indica qué puntos de la respuesta esperada están presentes o ausentes

C3 — RELEVANCIA / No divaga:
- Puntuación: ¿La respuesta obtenida se enfoca en lo mismo que la esperada sin agregar información extra irrelevante?
- Comentario: Señala si hay información adicional no presente en la esperada o si se desvía del tema

C4 — FACTUALIDAD / No alucinación:
- Puntuación: ¿La respuesta obtenida mantiene los mismos datos/hechos que la esperada sin inventar información nueva?
- Comentario: Identifica datos o afirmaciones en la obtenida que NO aparecen en la esperada

C5 — CLARIDAD / Utilidad:
- Puntuación: ¿La respuesta obtenida es tan clara y útil como la esperada?
- Comentario: Compara la calidad de redacción y estructura entre ambas

JUICIO FINAL:
- Determina "PASS" o "FAIL" basándote SOLO en qué tan bien la respuesta obtenida se alinea con la esperada
- Proporciona un comentario final con la puntuación promedio y justificación

Responde ÚNICAMENTE con un objeto JSON en este formato exacto (sin texto adicional):
{
  "c1_correctness_score": 0.X,
  "c1_correctness_comment": "comentario",
  "c2_coverage_score": 0.X,
  "c2_coverage_comment": "comentario",
  "c3_relevance_score": 0.X,
  "c3_relevance_comment": "comentario",
  "c4_faithfulness_score": 0.X,
  "c4_faithfulness_comment": "comentario",
  "c5_clarity_score": 0.X,
  "c5_clarity_comment": "comentario",
  "juicio_final": "PASS",
  "comentario_final": "Puntuación promedio: X.XX. Justificación del juicio."
}`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey}`
        },
        body: JSON.stringify({
          model: config.openaiModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: config.temperature,
          max_tokens: config.commentLength === 'detailed' ? 1200 : 600
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content.trim();

      // Intentar parsear el JSON de la respuesta
      const scores = JSON.parse(content);
      return scores;
    } catch (error) {
      console.error('Error evaluando con OpenAI:', error);
      throw error;
    }
  };

  // Probar la conexión con el backend (universal para cualquier API)
  const testConnection = async () => {
    setConnectionStatus('testing')
    setConnectionMessage('')
    try {
      // Payload simple y genérico para probar la conexión
      const testPayload = {
        query: "Prueba de conexión",
        question: "Prueba de conexión",
        pregunta: "Prueba de conexión",
        message: "Prueba de conexión"
      };

      const response = await fetch(`${config.baseUrl}${config.endpoint}`, {
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers.reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {})
        },
        body: config.method !== 'GET' ? JSON.stringify(testPayload) : undefined
      });

      if (response.ok) {
        // Obtener el texto de la respuesta primero
        const responseText = await response.text();

        // Validar que no esté vacío
        if (!responseText || responseText.trim() === '') {
          throw new Error('La API retornó una respuesta vacía. Verifica que tu workflow de n8n esté retornando datos correctamente.');
        }

        // Intentar parsear el JSON, si falla usar el texto tal cual
        let data: any;
        try {
          data = JSON.parse(responseText);
        } catch (jsonError) {
          // No es JSON válido, usar el texto directamente
          console.log('La respuesta no es JSON, usando texto plano:', responseText.substring(0, 100));
          data = responseText;
        }

        setConnectionStatus('success');

        // Extraer respuesta de forma universal
        const extractedResponse = extractResponseFromAPI(data);
        const preview = extractedResponse.substring(0, 80);

        setConnectionMessage(`✓ Conexión exitosa. Respuesta de prueba: "${preview}${extractedResponse.length > 80 ? '...' : ''}"`);
      } else {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      setConnectionStatus('error');
      setConnectionMessage(`✗ Error: ${error instanceof Error ? error.message : 'No se pudo conectar'}`);
    }
  }

  // Agregar un nuevo caso de prueba a la lista
  const addTestCase = () => {
    if (!currentCase.pregunta.trim() || !currentCase.respuesta_esperada.trim()) {
      alert('Por favor completa la pregunta y respuesta esperada')
      return
    }
    setTestCases([...testCases, { id: nextId, ...currentCase }])
    setNextId(nextId + 1)
    setCurrentCase({ pregunta: '', respuesta_esperada: '' })
  }

  // Eliminar un caso de prueba de la lista
  const removeTestCase = (id: number) => {
    setTestCases(testCases.filter(tc => tc.id !== id))
  }



  const runAllEvaluations = async () => {
    if(testCases.length === 0) {
      alert('Agrega al menos un caso de prueba');
      return;
    }
    if(connectionStatus !== 'success') {
      alert('Primero debes probar y validar la conexión');
      return;
    }
    if(!config.openaiApiKey) {
      alert('Debes configurar tu API Key de OpenAI');
      return;
    }

    setIsEvaluating(true)
    setResults([])
    setEvaluationProgress({ current: 0, total: testCases.length, currentQuestion: '' })

    const newResults: EvaluationResult[] = []

    try {
      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i]
        setEvaluationProgress({
          current: i + 1,
          total: testCases.length,
          currentQuestion: testCase.pregunta.substring(0, 60) + '...'
        })

        // 1. Enviar pregunta a la API para obtener la respuesta (universal)
        // Enviamos múltiples campos para maximizar compatibilidad con diferentes APIs
        const requestBody = {
          query: testCase.pregunta,
          question: testCase.pregunta,
          pregunta: testCase.pregunta,
          message: testCase.pregunta,
          prompt: testCase.pregunta
        };

        const response = await fetch(`${config.baseUrl}${config.endpoint}`, {
          method: config.method,
          headers: {
            'Content-Type': 'application/json',
            ...config.headers.reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {})
          },
          body: config.method !== 'GET' ? JSON.stringify(requestBody) : undefined
        });

        if (!response.ok) {
          throw new Error(`Error obteniendo respuesta del caso #${testCase.id}: ${response.statusText}`);
        }

        // Obtener el texto de la respuesta primero
        const responseText = await response.text();

        // Validar que no esté vacío
        if (!responseText || responseText.trim() === '') {
          throw new Error(`La API retornó una respuesta vacía para el caso #${testCase.id}. Verifica que tu workflow de n8n esté retornando datos correctamente.`);
        }

        // Intentar parsear el JSON
        let apiResult: any;
        try {
          apiResult = JSON.parse(responseText);
        } catch (jsonError) {
          console.error('Error parseando JSON. Respuesta recibida:', responseText);
          throw new Error(`La API retornó una respuesta inválida (no es JSON válido) para el caso #${testCase.id}. Respuesta: "${responseText.substring(0, 100)}..."`);
        }

        const respuestaObtenida = extractResponseFromAPI(apiResult);

        // 2. Evaluar con OpenAI (obtiene 5 métricas con comentarios Y juicio final)
        const scores = await evaluateWithOpenAI(
          testCase.pregunta,
          testCase.respuesta_esperada,
          respuestaObtenida
        );

        // 3. Calcular promedio para mostrar en UI
        const allScores = [
          scores.c1_correctness_score,
          scores.c2_coverage_score,
          scores.c3_relevance_score,
          scores.c4_faithfulness_score,
          scores.c5_clarity_score
        ];

        const score_promedio = allScores.reduce((a, b) => a + b, 0) / allScores.length;

        // 4. Construir resultado (usa el juicio_final y comentarios de OpenAI)
        const calculatedResult: EvaluationResult = {
          id: testCase.id,
          pregunta: testCase.pregunta,
          respuesta_esperada: testCase.respuesta_esperada,
          respuesta_obtenida: respuestaObtenida,
          c1_correctness_score: scores.c1_correctness_score,
          c1_correctness_comment: scores.c1_correctness_comment,
          c2_coverage_score: scores.c2_coverage_score,
          c2_coverage_comment: scores.c2_coverage_comment,
          c3_relevance_score: scores.c3_relevance_score,
          c3_relevance_comment: scores.c3_relevance_comment,
          c4_faithfulness_score: scores.c4_faithfulness_score,
          c4_faithfulness_comment: scores.c4_faithfulness_comment,
          c5_clarity_score: scores.c5_clarity_score,
          c5_clarity_comment: scores.c5_clarity_comment,
          score_promedio: score_promedio,
          juicio_final: scores.juicio_final,
          comentario_final: scores.comentario_final
        };

        newResults.push(calculatedResult);
      }

      setResults(newResults)
    } catch (error) {
      alert(`Error en la evaluación: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    } finally {
      setIsEvaluating(false)
      setEvaluationProgress({ current: 0, total: 0, currentQuestion: '' })
    }
  }

  // Función para re-evaluar un caso específico
  const reEvaluateCase = async (caseId: number) => {
    const testCase = testCases.find(tc => tc.id === caseId);
    if (!testCase) return;

    if (!config.openaiApiKey) {
      alert('Configura tu API Key de OpenAI primero');
      return;
    }

    setIsEvaluating(true);
    setEvaluationProgress({ current: 1, total: 1, currentQuestion: testCase.pregunta.substring(0, 60) + '...' });

    try {
      // Obtener respuesta de la API
      const requestBody = {
        query: testCase.pregunta,
        question: testCase.pregunta,
        pregunta: testCase.pregunta,
        message: testCase.pregunta,
        prompt: testCase.pregunta
      };

      const response = await fetch(`${config.baseUrl}${config.endpoint}`, {
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers.reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {})
        },
        body: config.method !== 'GET' ? JSON.stringify(requestBody) : undefined
      });

      if (!response.ok) {
        throw new Error(`Error obteniendo respuesta: ${response.statusText}`);
      }

      // Obtener el texto de la respuesta primero
      const responseText = await response.text();

      // Validar que no esté vacío
      if (!responseText || responseText.trim() === '') {
        throw new Error('La API retornó una respuesta vacía. Verifica que tu workflow de n8n esté retornando datos correctamente.');
      }

      // Intentar parsear el JSON
      let apiResult: any;
      try {
        apiResult = JSON.parse(responseText);
      } catch (jsonError) {
        console.error('Error parseando JSON. Respuesta recibida:', responseText);
        throw new Error(`La API retornó una respuesta inválida (no es JSON válido). Respuesta: "${responseText.substring(0, 100)}..."`);
      }

      const respuestaObtenida = extractResponseFromAPI(apiResult);

      // Evaluar con OpenAI
      const scores = await evaluateWithOpenAI(
        testCase.pregunta,
        testCase.respuesta_esperada,
        respuestaObtenida
      );

      const allScores = [
        scores.c1_correctness_score,
        scores.c2_coverage_score,
        scores.c3_relevance_score,
        scores.c4_faithfulness_score,
        scores.c5_clarity_score
      ];

      const score_promedio = allScores.reduce((a, b) => a + b, 0) / allScores.length;

      const updatedResult: EvaluationResult = {
        id: testCase.id,
        pregunta: testCase.pregunta,
        respuesta_esperada: testCase.respuesta_esperada,
        respuesta_obtenida: respuestaObtenida,
        c1_correctness_score: scores.c1_correctness_score,
        c1_correctness_comment: scores.c1_correctness_comment,
        c2_coverage_score: scores.c2_coverage_score,
        c2_coverage_comment: scores.c2_coverage_comment,
        c3_relevance_score: scores.c3_relevance_score,
        c3_relevance_comment: scores.c3_relevance_comment,
        c4_faithfulness_score: scores.c4_faithfulness_score,
        c4_faithfulness_comment: scores.c4_faithfulness_comment,
        c5_clarity_score: scores.c5_clarity_score,
        c5_clarity_comment: scores.c5_clarity_comment,
        score_promedio: score_promedio,
        juicio_final: scores.juicio_final,
        comentario_final: scores.comentario_final
      };

      // Actualizar resultados
      setResults(prev => {
        const index = prev.findIndex(r => r.id === caseId);
        if (index >= 0) {
          const newResults = [...prev];
          newResults[index] = updatedResult;
          return newResults;
        }
        return [...prev, updatedResult];
      });

      alert('✅ Caso re-evaluado exitosamente');
    } catch (error) {
      alert(`Error en la re-evaluación: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setIsEvaluating(false);
      setEvaluationProgress({ current: 0, total: 0, currentQuestion: '' });
    }
  }

  // Función para compartir resultados
  const shareResults = () => {
    const shareData = {
      timestamp: new Date().toISOString(),
      totalCases: results.length,
      passed: results.filter(r => r.juicio_final === 'PASS').length,
      failed: results.filter(r => r.juicio_final === 'FAIL').length,
      averageScore: (results.reduce((acc, r) => acc + r.score_promedio, 0) / results.length * 100).toFixed(1),
      results: results.map(r => ({
        pregunta: r.pregunta,
        juicio_final: r.juicio_final,
        score: (r.score_promedio * 100).toFixed(1) + '%'
      }))
    };

    const shareText = `📊 Evaluación RAG - ${new Date().toLocaleDateString()}

Total evaluados: ${shareData.totalCases}
✅ PASS: ${shareData.passed}
❌ FAIL: ${shareData.failed}
📈 Promedio: ${shareData.averageScore}%

Resultados completos:
${JSON.stringify(shareData, null, 2)}`;

    // Copiar al portapapeles
    navigator.clipboard.writeText(shareText).then(() => {
      alert('✅ Resultados copiados al portapapeles!\n\nPuedes compartirlos por email, Slack, etc.');
    }).catch(() => {
      // Fallback: mostrar en alert
      alert(shareText);
    });
  }

  // Filtrar casos de prueba según búsqueda
  const filteredTestCases = testCases.filter(tc =>
    tc.pregunta.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tc.respuesta_esperada.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filtrar resultados según búsqueda
  const filteredResults = results.filter(r =>
    r.pregunta.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.respuesta_obtenida.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const downloadExcel = async () => {
    try {
      // Cargar el template desde public
      const response = await fetch('/evaluatorTemplateExcel.xlsx');
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true });

      // Obtener la hoja "Evaluación RAG"
      const worksheet = workbook.Sheets['Evaluación RAG'] || workbook.Sheets[workbook.SheetNames[0]];

      // Agregar los datos empezando desde la fila 2
      results.forEach((result, index) => {
        const rowNum = index + 2;

        // Rellenar las columnas
        XLSX.utils.sheet_add_aoa(worksheet, [[
          result.pregunta,
          result.respuesta_esperada,
          result.respuesta_obtenida,
          result.c1_correctness_score,
          result.c1_correctness_comment,
          result.c2_coverage_score,
          result.c2_coverage_comment,
          result.c3_relevance_score,
          result.c3_relevance_comment,
          result.c4_faithfulness_score,
          result.c4_faithfulness_comment,
          result.c5_clarity_score,
          result.c5_clarity_comment,
          result.juicio_final,
          result.comentario_final
        ]], { origin: `A${rowNum}` });

        // Aplicar color a la celda del Juicio Final
        const cellAddress = `N${rowNum}`;
        if (!worksheet[cellAddress]) worksheet[cellAddress] = {};
  
        // Definir estilo según PASS/FAIL
        if (result.juicio_final === 'PASS') {
          worksheet[cellAddress].s = {
            fill: { fgColor: { rgb: "C6EFCE" } },  // Verde claro
            font: { bold: true, color: { rgb: "006100" } },  // Texto verde oscuro
            alignment: { horizontal: "center", vertical: "center" },
            border: {
              top: { style: "thin", color: { rgb: "CCCCCC" } },
              bottom: { style: "thin", color: { rgb: "CCCCCC" } },
              left: { style: "thin", color: { rgb: "CCCCCC" } },
              right: { style: "thin", color: { rgb: "CCCCCC" } }
            }
          };
        } else {
          worksheet[cellAddress].s = {
            fill: { fgColor: { rgb: "FFC7CE" } },  // Rojo claro
            font: { bold: true, color: { rgb: "9C0006" } },  // Texto rojo oscuro
            alignment: { horizontal: "center", vertical: "center" },
            border: {
              top: { style: "thin", color: { rgb: "CCCCCC" } },
              bottom: { style: "thin", color: { rgb: "CCCCCC" } },
              left: { style: "thin", color: { rgb: "CCCCCC" } },
              right: { style: "thin", color: { rgb: "CCCCCC" } }
            }
          };
        }
      });

      // Descargar el archivo
      XLSX.writeFile(workbook, 'resultados_evaluacion_rag.xlsx', { cellStyles: true });
    } catch (error) {
      alert(`Error generando Excel: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  };

  // Funciones para manejar los headers de autenticación
  const addHeader = () => setConfig({ ...config, headers: [...config.headers, { key: '', value: '' }] });
  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = [...config.headers];
    newHeaders[index][field] = value;
    setConfig({ ...config, headers: newHeaders });
  };
  const removeHeader = (index: number) => setConfig({ ...config, headers: config.headers.filter((_, i) => i !== index) });

  // --- Renderizado del Componente ---
  // El siguiente código JSX define la estructura de la página.
  // Utiliza clases de TailwindCSS para el estilo.
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <img src="/logoIGV.png" alt="IGV Logo" className="h-16 w-auto" />
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-white mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                RAG Evaluator
              </h1>
              <p className="text-gray-400 text-lg">Sistema de evaluación automatizado para chatbots y sistemas RAG</p>
            </div>
          </div>
        </header>

        {/* El resto de la UI está muy bien estructurada. 
            Los componentes están divididos en secciones claras:
            1. Configuración del Sistema
            2. Casos de Prueba
            3. Ejecución y Resultados
            
            Cada sección utiliza el estado de React para ser interactiva.
            Por ejemplo, los inputs actualizan el estado `config` y `currentCase`,
            y la lista de `testCases` se renderiza dinámicamente.
        */}

        {/* Paso 1: Configuración */}
        <section className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-lg">1</div>
            <h2 className="text-2xl font-semibold text-white">Configurar Sistema a Evaluar</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* Base URL */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Base URL</label>
              <input
                type="text"
                value={config.baseUrl}
                onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                placeholder="http://localhost:8000"
              />
            </div>

            {/* Endpoint */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Endpoint</label>
              <input
                type="text"
                value={config.endpoint}
                onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
                className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                placeholder="/evaluate"
              />
            </div>

            {/* Método HTTP */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Método HTTP</label>
              <select
                value={config.method}
                onChange={(e) => setConfig({ ...config, method: e.target.value as 'POST' | 'GET' | 'PUT' })}
                className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              >
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
          </div>

          {/* OpenAI API Key */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              API Key de LLM  <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={config.openaiApiKey}
              onChange={(e) => setConfig({ ...config, openaiApiKey: e.target.value })}
              className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              placeholder="sk-..."
            />
            <p className="text-xs text-gray-400 mt-1">Necesaria para evaluar las respuestas</p>
          </div>

          {/* Configuración de OpenAI */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* Modelo */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Modelo OpenAI</label>
              <select
                value={config.openaiModel}
                onChange={(e) => setConfig({ ...config, openaiModel: e.target.value as 'gpt-4' | 'gpt-4-turbo' | 'gpt-3.5-turbo' })}
                className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              >
                <option value="gpt-4">GPT-4 (Más preciso)</option>
                <option value="gpt-4-turbo">GPT-4 Turbo (Rápido)</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Económico)</option>
              </select>
            </div>

            {/* Temperature */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Temperature: {config.temperature}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.temperature}
                onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                {config.temperature < 0.3 ? 'Muy determinista' : config.temperature < 0.7 ? 'Balanceado' : 'Creativo'}
              </p>
            </div>

            {/* Longitud de comentarios */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Longitud Comentarios</label>
              <select
                value={config.commentLength}
                onChange={(e) => setConfig({ ...config, commentLength: e.target.value as 'short' | 'detailed' })}
                className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              >
                <option value="short">Breves (1 oración)</option>
                <option value="detailed">Detallados (2-3 oraciones)</option>
              </select>
            </div>
          </div>

          {/* Headers */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-300">Headers de Autenticación (Opcional)</label>
              <button
                onClick={addHeader}
                className="text-sm text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
              >
                <span className="text-lg">+</span> Agregar header
              </button>
            </div>

            {config.headers.length > 0 && (
              <div className="space-y-2">
                {config.headers.map((header, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={header.key}
                      onChange={(e) => updateHeader(index, 'key', e.target.value)}
                      placeholder="Nombre (ej: Authorization)"
                      className="flex-1 bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={header.value}
                      onChange={(e) => updateHeader(index, 'value', e.target.value)}
                      placeholder="Valor (ej: Bearer token123)"
                      className="flex-1 bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => removeHeader(index)}
                      className="px-3 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Botón de prueba */}
          <div className="flex items-center gap-4">
            <button
              onClick={testConnection}
              disabled={connectionStatus === 'testing'}
              className={`flex-1 py-3 rounded-lg font-medium transition flex items-center justify-center gap-2 ${connectionStatus === 'testing'
                  ? 'bg-gray-700 text-gray-400 cursor-wait'
                  : connectionStatus === 'success'
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : connectionStatus === 'error'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {connectionStatus === 'testing' ? (
                <>
                  <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Probando conexión...
                </>
              ) : (
                'Probar Conexión'
              )}
            </button>

            {/* Mensaje de estado */}
            {connectionMessage && (
              <div className={`flex-1 p-3 rounded-lg text-sm font-medium ${connectionStatus === 'success'
                  ? 'bg-green-900/30 border border-green-700 text-green-300'
                  : 'bg-red-900/30 border border-red-700 text-red-300'
              }`}>
                {connectionMessage}
              </div>
            )}
          </div>
        </section>

        {/* Paso 2: Casos de Prueba */}
        <section className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center font-bold text-lg">2</div>
            <h2 className="text-2xl font-semibold text-white">Agregar Casos de Prueba</h2>
          </div>

          {/* Formulario para agregar caso */}
          <div className="bg-gray-700/30 rounded-lg p-6 border border-gray-600 mb-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Pregunta</label>
                <textarea
                  value={currentCase.pregunta}
                  onChange={(e) => setCurrentCase({ ...currentCase, pregunta: e.target.value })}
                  rows={4}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none transition"
                  placeholder="¿Cuál es tu pregunta para el chatbot?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Respuesta Esperada</label>
                <textarea
                  value={currentCase.respuesta_esperada}
                  onChange={(e) => setCurrentCase({ ...currentCase, respuesta_esperada: e.target.value })}
                  rows={4}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none transition"
                  placeholder="¿Qué respuesta esperas del chatbot?"
                />
              </div>
            </div>

            <button
              onClick={addTestCase}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
            >
              <span className="text-xl">+</span> Agregar Caso de Prueba
            </button>
          </div>

          {/* Lista de casos agregados */}
          {testCases.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-200">
                  Casos Agregados ({testCases.length})
                </h3>
                <div className="flex gap-3 items-center">
                  {/* Barra de búsqueda */}
                  <input
                    type="text"
                    placeholder="🔍 Buscar casos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition w-64"
                  />
                  <button
                    onClick={() => setTestCases([])}
                    className="text-sm text-red-400 hover:text-red-300 font-medium"
                  >
                    Limpiar todos
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {filteredTestCases.map((testCase, index) => (
                  <div key={testCase.id} className="bg-gray-700/50 rounded-lg p-4 border border-gray-600 hover:border-gray-500 transition">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600/20 border border-purple-500 flex items-center justify-center text-purple-400 font-bold text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="mb-3">
                          <p className="text-xs text-gray-400 mb-1 font-medium">Pregunta:</p>
                          <p className="text-sm text-gray-200">{testCase.pregunta}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1 font-medium">Respuesta Esperada:</p>
                          <p className="text-sm text-gray-300">{testCase.respuesta_esperada}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeTestCase(testCase.id)}
                        className="flex-shrink-0 w-8 h-8 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition flex items-center justify-center"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500 bg-gray-700/20 rounded-lg border border-dashed border-gray-600">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg">No hay casos de prueba agregados</p>
              <p className="text-sm mt-1">Agrega tu primera pregunta arriba</p>
            </div>
          )}
        </section>

        {/* Paso 3: Ejecutar y Resultados */}
        <section className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center font-bold text-lg">3</div>
            <h2 className="text-2xl font-semibold text-white">Ejecutar Evaluación</h2>
          </div>

          {/* Botón ejecutar */}
          <button
            onClick={runAllEvaluations}
            disabled={isEvaluating || connectionStatus !== 'success' || testCases.length === 0}
            className={`w-full py-4 rounded-lg font-bold text-lg transition flex items-center justify-center gap-3 mb-6 ${isEvaluating
                ? 'bg-gray-700 text-gray-400 cursor-wait'
                : connectionStatus !== 'success' || testCases.length === 0
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white shadow-lg'
            }`}
          >
            {isEvaluating ? (
              <div className="w-full">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="w-6 h-6 border-3 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  <span>Evaluando... ({evaluationProgress.current}/{evaluationProgress.total})</span>
                </div>
                {/* Barra de progreso */}
                <div className="w-full bg-gray-600 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-green-500 to-blue-500 h-full transition-all duration-300"
                    style={{ width: `${(evaluationProgress.current / evaluationProgress.total) * 100}%` }}
                  />
                </div>
                {evaluationProgress.currentQuestion && (
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    📝 {evaluationProgress.currentQuestion}
                  </p>
                )}
              </div>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Ejecutar Evaluación de {testCases.length} caso{testCases.length !== 1 ? 's' : ''}
              </>
            )}
          </button>

          {/* Resultados */}
          {results.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-white">Resultados</h3>
                <div className="flex gap-3">
                  <button
                    onClick={shareResults}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    Compartir
                  </button>
                  <button
                    onClick={downloadExcel}
                    className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Descargar Excel
                  </button>
                </div>
              </div>

              {/* Resumen general */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 rounded-lg p-4 border border-blue-700">
                  <p className="text-sm text-blue-300 mb-1">Total Evaluados</p>
                  <p className="text-3xl font-bold text-white">{results.length}</p>
                </div>
                <div className="bg-gradient-to-br from-green-900/50 to-green-800/30 rounded-lg p-4 border border-green-700">
                  <p className="text-sm text-green-300 mb-1">Aprobados (PASS)</p>
                  <p className="text-3xl font-bold text-white">
                    {results.filter(r => r.juicio_final === 'PASS').length}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-red-900/50 to-red-800/30 rounded-lg p-4 border border-red-700">
                  <p className="text-sm text-red-300 mb-1">Fallidos (FAIL)</p>
                  <p className="text-3xl font-bold text-white">
                    {results.filter(r => r.juicio_final === 'FAIL').length}
                  </p>
                </div>
              </div>

              {/* Barra de búsqueda en resultados */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="🔍 Buscar en resultados..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-green-500 transition"
                />
              </div>

              {/* Tabla de resultados */}
              <div className="bg-gray-700/30 rounded-lg border border-gray-600 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">#</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">Pregunta</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">Score</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">Resultado</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-600">
                      {filteredResults.map((result, index) => (
                        <tr key={result.id} className="hover:bg-gray-700/50 transition">
                          <td className="px-4 py-4 text-sm text-gray-400">{index + 1}</td>
                          <td className="px-4 py-4 text-sm text-gray-200 max-w-md truncate">
                            {result.pregunta}
                          </td>
                          <td className="px-4 py-4 text-sm">
                            <span className={`font-bold ${result.score_promedio >= 0.8 ? 'text-green-400' : result.score_promedio >= 0.6 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {(result.score_promedio * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${result.juicio_final === 'PASS'
                                ? 'bg-green-900/50 text-green-300 border border-green-700'
                                : 'bg-red-900/50 text-red-300 border border-red-700'
                            }`}>
                              {result.juicio_final}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm">
                            <div className="flex gap-2">
                              <button
                                className="text-blue-400 hover:text-blue-300 font-medium text-xs"
                                onClick={() => {
                                const detail = `Pregunta: ${result.pregunta}

Respuesta Esperada: ${result.respuesta_esperada}

Respuesta Obtenida: ${result.respuesta_obtenida}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EVALUACIÓN (5 Criterios):

C1 - CORRECTITUD: ${(result.c1_correctness_score * 100).toFixed(1)}%
${result.c1_correctness_comment}

C2 - COBERTURA: ${(result.c2_coverage_score * 100).toFixed(1)}%
${result.c2_coverage_comment}

C3 - RELEVANCIA: ${(result.c3_relevance_score * 100).toFixed(1)}%
${result.c3_relevance_comment}

C4 - FACTUALIDAD: ${(result.c4_faithfulness_score * 100).toFixed(1)}%
${result.c4_faithfulness_comment}

C5 - CLARIDAD: ${(result.c5_clarity_score * 100).toFixed(1)}%
${result.c5_clarity_comment}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Promedio: ${(result.score_promedio * 100).toFixed(1)}%
Juicio Final: ${result.juicio_final}

${result.comentario_final}`
                                alert(detail)
                              }}
                            >
                              📄 Ver más
                            </button>
                            <button
                              className="px-3 py-1 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 rounded-md font-medium text-xs transition"
                              onClick={() => reEvaluateCase(result.id)}
                              disabled={isEvaluating}
                            >
                              🔄 Re-evaluar
                            </button>
                          </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Placeholder cuando no hay resultados */}
          {results.length === 0 && !isEvaluating && (
            <div className="text-center py-12 text-gray-500 bg-gray-700/20 rounded-lg border border-dashed border-gray-600">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <p className="text-lg">Los resultados aparecerán aquí</p>
              <p className="text-sm mt-1">Ejecuta la evaluación para ver los resultados</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default App