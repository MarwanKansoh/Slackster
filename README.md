# Slackster - Organizational LLM Chatbot

A secure, enterprise-grade chatbot solution that integrates with Slack to provide AI-powered assistance using your organization's documents. Built on AWS serverless architecture with Amazon Bedrock for LLM capabilities and vector search for intelligent document retrieval.

## What This Repository Does

Slackster transforms your organization's documents into an intelligent, conversational AI assistant accessible through Slack. Users can ask questions in natural language and receive contextual answers based on your uploaded documents, with source attribution for transparency.

**Key Features:**
- **AI-Powered Chat**: Uses Amazon Bedrock (Claude/Titan) for natural language understanding
- **Document Intelligence**: Automatically processes and indexes documents for semantic search
- **Vector Search**: Finds relevant information using Amazon OpenSearch with embeddings
- **Slack Integration**: Native Slack bot with real-time responses
- **Enterprise Security**: CSRF/XSS protection, input sanitization, and secure authentication
- **Admin Console**: Web-based interface for document management and configuration
- **Serverless**: Fully managed AWS infrastructure with automatic scaling

## Architecture

- **Frontend**: React-based admin console and chat interface
- **Backend**: Serverless architecture with AWS Lambda
- **Authentication**: Amazon Cognito for SSO
- **LLM Integration**: Amazon Bedrock
- **Vector Storage**: Amazon OpenSearch
- **Document Storage**: Amazon S3
- **API Layer**: Amazon API Gateway
- **Slack Integration**: API-based integration

## Project Structure

```
slackster/
├── frontend/                # React-based admin console and chat UI
│   ├── src/                 # React components with XSS protection
│   └── public/              # Static assets with CSP headers
├── backend/                 # AWS Lambda functions
│   ├── llm/                 # LLM integration and document processing
│   ├── slack/               # Slack bot integration
│   └── utils/               # Security utilities and helpers
├── infrastructure/          # AWS CDK for infrastructure as code
└── docs/                    # Documentation
```

## Security Features

- **CSRF Protection**: Request validation and secure CORS policies
- **XSS Prevention**: Input sanitization and output encoding
- **Content Security Policy**: Strict CSP headers to prevent code injection
- **Authentication**: Amazon Cognito integration with JWT tokens
- **Input Validation**: Comprehensive sanitization of all user inputs
- **Secure Headers**: X-Frame-Options, X-Content-Type-Options, and more

## Step-by-Step Deployment Guide

### Step 1: Set up your environment

```bash
# Install Node.js and npm if not already installed
# For macOS:
brew install node

# Install AWS CDK globally
npm install -g aws-cdk
```

### Step 2: Configure AWS credentials

```bash
# Configure AWS CLI with administrative credentials
aws configure
# Enter your AWS Access Key ID, Secret Access Key, region (e.g., us-east-1), and output format
```

### Step 3: Install dependencies

```bash
# Navigate to project root
cd /Users/marwan.kansoh/Desktop/Dev/Slackster

# Install main project dependencies
npm install

# Install backend dependencies
cd backend/llm && npm install
cd ../slack && npm install
cd ../../

# Install frontend dependencies
cd frontend && npm install
cd ..
```

### Step 4: Bootstrap AWS CDK (if not already done)

```bash
# This prepares your AWS account to work with CDK
cdk bootstrap
```

### Step 5: Deploy infrastructure

```bash
# Deploy all AWS resources
cdk deploy
```

After deployment completes, note the outputs:
- UserPoolId
- UserPoolClientId
- ApiEndpoint
- DocumentBucketName
- OpenSearchDomainEndpoint

### Step 6: Configure Slack integration

1. Go to [Slack API](https://api.slack.com/apps) and create a new app
2. Under "OAuth & Permissions", add these scopes:
   - `chat:write`
   - `app_mentions:read`
   - `channels:history`
   - `im:history`
3. Install the app to your workspace
4. Copy the Bot User OAuth Token
5. Under "Event Subscriptions", enable events and set the Request URL to your API endpoint:
   ```
   https://[your-api-endpoint].execute-api.us-east-1.amazonaws.com/prod/slack
   ```
6. Subscribe to bot events: `message.im` and `app_mention`

### Step 7: Update Lambda environment variables

```bash
# Update the Slack Lambda with your Slack credentials
aws lambda update-function-configuration \
  --function-name SlacksterStack-SlackFunction \
  --environment "Variables={SLACK_BOT_TOKEN=xoxb-your-token,SLACK_SIGNING_SECRET=your-signing-secret}"
```

### Step 8: Configure and deploy frontend

```bash
# Create .env file for frontend
cd frontend
cp .env.example .env

# Edit .env with your values from CDK output
# REACT_APP_AWS_REGION=us-east-1
# REACT_APP_COGNITO_USER_POOL_ID=your-user-pool-id
# REACT_APP_COGNITO_CLIENT_ID=your-client-id
# REACT_APP_API_ENDPOINT=https://your-api-endpoint.execute-api.us-east-1.amazonaws.com/prod

# Build frontend
npm run build
```

### Step 9: Create admin user

```bash
# Create a user in Cognito
aws cognito-idp admin-create-user \
  --user-pool-id [your-user-pool-id] \
  --username admin@example.com \
  --temporary-password 'Temp123!' \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true
```

### Step 10: Deploy frontend to S3 (optional)

```bash
# Create S3 bucket for hosting
aws s3 mb s3://slackster-frontend

# Upload frontend build
aws s3 sync frontend/build s3://slackster-frontend --acl public-read

# Configure bucket for static website hosting
aws s3 website s3://slackster-frontend --index-document index.html

# Output the website URL
echo "Website URL: http://slackster-frontend.s3-website-[your-region].amazonaws.com"
```

### Step 11: Test the chatbot

1. Log in to the admin console using the credentials created in step 9
2. Upload some test documents through the admin interface
3. Send a message to your Slack bot
4. Verify that the bot responds with information from your documents

## Troubleshooting

If you encounter issues:

```bash
# Check Lambda logs
aws logs filter-log-events --log-group-name /aws/lambda/SlacksterStack-ChatFunction

# Verify OpenSearch domain status
aws opensearch describe-domain --domain-name [your-domain-name]

# Test API endpoint
curl -X POST https://[your-api-endpoint].execute-api.us-east-1.amazonaws.com/prod/chat \
  -H "Authorization: Bearer [cognito-id-token]" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello, how can you help me?"}'
```

## Environment Variables

Create a `.env` file with the following variables:

```
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=your-user-pool-id
COGNITO_CLIENT_ID=your-client-id
BEDROCK_MODEL_ID=anthropic.claude-v2
OPENSEARCH_ENDPOINT=your-opensearch-endpoint
S3_BUCKET_NAME=your-document-bucket
SLACK_BOT_TOKEN=your-slack-bot-token
SLACK_SIGNING_SECRET=your-slack-signing-secret
ALLOWED_ORIGINS=https://yourdomain.com,https://localhost:3000
```

## Recent Updates

- **Security Hardening**: Fixed CSRF and XSS vulnerabilities
- **Input Sanitization**: Added comprehensive input validation
- **Security Headers**: Implemented CSP and security headers
- **CORS Protection**: Proper origin validation and secure CORS policies

## Additional Documentation

For more detailed information, see the documentation in the `docs/` directory:
- Architecture overview
- Deployment guide
- Administrator guide