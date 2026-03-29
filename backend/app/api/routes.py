from fastapi import APIRouter

from .projects import router as projects_router
from .meetings import router as meetings_router
from .upload import router as upload_router
from .chat import router as chat_router

router = APIRouter()

router.include_router(projects_router, prefix="/projects", tags=["Projects"])
router.include_router(meetings_router, prefix="/meetings", tags=["Meetings"])
router.include_router(upload_router, prefix="/upload", tags=["Upload"])
router.include_router(chat_router, prefix="/chat", tags=["Chat"])
