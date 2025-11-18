"""
Worker Lambda for processing essays asynchronously via SQS.
Loads essay from DynamoDB, calls OpenAI for analysis, updates DynamoDB.
"""

import os
import json
import boto3
import logging
from datetime import datetime
from typing import Dict, Any
from decimal import Decimal

# Optional OpenAI import
try:
    from openai import OpenAI

    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    OpenAI = None

# Configure structured logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource("dynamodb")

# Environment variables
ESSAYS_TABLE = os.environ.get("ESSAYS_TABLE")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

# Initialize OpenAI client
openai_client = None
if OPENAI_AVAILABLE and OPENAI_API_KEY:
    try:
        openai_client = OpenAI(api_key=OPENAI_API_KEY)
        logger.info("OpenAI client initialized successfully")
    except Exception as e:
        logger.error(
            "Failed to initialize OpenAI client", extra={"error": str(e)}, exc_info=True
        )
        openai_client = None
elif not OPENAI_AVAILABLE:
    logger.error("OpenAI package not available")
elif not OPENAI_API_KEY:
    logger.error("OPENAI_API_KEY not set")

essays_table = dynamodb.Table(ESSAYS_TABLE) if ESSAYS_TABLE else None


def convert_floats_to_decimal(obj):
    """Recursively convert float values to Decimal for DynamoDB compatibility."""
    if isinstance(obj, dict):
        return {k: convert_floats_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    elif isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, int):
        return obj
    else:
        return obj


def analyze_essay_with_openai(essay_text: str) -> Dict[str, Any]:
    """
    Analyze essay using OpenAI GPT-4.1-mini and return vocabulary analysis.
    """
    if not openai_client:
        raise ValueError("OpenAI client not initialized")

    prompt = f"""Analyze the following student essay and provide vocabulary feedback in JSON format.

Essay:
{essay_text}

Please provide a JSON response with the following structure:
{{
  "correctness_review": "A high-level review (2-3 sentences) of whether words and phrases were used correctly in context.",
  "vocabulary_used": ["list", "of", "vocabulary", "words", "and", "phrases", "that", "indicate", "the", "writer's", "current", "level"],
  "recommended_vocabulary": ["list", "of", "new", "vocabulary", "words", "that", "match", "or", "slightly", "exceed", "the", "writer's", "level"]
}}

Focus on:
- Vocabulary words/phrases that demonstrate the student's current level (include 5-10 examples)
- Recommended vocabulary that would help the student grow (5-10 words that are slightly more advanced but appropriate)
- Be specific and educational in your recommendations

Return ONLY valid JSON, no additional text."""

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert English teacher analyzing student essays for vocabulary development. Always respond with valid JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        logger.info("OpenAI response received", extra={"response_length": len(content)})

        # Parse JSON response
        analysis_data = json.loads(content)

        # Validate required fields
        if not all(
            key in analysis_data
            for key in [
                "correctness_review",
                "vocabulary_used",
                "recommended_vocabulary",
            ]
        ):
            raise ValueError("Missing required fields in OpenAI response")

        return analysis_data
    except json.JSONDecodeError as e:
        content_preview = content[:200] if "content" in locals() else "N/A"
        logger.error(
            "Failed to parse OpenAI JSON response",
            extra={"error": str(e), "content": content_preview},
        )
        raise ValueError(f"Invalid JSON response from OpenAI: {str(e)}")
    except Exception as e:
        logger.error("OpenAI API call failed", extra={"error": str(e)}, exc_info=True)
        raise


def process_essay(teacher_id: str, assignment_id: str, student_id: str, essay_id: str):
    """
    Process a single essay: Load → Process → Store

    Args:
        teacher_id: Teacher ID
        assignment_id: Assignment ID
        student_id: Student ID
        essay_id: Essay ID
    """
    logger.info(
        "Processing essay",
        extra={
            "teacher_id": teacher_id,
            "assignment_id": assignment_id,
            "student_id": student_id,
            "essay_id": essay_id,
        },
    )

    if not essays_table:
        raise ValueError("ESSAYS_TABLE not configured")

    # Step 1: Load essay from DynamoDB
    try:
        response = essays_table.get_item(
            Key={"assignment_id": assignment_id, "essay_id": essay_id}
        )

        if "Item" not in response:
            raise ValueError(f"Essay not found: {essay_id}")

        essay_item = response["Item"]
        essay_text = essay_item.get("essay_text")
        status = essay_item.get("status", "pending")

        if not essay_text:
            raise ValueError(f"Essay text not found for essay: {essay_id}")

        if status != "pending":
            logger.warning(
                "Essay already processed",
                extra={"essay_id": essay_id, "status": status},
            )
            return

        logger.info(
            "Essay loaded from DynamoDB",
            extra={
                "essay_id": essay_id,
                "text_length": len(essay_text),
            },
        )
    except Exception as e:
        logger.error(
            "Failed to load essay from DynamoDB",
            extra={
                "essay_id": essay_id,
                "error": str(e),
            },
            exc_info=True,
        )
        raise

    # Step 2: Process with OpenAI
    try:
        vocabulary_analysis = analyze_essay_with_openai(essay_text)
        logger.info(
            "OpenAI analysis complete",
            extra={
                "essay_id": essay_id,
                "vocabulary_used_count": len(
                    vocabulary_analysis.get("vocabulary_used", [])
                ),
                "recommended_count": len(
                    vocabulary_analysis.get("recommended_vocabulary", [])
                ),
            },
        )
    except Exception as e:
        logger.error(
            "Failed to analyze essay with OpenAI",
            extra={
                "essay_id": essay_id,
                "error": str(e),
            },
            exc_info=True,
        )
        raise

    # Step 3: Store results in DynamoDB
    try:
        processed_at = datetime.utcnow().isoformat()

        # Convert floats to Decimal for DynamoDB compatibility
        vocabulary_analysis_decimal = convert_floats_to_decimal(vocabulary_analysis)

        essays_table.update_item(
            Key={"assignment_id": assignment_id, "essay_id": essay_id},
            UpdateExpression="SET #status = :status, vocabulary_analysis = :analysis, processed_at = :processed_at",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":status": "processed",
                ":analysis": vocabulary_analysis_decimal,
                ":processed_at": processed_at,
            },
        )

        logger.info(
            "Essay processing complete",
            extra={
                "essay_id": essay_id,
                "status": "processed",
                "processed_at": processed_at,
            },
        )
    except Exception as e:
        logger.error(
            "Failed to update essay in DynamoDB",
            extra={
                "essay_id": essay_id,
                "error": str(e),
            },
            exc_info=True,
        )
        raise


def handler(event, context):
    """
    SQS event handler for processing essay messages.

    Event structure:
    {
        "Records": [
            {
                "body": "{\"teacher_id\": \"...\", \"assignment_id\": \"...\", \"student_id\": \"...\", \"essay_id\": \"...\"}"
            }
        ]
    }
    """
    logger.info(
        "Worker Lambda invoked",
        extra={
            "record_count": len(event.get("Records", [])),
            "request_id": context.aws_request_id if context else None,
        },
    )

    processed_count = 0
    error_count = 0

    for record in event.get("Records", []):
        essay_id = None
        try:
            # Parse SQS message body
            message_body = json.loads(record["body"])
            teacher_id = message_body["teacher_id"]
            assignment_id = message_body["assignment_id"]
            student_id = message_body.get("student_id") or ""  # Handle empty string
            essay_id = message_body["essay_id"]

            logger.info(
                "Processing SQS message",
                extra={
                    "essay_id": essay_id,
                    "teacher_id": teacher_id,
                    "assignment_id": assignment_id,
                    "student_id": student_id,
                    "message_id": record.get("messageId"),
                },
            )

            # Process essay: Load → Process → Store
            process_essay(teacher_id, assignment_id, student_id, essay_id)

            processed_count += 1

        except Exception as e:
            error_count += 1
            logger.error(
                "Failed to process essay",
                extra={
                    "essay_id": essay_id,
                    "error": str(e),
                    "message_id": record.get("messageId"),
                },
                exc_info=True,
            )
            # Don't raise - let SQS retry mechanism handle failures
            # After maxReceiveCount, message will go to DLQ

    logger.info(
        "Worker Lambda completed",
        extra={
            "processed_count": processed_count,
            "error_count": error_count,
        },
    )

    return {"statusCode": 200, "processed": processed_count, "errors": error_count}
