FROM public.ecr.aws/lambda/python:3.12

# Install spaCy and model
RUN pip install --no-cache-dir spacy && \
    python -m spacy download en_core_web_sm

# Copy function code
COPY lambda_function.py ${LAMBDA_TASK_ROOT}
COPY requirements.txt ${LAMBDA_TASK_ROOT}

# Install additional dependencies
RUN pip install --no-cache-dir -r requirements.txt -t ${LAMBDA_TASK_ROOT}

# Set the CMD to your handler
CMD [ "lambda_function.handler" ]



