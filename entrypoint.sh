#!/bin/bash
set -e

# ENV PATH is baked into each service image (set per stage in Dockerfile.backend),
# so python/uvicorn/celery all resolve from the correct conda environment.
# No `conda run` needed — the env should already be on PATH.

COMMAND=$1

if [ "$COMMAND" = "gateway" ]; then
    echo "Starting Gateway..."
    RELOAD_FLAG=""
    if [ "${LOG_LEVEL}" = "DEBUG" ]; then
        RELOAD_FLAG="--reload"
        echo "Hot reload enabled (LOG_LEVEL=DEBUG)"
    fi
    exec python -m uvicorn gateway.main:app --host 0.0.0.0 --port 8000 $RELOAD_FLAG

elif [ "$COMMAND" = "worker-qc" ]; then
    CONCURRENCY=${CELERY_CONCURRENCY:-2}
    echo "Starting QC Celery Worker (concurrency=$CONCURRENCY)..."
    exec celery -A services.qc.tasks worker \
        --hostname=worker-qc@%h \
        --queues=qc \
        --concurrency=$CONCURRENCY \
        --loglevel=info

elif [ "$COMMAND" = "worker-gpu" ]; then
    # Legacy: GPU worker for all GPU tasks (deprecated, use worker-gpu-short/long)
    CONCURRENCY=${CELERY_CONCURRENCY:-2}
    QUEUES=${CELERY_QUEUES:-gpu-short,gpu-long}
    echo "Starting GPU Celery Worker (concurrency=$CONCURRENCY, queues=$QUEUES)..."
    exec celery -A lib.tasks.gpu_tasks worker \
        --hostname=worker-gpu@%h \
        --queues=$QUEUES \
        --concurrency=$CONCURRENCY \
        --loglevel=info

elif [ "$COMMAND" = "worker-gpu-short" ]; then
    CONCURRENCY=${CELERY_CONCURRENCY:-2}
    echo "Starting GPU Short Worker (concurrency=$CONCURRENCY, queue=gpu-short)..."
    exec celery -A lib.tasks.gpu_tasks worker \
        --hostname=worker-gpu-short@%h \
        --queues=gpu-short \
        --concurrency=$CONCURRENCY \
        --loglevel=info

elif [ "$COMMAND" = "worker-gpu-long" ]; then
    CONCURRENCY=${CELERY_CONCURRENCY:-1}
    echo "Starting GPU Long Worker (concurrency=$CONCURRENCY, queue=gpu-long)..."
    exec celery -A lib.tasks.gpu_tasks worker \
        --hostname=worker-gpu-long@%h \
        --queues=gpu-long \
        --concurrency=$CONCURRENCY \
        --loglevel=info

elif [ "$COMMAND" = "worker-cpu" ]; then
    CONCURRENCY=${CELERY_CONCURRENCY:-4}
    echo "Starting CPU Celery Worker (concurrency=$CONCURRENCY)..."
    exec celery -A lib.tasks.cpu_tasks worker \
        --hostname=worker-cpu@%h \
        --queues=cpu \
        --concurrency=$CONCURRENCY \
        --loglevel=info

else
    # Services: ./entrypoint.sh <service_name> <port>
    SERVICE_NAME=$1
    PORT=$2

    echo "Starting $SERVICE_NAME on port $PORT"

    RELOAD_FLAG=""
    if [ "${LOG_LEVEL}" = "DEBUG" ]; then
        RELOAD_FLAG="--reload"
        echo "Hot reload enabled (LOG_LEVEL=DEBUG)"
    fi

    if [ "$SERVICE_NAME" = "md" ]; then
        exec python -m uvicorn services."$SERVICE_NAME".main:app \
            --host 0.0.0.0 --port "$PORT" \
            --log-level info --access-log --no-use-colors \
            $RELOAD_FLAG
    else
        exec python -m uvicorn services."$SERVICE_NAME".main:app \
            --host 0.0.0.0 --port "$PORT" \
            $RELOAD_FLAG
    fi
fi
