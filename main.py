import os
import sys

from dotenv import load_dotenv

load_dotenv(
    verbose=True,
    override=True,
)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
HOST = os.getenv("HOST")
PORT = os.getenv("PORT")

if __name__ == '__main__':
    import uvicorn

    uvicorn.run(
        "src.app:app",
        host="127.0.0.1",
        port=int(PORT) if PORT is not None and PORT != "" else 8080,
        reload=True,
        access_log=True,
    )
