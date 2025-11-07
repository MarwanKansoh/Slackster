# Slackster Admin Guide

This guide provides instructions for administrators on how to use and manage the Slackster chatbot system.

## Accessing the Admin Console

1. Navigate to your deployed admin console URL
2. Log in using the credentials created during deployment
3. You will be presented with the admin dashboard

## Managing Documents

### Uploading Documents

1. Navigate to the "Documents" tab in the admin console
2. Click "Upload Document"
3. Select the file(s) you want to upload
4. Add metadata (optional):
   - Title
   - Description
   - Tags
   - Access permissions
5. Click "Upload"

The system will automatically process the documents, extract text, generate embeddings, and store them in the vector database.

### Supported Document Types

- PDF
- Word documents (.docx, .doc)
- Text files (.txt)
- Markdown (.md)
- HTML
- PowerPoint (.pptx, .ppt)
- Excel (.xlsx, .xls)

### Managing Document Collections

You can organize documents into collections for better management:

1. Navigate to "Collections" tab
2. Click "Create Collection"
3. Name your collection and add a description
4. Assign documents to the collection

## User Management

### Creating Users

1. Navigate to the "Users" tab
2. Click "Add User"
3. Enter user details:
   - Email address
   - Name
   - Role (Admin, Editor, Viewer)
4. Click "Create User"

An invitation email will be sent to the user with instructions to set their password.

### Managing Roles

- **Admin**: Full access to all features
- **Editor**: Can upload and manage documents, but cannot manage users
- **Viewer**: Can only view analytics and test the chatbot

## Configuring the Chatbot

### LLM Settings

1. Navigate to "Settings" > "LLM Configuration"
2. Select the Bedrock model to use:
   - Claude (recommended for general use)
   - Titan (alternative option)
3. Configure parameters:
   - Temperature (0.0-1.0)
   - Max tokens
   - Top-p sampling
   - Response format

### Slack Integration

1. Navigate to "Settings" > "Slack Integration"
2. Verify that the Slack app is properly connected
3. Configure response settings:
   - Response style (concise, detailed)
   - Include sources (yes/no)
   - Maximum response length

## Monitoring and Analytics

### Usage Statistics

The "Analytics" dashboard provides insights into:

- Total queries processed
- Queries by time period (daily, weekly, monthly)
- Most active users
- Most frequently asked questions
- Average response time

### Error Monitoring

The "Logs" section shows:

- Failed queries
- System errors
- Authentication issues

## Testing the Chatbot

You can test the chatbot directly from the admin console:

1. Navigate to the "Chat" tab
2. Type a message in the chat interface
3. Review the response and sources

This allows you to verify the chatbot's functionality before users interact with it in Slack.

## Best Practices

### Document Preparation

- Break large documents into smaller, topic-focused documents
- Include clear titles and headings
- Use consistent formatting
- Remove sensitive information before uploading

### Query Optimization

- Monitor frequently asked questions and optimize documents accordingly
- Create specific documents for common queries
- Update documents regularly to ensure information is current

### Security

- Rotate admin credentials regularly
- Review access logs periodically
- Implement document access controls for sensitive information
- Ensure all users understand data handling policies