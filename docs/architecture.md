# Slackster Architecture

This document outlines the architecture of the Slackster chatbot system.

## Overview

Slackster is an organizational chatbot that leverages AWS services to provide a powerful LLM-based assistant that can be accessed through Slack and a web interface. The system uses a serverless architecture to ensure scalability and cost-effectiveness.

## Architecture Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │             │     │             │
│  Slack API  │────▶│ API Gateway │────▶│   Lambda    │
│             │     │             │     │  (Slack)    │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│             │     │             │     │              │
│ React Admin │────▶│ API Gateway │────▶│    Lambda    │
│  Console    │     │             │     │    (Chat)    │
│             │     └─────────────┘     └──────┬───────┘
└─────────────┘                                │
      ▲                                        │
      │                                        ▼
┌─────┴─────┐       ┌─────────────┐     ┌──────────────┐
│           │       │             │     │              │
│  Cognito  │       │  OpenSearch │◀───▶│   Bedrock    │
│           │       │             │     │              │
└───────────┘       └─────────────┘     └──────────────┘
                           ▲                    ▲
                           │                    │
                           ▼                    │
                    ┌─────────────┐             │
                    │             │             │
                    │     S3      │─────────────┘
                    │             │
                    └─────────────┘
```

## Components

### Frontend
- **React Admin Console**: A web-based interface for administrators to configure the chatbot, upload documents, and monitor usage.
- **Authentication**: Amazon Cognito provides secure authentication and user management.

### Backend
- **API Gateway**: Provides RESTful API endpoints for both the admin console and Slack integration.
- **Lambda Functions**:
  - **Chat Lambda**: Processes chat requests, interacts with Bedrock for LLM responses, and searches OpenSearch for relevant documents.
  - **Slack Lambda**: Handles Slack events and commands, forwarding requests to the Chat Lambda.
- **Amazon Bedrock**: Provides access to large language models for generating responses.
- **OpenSearch**: Stores and searches vector embeddings of documents for retrieval augmented generation.
- **S3**: Stores the original documents that can be referenced in responses.

### Integration
- **Slack API**: Allows users to interact with the chatbot directly from Slack.

## Data Flow

1. **Document Ingestion**:
   - Documents are uploaded through the admin console
   - Documents are stored in S3
   - Documents are processed to extract text
   - Text is embedded using Bedrock and stored in OpenSearch

2. **Chat Flow**:
   - User sends a message (via Slack or admin console)
   - Message is received by API Gateway and forwarded to appropriate Lambda
   - Chat Lambda converts the query to a vector embedding
   - OpenSearch finds relevant documents based on vector similarity
   - Relevant document content is retrieved from S3 if needed
   - Context and query are sent to Bedrock for LLM processing
   - Response is returned to the user

3. **Authentication Flow**:
   - Admin users authenticate through Cognito
   - JWT tokens are used to secure API calls
   - Slack requests are verified using signing secrets

## Security Considerations

- All data in transit is encrypted using HTTPS
- All data at rest is encrypted (S3, OpenSearch)
- OpenSearch is deployed within a VPC for network isolation
- API Gateway uses Cognito authorizers for admin endpoints
- Slack integration verifies request signatures
- IAM roles follow least privilege principle

## Scalability

- Serverless architecture allows automatic scaling based on demand
- OpenSearch cluster can be scaled horizontally for increased document storage
- S3 provides virtually unlimited document storage capacity