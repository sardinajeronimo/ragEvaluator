# Módulo core_logic.py
import openai
import os
from dotenv import load_dotenv
import json
import re
from typing import List, Dict, Any
from .models import EvaluationRequest, EvaluationResponse, EvaluationResult

# Load environment variables from .env file
load_dotenv()

client = openai.Client(api_key=os.getenv("OPENAI_API_KEY")) 



def _parse_response_text(content: str, metric_name: str) -> Dict[str, Any]:
    """
    Intenta extraer score y explanation del texto, ya sea en formato JSON o texto plano.
    """
    # Primero, intentar parsear como JSON
    try:
        response_data = json.loads(content)
        if "score" in response_data:
            return {
                "score": float(response_data.get("score", 0.0)),
                "explanation": response_data.get("explanation", "Sin explicación")
            }
    except (json.JSONDecodeError, ValueError):
        pass

    # Si no es JSON válido, intentar extraer score y explanation del texto plano
    score = 0.0
    explanation = content.strip()

    # Buscar patrones como "score: 0.8", "puntuación: 0.8", "Score: 0.8"
    score_patterns = [
        r'(?:score|puntuación|puntuacion|puntaje)[:\s]+([0-9]*\.?[0-9]+)',
        r'([0-9]*\.?[0-9]+)[/\s]*(?:score|puntuación)',
        r'^([0-9]*\.?[0-9]+)\s*[,\.]?\s*'  # Número al inicio
    ]

    for pattern in score_patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            try:
                score = float(match.group(1))
                # Normalizar si está fuera del rango 0-1
                if score > 1.0:
                    score = score / 10.0 if score <= 10.0 else 1.0
                break
            except ValueError:
                continue

    # Buscar explicación después de "explanation:", "explicación:", etc.
    explanation_patterns = [
        r'(?:explanation|explicación|explicacion|razón|razon)[:\s]+(.+?)(?:\n|$)',
        r'(?:porque|because)[:\s]+(.+?)(?:\n|$)'
    ]

    for pattern in explanation_patterns:
        match = re.search(pattern, content, re.IGNORECASE | re.DOTALL)
        if match:
            explanation = match.group(1).strip()
            break

    return {
        "score": score,
        "explanation": explanation
    }


def _evaluate_metric_with_openai(
    metric_name: str,
    prompt_template: str,
    data: Dict[str, str]
) -> EvaluationResult:
    """
    Función central para ejecutar una evaluación de métrica utilizando un LLM.
    El LLM debe devolver la puntuación (0.0 a 1.0) y una explicación.
    Maneja respuestas tanto en formato JSON como en texto plano.
    """
    # Rellenar el template del prompt con los datos específicos
    # Agregar instrucciones para formato JSON preferido pero no obligatorio
    filled_prompt = prompt_template.format(**data)
    filled_prompt += "\n\nPor favor, devuelve tu respuesta en formato JSON con 'score' y 'explanation'. Ejemplo: {\"score\": 0.85, \"explanation\": \"La respuesta es relevante porque...\"}"

    try:
        # Utilizamos un modelo avanzado como gpt-4 para mejor capacidad de juicio
        completion = client.chat.completions.create(
            model="gpt-4o-mini", # Opción más rápida y económica para evaluación, o gpt-4-turbo para mayor calidad
            messages=[{"role": "user", "content": filled_prompt}],
            temperature=0.0 # Temperatura baja para juicios deterministas
        )

        # Obtener el contenido de la respuesta
        response_content = completion.choices[0].message.content

        # Intentar parsear la respuesta (JSON o texto plano)
        parsed_data = _parse_response_text(response_content, metric_name)

        return EvaluationResult(
            metric=metric_name,
            score=parsed_data.get("score", 0.0),
            explanation=parsed_data.get("explanation", "Explicación no disponible.")
        )
    except Exception as e:
        # Manejo de errores en la API
        print(f"Error evaluating {metric_name} with OpenAI: {e}")
        return EvaluationResult(
            metric=metric_name,
            score=0.0,
            explanation=f"Fallo en la llamada a OpenAI: {e}"
        )


def evaluate_rag(request: EvaluationRequest) -> EvaluationResponse:
    """
    Evalúa la calidad de una respuesta RAG (generada a partir de un contexto) 
    utilizando un LLM de OpenAI como juez para varias métricas.
    """
    print(f"Starting RAG evaluation for query: {request.query}")

    # Los datos de entrada ya están en el objeto request, listos para ser evaluados
    evaluation_data = {
        "query": request.query,
        "context": request.context,
        "response": request.response,
    }

    
    metrics_to_evaluate: List[Dict[str, str]] = [
       
        {
            "name": "Answer Relevancy",
            "prompt": (
                "Eres un juez de calidad de RAG. Evalúa la **relevancia** de la 'Respuesta' a la 'Consulta'. "
                "Puntúa 1.0 si la respuesta aborda de forma completa y directa la consulta. "
                "Si la respuesta es vaga o se desvía, puntúa más bajo. "
                "Devuelve una puntuación (0.0 a 1.0) y una explicación. \n\n"
                "Consulta: {query}\nRespuesta: {response}"
            )
        },
        # 2. Faithfulness (Fidelidad de la Respuesta al Contexto)
        {
            "name": "Faithfulness",
            "prompt": (
                "Eres un juez de calidad de RAG. Evalúa la **fidelidad** de la 'Respuesta' al 'Contexto'. "
                "Puntúa 1.0 solo si CADA afirmación hecha en la respuesta está explícita y directamente **respaldada** "
                "por el contexto. Si hay alucinaciones (información no en el contexto), puntúa 0.0 o cerca de 0.0. "
                "Devuelve una puntuación (0.0 a 1.0) y una explicación. \n\n"
                "Consulta: {query}\nContexto: {context}\nRespuesta: {response}"
            )
        },
        # 3. Context Precision (Precisión del Contexto a la Consulta)
        {
            "name": "Context Precision",
            "prompt": (
                "Eres un juez de calidad de RAG. Evalúa la **precisión** del 'Contexto' con respecto a la 'Consulta'. "
                "Puntúa 1.0 si todos los enunciados en el contexto son **estrictamente necesarios y relevantes** para responder la consulta. "
                "Si el contexto contiene información irrelevante o 'ruido' (que no se usa en la respuesta), puntúa más bajo. "
                "Devuelve una puntuación (0.0 a 1.0) y una explicación. \n\n"
                "Consulta: {query}\nContexto: {context}"
            )
        },
        # 4. Context Recall (Exhaustividad del Contexto para la Respuesta)
        {
            "name": "Context Recall",
            "prompt": (
                "Eres un juez de calidad de RAG. Evalúa el **recall** del 'Contexto'. Asume que la 'Respuesta' es la respuesta ideal. "
                "¿El contexto proporcionó **toda** la información crítica necesaria para formular la 'Respuesta'? "
                "Puntúa 1.0 si el contexto cubre exhaustivamente todos los puntos clave de la respuesta. "
                "Si falta información esencial en el contexto, puntúa más bajo. "
                "Devuelve una puntuación (0.0 a 1.0) y una explicación. \n\n"
                "Consulta: {query}\nContexto: {context}\nRespuesta: {response}"
            )
        }
    ]

    results: List[EvaluationResult] = []
    # Ejecutar la evaluación para cada métrica
    for metric in metrics_to_evaluate:
        result = _evaluate_metric_with_openai(
            metric_name=metric["name"],
            prompt_template=metric["prompt"],
            data=evaluation_data
        )
        results.append(result)

    # Construir y Devolver la Respuesta Final
    response = EvaluationResponse(
        query=request.query,
        context=request.context,
        response=request.response,
        results=results
    )

    print("✅ Evaluación completada.")
    return response