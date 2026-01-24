# -*- coding: utf-8 -*-
"""
HeartSound Raspberry Pi FastAPI Application
心音智鉴树莓派后端主入口
"""
import time
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from api.device import router as device_router

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("heartsound")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info(f"🚀 HeartSound API starting on {settings.HOST}:{settings.PORT}")
    logger.info(f"📱 Device ID: {settings.DEVICE_ID}")
    yield
    # Shutdown
    logger.info("👋 HeartSound API shutting down")


# Create FastAPI application
app = FastAPI(
    title="HeartSound API",
    description="心音智鉴树莓派边缘设备API - 提供心音采集和AI分析服务",
    version=settings.FIRMWARE_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)


# ============================================================================
# Middleware Configuration
# ============================================================================

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request Logging Middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests"""
    start_time = time.time()

    response = await call_next(request)

    process_time = (time.time() - start_time) * 1000
    logger.info(
        f"{request.method} {request.url.path} - "
        f"Status: {response.status_code} - "
        f"Time: {process_time:.2f}ms"
    )

    return response


# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle all unhandled exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "message": "服务器内部错误，请稍后重试"
        }
    )


# ============================================================================
# Router Registration
# ============================================================================

# Device API
app.include_router(device_router)

# Detection API (to be added in IMPL-003)
# app.include_router(detection_router)

# WebSocket (to be added in IMPL-003)
# app.include_router(websocket_router)


# ============================================================================
# Root Endpoints
# ============================================================================

@app.get("/", tags=["Root"])
async def root():
    """Root endpoint - API information"""
    return {
        "name": "HeartSound API",
        "version": settings.FIRMWARE_VERSION,
        "device_id": settings.DEVICE_ID,
        "docs": "/docs"
    }


@app.get("/health", tags=["Root"])
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


# ============================================================================
# Run with uvicorn
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
