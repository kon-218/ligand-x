#!/bin/bash
# Purge all Celery task queues in development
# This removes any lingering tasks from previous sessions

set -e

echo "Purging development task queues..."

# Wait for RabbitMQ to be ready
echo "Waiting for RabbitMQ..."
docker-compose exec -T rabbitmq rabbitmq-diagnostics -q ping || {
    echo "RabbitMQ is not running. Start with 'make dev' first."
    exit 1
}

# Purge all known queues
QUEUES=("gpu-short" "gpu-long" "cpu" "qc")

for queue in "${QUEUES[@]}"; do
    echo "Purging queue: $queue"
    docker-compose exec -T rabbitmq rabbitmqadmin purge queue name="$queue" || echo "  Queue $queue does not exist (ok)"
done

echo "✓ Queue purge complete!"
echo ""
echo "All queues cleared. Previous tasks will not restart."
