# -*- coding: utf-8 -*-

# ==================================================================================================
# MÓDULO PRINCIPAL (MAIN)
# ==================================================================================================
# Este archivo es el punto de entrada de la aplicación de backend.
# Define los endpoints de la API usando el framework FastAPI.
# Su responsabilidad es recibir las peticiones HTTP, validarlas y delegar la lógica
# de negocio a otros módulos (como `evaluator.py`).
# ==================================================================================================

# --------------------------------------------------------------------------------------------------
# QUÉ HACER AQUÍ:
# 1.  Añadir un endpoint para obtener el historial de evaluaciones (opcional, pero recomendado).
# 2.  Mejorar el manejo de errores para que la API sea más robusta.
# 3.  Configurar CORS para permitir que el frontend (que se ejecuta en un dominio diferente)
#     pueda comunicarse con esta API.
#
# CÓMO HACERLO:
# -   Para el historial, puedes guardar los resultados en una base de datos simple (como SQLite) o en un archivo.
# -   Para el manejo de errores, puedes usar un bloque `try...except` en el endpoint `/evaluate`
#     para capturar posibles excepciones y devolver un error HTTP adecuado (ej. 422, 500).
# -   Para CORS, importa `CORSMiddleware` de `fastapi.middleware.cors` y añádelo a la app.
# --------------------------------------------------------------------------------------------------

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models import EvaluationRequest, EvaluationResponse
from .evaluator import evaluate_rag

# Creación de la instancia de la aplicación FastAPI
app = FastAPI(
    title="RAG Evaluator API",
    description="API para evaluar sistemas de Generación Aumentada por Recuperación (RAG).",
    version="0.1.0",
)

# --- Configuración de CORS ---
# Permite peticiones desde el frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite todos los orígenes en desarrollo
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():    
    
    """
    Endpoint raíz para verificar que la API está en funcionamiento.
    Útil para hacer una comprobación rápida de salud del servicio.
    """
    return {"message": "Bienvenido a la API del Evaluador RAG"}


@app.post("/evaluate", response_model=EvaluationResponse)
def evaluate(request: EvaluationRequest) -> EvaluationResponse:
    """
    Este endpoint recibe una solicitud para evaluar un sistema RAG.

    Delega la lógica de evaluación a la función `evaluate_rag` del módulo `evaluator`.
    """
    # --- Manejo de Errores ---
    # QUÉ HACER: Envuelve la llamada a `evaluate_rag` en un bloque try/except.
    # CÓMO: Si ocurre un error durante la evaluación (ej. una API externa falla),
    # puedes capturar la excepción y devolver un `HTTPException` con un código de estado
    # y un mensaje claro. Esto evita que el servidor se caiga y da una respuesta útil al cliente.
    # ---------------------------
    try:
        print(f"Recibida solicitud de evaluación: {request}")
        evaluation_result = evaluate_rag(request)
        return evaluation_result
    except Exception as e:
        if(isinstance(e, HTTPException)):
            raise e  # Re-lanza excepciones HTTP para que FastAPI las maneje adecuadamente. 
        # QUÉ HACER: Registra el error para depuración.
        # CÓMO: Usa el módulo `logging` de Python para un registro más estructurado.
        print(f"Ha ocurrido un error durante la evaluación: {e}")
        
        # Devuelve una respuesta de error HTTP 500 (Error Interno del Servidor)
        raise HTTPException(
            status_code=500,
            detail="Ocurrió un error inesperado al procesar la evaluación."
        )


# Para ejecutar la aplicación, usa el siguiente comando en tu terminal:
# uvicorn main:app --reload --app-dir backend