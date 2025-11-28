# -*- coding: utf-8 -*-

# ==================================================================================================
# MÓDULO DE MODELOS (MODELS)
# ==================================================================================================
# Define los modelos de datos usando Pydantic para validación y serialización.
# ==================================================================================================

from pydantic import BaseModel, Field
from typing import List


class EvaluationRequest(BaseModel):
    """
    Modelo para la solicitud de evaluación RAG.
    Contiene la consulta del usuario, el contexto recuperado y la respuesta generada.
    """
    query: str = Field(..., description="La consulta o pregunta del usuario")
    context: str = Field(..., description="El contexto recuperado del sistema RAG")
    response: str = Field(..., description="La respuesta generada por el sistema RAG")


class EvaluationResult(BaseModel):
    """
    Modelo para el resultado de evaluación de una métrica individual.
    """
    metric: str = Field(..., description="Nombre de la métrica evaluada")
    score: float = Field(..., ge=0.0, le=1.0, description="Puntuación de 0.0 a 1.0")
    explanation: str = Field(..., description="Explicación de la puntuación")


class EvaluationResponse(BaseModel):
    """
    Modelo para la respuesta completa de evaluación.
    Incluye los datos de entrada y los resultados de todas las métricas.
    """
    query: str = Field(..., description="La consulta original")
    context: str = Field(..., description="El contexto usado")
    response: str = Field(..., description="La respuesta evaluada")
    results: List[EvaluationResult] = Field(..., description="Lista de resultados por métrica")
