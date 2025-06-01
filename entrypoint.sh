#!/bin/bash
set -e

# Always use conda for runtime execution as it is more stable than mamba run
# Mamba is used for environment creation in the Dockerfile
RUNNER="conda"

# The first argument determines the mode
COMMAND=$1

if [ "$COMMAND" = "gateway" ]; then
    echo "Starting Gateway..."
    # Add --reload flag in development mode (when NODE_ENV != production)
    RELOAD_FLAG=""
    if [ "${NODE_ENV}" != "production" ]; then
        RELOAD_FLAG="--reload"
    fi
    exec $RUNNER run --no-capture-output -n biochem-base python -m uvicorn gateway.main:app --host 0.0.0.0 --port 8000 $RELOAD_FLAG

elif [ "$COMMAND" = "worker-qc" ]; then
    # QC Celery worker - load QC service tasks
    CONCURRENCY=${CELERY_CONCURRENCY:-2}
    echo "Starting QC Celery Worker (concurrency=$CONCURRENCY)..."
    exec $RUNNER run --no-capture-output -n biochem-qc celery -A services.qc.tasks worker \
        --hostname=worker-qc@%h \
        --queues=qc \
        --concurrency=$CONCURRENCY \
        --loglevel=info

elif [ "$COMMAND" = "worker-gpu" ]; then
    # Legacy: GPU worker for all GPU tasks (deprecated, use worker-gpu-short/long)
    CONCURRENCY=${CELERY_CONCURRENCY:-2}
    QUEUES=${CELERY_QUEUES:-gpu-short,gpu-long}
    echo "Starting GPU Celery Worker (concurrency=$CONCURRENCY, queues=$QUEUES)..."
    exec $RUNNER run --no-capture-output -n biochem-md celery -A lib.tasks.gpu_tasks worker \
        --hostname=worker-gpu@%h \
        --queues=$QUEUES \
        --concurrency=$CONCURRENCY \
        --loglevel=info

elif [ "$COMMAND" = "worker-gpu-short" ]; then
    # GPU worker for short/fast tasks (MD, Boltz2, ADMET)
    # These can run concurrently as they complete quickly
    CONCURRENCY=${CELERY_CONCURRENCY:-2}
    echo "Starting GPU Short Worker (concurrency=$CONCURRENCY, queue=gpu-short)..."
    exec $RUNNER run --no-capture-output -n biochem-md celery -A lib.tasks.gpu_tasks worker \
        --hostname=worker-gpu-short@%h \
        --queues=gpu-short \
        --concurrency=$CONCURRENCY \
        --loglevel=info

elif [ "$COMMAND" = "worker-gpu-long" ]; then
    # GPU worker for long-running tasks (ABFE, RBFE)
    # concurrency=1 ensures only one long task runs at a time to avoid GPU contention
    CONCURRENCY=${CELERY_CONCURRENCY:-1}
    echo "Starting GPU Long Worker (concurrency=$CONCURRENCY, queue=gpu-long)..."
    exec $RUNNER run --no-capture-output -n biochem-md celery -A lib.tasks.gpu_tasks worker \
        --hostname=worker-gpu-long@%h \
        --queues=gpu-long \
        --concurrency=$CONCURRENCY \
        --loglevel=info

elif [ "$COMMAND" = "worker-cpu" ]; then
    # CPU worker for docking batch tasks
    CONCURRENCY=${CELERY_CONCURRENCY:-4}
    echo "Starting CPU Celery Worker (concurrency=$CONCURRENCY)..."
    exec $RUNNER run --no-capture-output -n biochem-docking celery -A lib.tasks.cpu_tasks worker \
        --hostname=worker-cpu@%h \
        --queues=cpu \
        --concurrency=$CONCURRENCY \
        --loglevel=info

else
    # For other services, we map service name to environment
    # Usage: ./entrypoint.sh <service_name> <port>
    SERVICE_NAME=$1
    PORT=$2
    
    # Default to base environment
    ENV_NAME="biochem-base"

    case $SERVICE_NAME in
        "structure"|"alignment"|"ketcher"|"msa")
            ENV_NAME="biochem-base"
            ;;
        "docking")
            ENV_NAME="biochem-docking"
            ;;
        "md")
            ENV_NAME="biochem-md"
            ;;
        "admet")
            ENV_NAME="biochem-admet"
            ;;
        "boltz2")
            ENV_NAME="biochem-boltz2"
            ;;
        "qc")
            ENV_NAME="biochem-qc"
            ;;
        "abfe")
            # ABFE uses the MD environment which includes OpenFE packages
            ENV_NAME="biochem-md"
            ;;
        "rbfe")
            # RBFE uses the MD environment which includes OpenFE packages
            ENV_NAME="biochem-md"
            ;;
        *)
            echo "Warning: Unknown service '$SERVICE_NAME'. Defaulting to 'biochem-base'."
            ENV_NAME="biochem-base"
            ;;
    esac

    echo "Starting $SERVICE_NAME on port $PORT using environment $ENV_NAME"

    # Add --reload flag in development mode (when LOG_LEVEL=DEBUG)
    RELOAD_FLAG=""
    if [ "${LOG_LEVEL}" = "DEBUG" ]; then
        RELOAD_FLAG="--reload"
        echo "Hot reload enabled (LOG_LEVEL=DEBUG)"
    fi

    # Add verbose logging flags for MD service
    if [ "$SERVICE_NAME" = "md" ]; then
        exec $RUNNER run --no-capture-output -n "$ENV_NAME" python -m uvicorn services."$SERVICE_NAME".main:app --host 0.0.0.0 --port "$PORT" --log-level info --access-log --no-use-colors $RELOAD_FLAG
    else
        exec $RUNNER run --no-capture-output -n "$ENV_NAME" python -m uvicorn services."$SERVICE_NAME".main:app --host 0.0.0.0 --port "$PORT" $RELOAD_FLAG
    fi
fi