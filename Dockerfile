FROM node:22-bookworm-slim AS node
FROM ollama/ollama:latest
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
ENV OLLAMA_HOST=127.0.0.1:11434 \
    OLLAMA_MODELS=/models \
    OLLAMA_NUM_PARALLEL=1 \
    OLLAMA_MAX_LOADED_MODELS=1 \
    OLLAMA_MAX_QUEUE=1 \
    OLLAMA_CONTEXT_LENGTH=512 \
    OLLAMA_VULKAN=0 \
    MODEL=smollm2:135m-instruct-q4_K_M \
    PORT=10000
COPY download-model.sh start.sh ./
RUN bash /app/download-model.sh
COPY server.js package.json openapi.json swagger.html ./
EXPOSE 10000
ENTRYPOINT ["/bin/bash", "/app/start.sh"]
