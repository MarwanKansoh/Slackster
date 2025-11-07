# Slackster Deployment Guide

This guide walks through the steps to deploy Slackster to your AWS account.

## Prerequisites

1. AWS CLI installed and configured with administrative credentials
2. Node.js 16+ and npm installed
3. AWS CDK installed globally: `npm install -g aws-cdk`
4. A Slack workspace with permissions to create apps

## Deployment Steps

### 1. Clone and Setup

```bash
git clone <repository-url>
cd slackster
npm install
```

### 2. Bootstrap CDK (if not already done)

```bash
cdk bootstrap aws://ACCOUNT-NUMBER/REGION
```

### 3. Deploy Infrastructure

```bash
npm run deploy
```

This will deploy all AWS resources and output important information like:
- Cognito User Pool ID
- Cognito Client ID
- API Gateway endpoint
- S3 bucket name
- OpenSearch domain endpoint

### 4. Configure Slack Integration

1. Go to [Slack API](https://api.slack.com/apps) and create a new app
2. Under "OAuth & Permissions", add the following scopes:
   - `chat:write`
   - `app_mentions:read`
   - `channels:history`
   - `im:history`
3. Install the app to your workspace
4. Copy the Bot User OAuth Token
5. Under "Event Subscriptions", enable events and set the Request URL to:
   `https://your-api-endpoint.execute-api.us-east-1.amazonaws.com/prod/slack`
6. Subscribe to the following bot events:
   - `message.im`
   - `app_mention`
7. Save changes

### 5. Update Lambda Environment Variables

1. Go to AWS Lambda console
2. Find the `SlacksterStack-SlackFunction` function
3. Add the following environment variables:
   - `SLACK_BOT_TOKEN`: The Bot User OAuth Token from step 4
   - `SLACK_SIGNING_SECRET`: Found in "Basic Information" > "App Credentials"

### 6. Deploy Frontend

1. Create a `.env` file in the `frontend` directory using the `.env.example` template
2. Fill in the values from the CDK deployment outputs
3. Build the frontend:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
4. Deploy the build folder to your preferred hosting service (S3 + CloudFront, Amplify, etc.)

### 7. Create Admin User

1. Go to AWS Cognito console
2. Find the user pool created by the stack
3. Create a new user with admin privileges

## Verification

1. Log in to the admin console using the credentials created in step 7
2. Send a message to your Slack bot
3. Verify that the bot responds with information from your documents

## Troubleshooting

- Check CloudWatch Logs for Lambda function errors
- Verify that all environment variables are set correctly
- Ensure Slack app is properly configured with correct permissions