FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV OPF_DEVICE=cpu
ENV PORT=8080

WORKDIR /app

COPY requirements.txt ./requirements.txt
COPY privacy-filter ./privacy-filter

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir ./privacy-filter

COPY main.py ./main.py
COPY src ./src

EXPOSE 8080

CMD ["uvicorn", "src.app:app", "--host", "0.0.0.0", "--port", "8080"]
