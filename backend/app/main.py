from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import links, categories, reviews, profile

app = FastAPI(title="MyArchive API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://arkive-git-main-hotbaris-projects.vercel.app",
                    "https://arkive.vercel.app",
                    "https://bari-archive.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


app.include_router(links.router, prefix="/api/links", tags=["links"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(reviews.router, prefix="/api/reviews", tags=["reviews"])
app.include_router(profile.router, prefix="/api/profile", tags=["profile"])
