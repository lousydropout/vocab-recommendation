#!/bin/bash
# Build spaCy Lambda layer with en_core_web_sm model
# Uses Docker to match Lambda runtime environment (Amazon Linux + Python 3.12)

set -e

LAYER_DIR="layer"
PYTHON_VERSION="3.12"
SITE_PACKAGES="python/lib/python${PYTHON_VERSION}/site-packages"

echo "Building spaCy Lambda layer..."

# Create layer directory structure
mkdir -p "${LAYER_DIR}/${SITE_PACKAGES}"

# Use Docker to install spaCy and model (matching Lambda runtime)
# Use Amazon Linux 2023 with Python 3.12 to match Lambda runtime
docker run --rm \
  -v "$(pwd)/${LAYER_DIR}:/var/layer" \
  -w /var/layer \
  --entrypoint /bin/bash \
  public.ecr.aws/lambda/python:${PYTHON_VERSION} \
  -c "
    /var/lang/bin/pip install --no-cache-dir -t ${SITE_PACKAGES} spacy && \
    PYTHONPATH=${SITE_PACKAGES} /var/lang/bin/python -m spacy download en_core_web_sm --target ${SITE_PACKAGES}
  "

echo "Layer built successfully in ${LAYER_DIR}/"
echo "Layer size: $(du -sh ${LAYER_DIR} | cut -f1)"

