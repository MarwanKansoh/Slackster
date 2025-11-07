const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const crypto = require('crypto');

// Initialize Lambda client
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

// Verify Slack request signature
const verifySlackRequest = (event) => {
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
  if (!slackSigningSecret) {
    console.warn('Slack signing secret not configured');
    return false;
  }
  
  const requestBody = event.body;
  const timestamp = event.headers['x-slack-request-timestamp'];
  const slackSignature = event.headers['x-slack-signature'];
  
  // Check if the request is older than 5 minutes
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - timestamp) > 300) {
    return false;
  }
  
  const sigBaseString = `v0:${timestamp}:${requestBody}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', slackSigningSecret)
    .update(sigBaseString)
    .digest('hex');
    
  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(slackSignature)
  );
};

// Process Slack events
const processSlackEvent = async (body) => {
  // Handle URL verification challenge
  if (body.type === 'url_verification') {
    return {
      statusCode: 200,
      body: body.challenge
    };
  }
  
  // Handle message events
  if (body.event && body.event.type === 'message' && !body.event.bot_id) {
    const message = validateInput(body.event.text);
    const userId = validateInput(body.event.user);
    const channelId = validateInput(body.event.channel);
    
    // Process message with chat Lambda
    const response = await processWithChatLambda(message);
    
    // Send response back to Slack
    await sendSlackMessage(channelId, response);
    
    return {
      statusCode: 200,
      body: ''
    };
  }
  
  // Handle slash commands
  if (body.command === '/slackster') {
    const message = validateInput(body.text);
    
    // Process message with chat Lambda
    const response = await processWithChatLambda(message);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        response_type: 'in_channel',
        text: response
      })
    };
  }
  
  return {
    statusCode: 200,
    body: ''
  };
};

// Process message with chat Lambda
const processWithChatLambda = async (message) => {
  try {
    const chatFunctionName = process.env.CHAT_FUNCTION_NAME;
    if (!chatFunctionName) {
      throw new Error('Chat function name not configured');
    }
    
    const params = {
      FunctionName: chatFunctionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        body: JSON.stringify({ prompt: message })
      })
    };
    
    const command = new InvokeCommand(params);
    const response = await lambdaClient.send(command);
    
    const payload = JSON.parse(Buffer.from(response.Payload).toString());
    const body = JSON.parse(payload.body);
    
    return body.response;
  } catch (error) {
    console.error('Error processing with chat Lambda:', error);
    return 'I encountered an error while processing your request.';
  }
};

// Send message to Slack
const sendSlackMessage = async (channel, text) => {
  try {
    const slackBotToken = process.env.SLACK_BOT_TOKEN;
    if (!slackBotToken) {
      throw new Error('Slack bot token not configured');
    }
    
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${slackBotToken}`
      },
      body: JSON.stringify({
        channel,
        text
      })
    });
    
    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }
    
    return data;
  } catch (error) {
    console.error('Error sending Slack message:', error);
    throw error;
  }
};

// Validate and sanitize input
const validateInput = (input) => {
  if (typeof input !== 'string') {
    return '';
  }
  return input.replace(/<script[^>]*>.*?<\/script>/gi, '')
              .replace(/<[^>]*>/g, '')
              .trim();
};

// Main handler
exports.handler = async (event) => {
  try {
    // Validate HTTP method
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block'
        },
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    // Parse request body with error handling
    let body;
    try {
      body = event.body ? 
        (event.isBase64Encoded ? 
          JSON.parse(Buffer.from(event.body, 'base64').toString()) : 
          JSON.parse(event.body)) : 
        {};
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block'
        },
        body: JSON.stringify({ error: 'Invalid request body' })
      };
    }
    
    // Verify Slack request signature
    if (!verifySlackRequest(event)) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block'
        },
        body: JSON.stringify({ error: 'Invalid request signature' })
      };
    }
    
    // Process Slack event
    return await processSlackEvent(body);
  } catch (error) {
    console.error('Error processing Slack request:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};