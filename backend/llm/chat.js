const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { Client } = require('@opensearch-project/opensearch');
const { defaultProvider } = require('@aws-sdk/credential-provider-node');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

// Initialize clients
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });

// Initialize OpenSearch client
const createOpenSearchClient = () => {
  const domain = process.env.OPENSEARCH_DOMAIN;
  if (!domain) {
    throw new Error('OpenSearch domain endpoint not configured');
  }
  
  return new Client({
    node: `https://${domain}`,
    Connection: require('agentkeepalive'),
    awsCredentials: {
      credentials: defaultProvider()
    }
  });
};

// Vector search function
const searchVectorStore = async (query, openSearchClient) => {
  try {
    // Convert query to vector embedding using Bedrock
    const embedding = await getEmbedding(query);
    
    // Search OpenSearch with vector query
    const response = await openSearchClient.search({
      index: 'documents',
      body: {
        query: {
          knn: {
            vector_field: {
              vector: embedding,
              k: 5
            }
          }
        }
      }
    });
    
    return response.body.hits.hits.map(hit => ({
      id: hit._id,
      score: hit._score,
      content: hit._source.content,
      metadata: hit._source.metadata
    }));
  } catch (error) {
    console.error('Vector search error:', error);
    return [];
  }
};

// Get embedding from Bedrock
const getEmbedding = async (text) => {
  try {
    const params = {
      modelId: 'amazon.titan-embed-text-v1',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inputText: text
      })
    };
    
    const command = new InvokeModelCommand(params);
    const response = await bedrockClient.send(command);
    
    const responseBody = JSON.parse(Buffer.from(response.body).toString());
    return responseBody.embedding;
  } catch (error) {
    console.error('Error getting embedding:', error);
    throw error;
  }
};

// Retrieve document from S3
const getDocumentFromS3 = async (documentId) => {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.DOCUMENT_BUCKET,
      Key: documentId
    });
    
    const response = await s3Client.send(command);
    const streamToString = (stream) => new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
    
    return await streamToString(response.Body);
  } catch (error) {
    console.error('Error retrieving document:', error);
    return null;
  }
};

// Generate response from Bedrock
const generateResponse = async (prompt, context) => {
  try {
    const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-v2';
    
    let params;
    if (modelId.includes('claude')) {
      params = {
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          prompt: `\n\nHuman: ${context}\n\n${prompt}\n\nAssistant:`,
          max_tokens_to_sample: 2000,
          temperature: 0.7,
          top_k: 250,
          top_p: 0.9,
        })
      };
    } else {
      // Handle other model formats (e.g., Amazon Titan)
      params = {
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          inputText: `Context: ${context}\n\nQuestion: ${prompt}`,
          textGenerationConfig: {
            maxTokenCount: 2000,
            temperature: 0.7,
            topP: 0.9,
          }
        })
      };
    }
    
    const command = new InvokeModelCommand(params);
    const response = await bedrockClient.send(command);
    
    const responseBody = JSON.parse(Buffer.from(response.body).toString());
    return modelId.includes('claude') ? responseBody.completion : responseBody.results[0].outputText;
  } catch (error) {
    console.error('Error generating response:', error);
    return 'I encountered an error while processing your request.';
  }
};

// Validate and sanitize input
const validateInput = (input) => {
  if (typeof input !== 'string') {
    throw new Error('Invalid input type');
  }
  // Remove potential XSS characters
  return input.replace(/<script[^>]*>.*?<\/script>/gi, '')
              .replace(/<[^>]*>/g, '')
              .trim();
};

// Main handler
exports.handler = async (event) => {
  try {
    // Validate request origin and method
    const origin = event.headers?.origin || event.headers?.Origin;
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
    
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
        },
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    // Parse and validate request body
    let body;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
        },
        body: JSON.stringify({ error: 'Invalid JSON' })
      };
    }
    
    const { prompt } = body;
    
    if (!prompt) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
        },
        body: JSON.stringify({ error: 'Prompt is required' })
      };
    }
    
    // Validate and sanitize prompt
    const sanitizedPrompt = validateInput(prompt);
    if (!sanitizedPrompt) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
        },
        body: JSON.stringify({ error: 'Invalid prompt' })
      };
    }
    
    // Initialize OpenSearch client
    const openSearchClient = createOpenSearchClient();
    
    // Search for relevant documents
    const searchResults = await searchVectorStore(sanitizedPrompt, openSearchClient);
    
    // Build context from search results
    let context = '';
    if (searchResults.length > 0) {
      context = 'Here is some relevant information:\n\n';
      for (const result of searchResults) {
        if (result.metadata && result.metadata.s3Key) {
          const document = await getDocumentFromS3(result.metadata.s3Key);
          if (document) {
            context += `Document: ${result.metadata.title || result.metadata.s3Key}\n${document}\n\n`;
          }
        } else {
          context += `${result.content}\n\n`;
        }
      }
    }
    
    // Generate response
    const response = await generateResponse(sanitizedPrompt, context);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      },
      body: JSON.stringify({
        response: validateInput(response),
        sources: searchResults.map(result => ({
          id: validateInput(result.id),
          title: validateInput(result.metadata?.title || result.id),
          score: result.score
        }))
      })
    };
  } catch (error) {
    console.error('Error processing request:', error);
    const origin = event.headers?.origin || event.headers?.Origin;
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};