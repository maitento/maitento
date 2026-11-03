# The Python support desk in a container. Build it from the example's folder, so web/ and data/ come along:
#
#   docker build -f python/Dockerfile -t acme-support-desk-python .
#   docker run -p 3000:3000 -v desk-state:/app/state \
#     -e MAITENTO_API_KEY -e MAITENTO_NAMESPACE -e SHOP_API_KEY -e WEBHOOK_SECRET acme-support-desk-python
FROM python:3.12-slim

WORKDIR /app/python
COPY python/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY python/*.py ./
COPY web ../web
COPY data ../data
COPY knowledge ../knowledge
COPY maitento ../maitento

# The tickets and orders are kept in a volume, so they outlive the container.
RUN useradd --create-home desk && mkdir -p /app/state && chown desk /app/state
VOLUME /app/state
ENV PYTHONUNBUFFERED=1 DESK_FILE=/app/state/desk.json

USER desk
EXPOSE 3000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "3000"]
