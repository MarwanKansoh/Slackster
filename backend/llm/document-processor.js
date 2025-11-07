const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { Client } = require('@opensearch-project/opensearch');
const { defaultProvider } = require('@aws-sdk/credential-provider-node');

// Initialize clients
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

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

// Process document chunks
const processDocumentChunks = async (chunks, metadata, openSearchClient) => {
  const results = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    try {
      // Get embedding for chunk
      const embedding = await getEmbedding(chunk);
      
      // Store in OpenSearch
      const response = await openSearchClient.index({
        index: 'documents',
        body: {
          content: chunk,
          vector_field: embedding,
          metadata: {
            ...metadata,
            chunkIndex: i,
            totalChunks: chunks.length
          }
        }
      });
      
      results.push({
        id: response.body._id,
        status: 'indexed'
      });
    } catch (error) {
      console.error(`Error processing chunk ${i}:`, error);
      results.push({
        chunkIndex: i,
        status: 'error',
        error: error.message
      });
    }
  }
  
  return results;
};

// Split text into chunks
const splitIntoChunks = (text, maxChunkSize = 1000) => {
  const chunks = [];
  const paragraphs = text.split(/\n\s*\n/);
  
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed the chunk size, start a new chunk
    if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    
    currentChunk += paragraph + '\n\n';
  }
  
  // Add the last chunk if it's not empty
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
};

// Process document from S3
const processDocument = async (bucket, key, metadata = {}) => {
  try {
    // Get document from S3
    const getCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const response = await s3Client.send(getCommand);
    
    // Convert stream to text
    const streamToString = (stream) => new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
    
    const text = await streamToString(response.Body);
    
    // Split into chunks
    const chunks = splitIntoChunks(text);
    
    // Initialize OpenSearch client
    const openSearchClient = createOpenSearchClient();
    
    // Process chunks
    const results = await processDocumentChunks(chunks, {
      ...metadata,
      s3Bucket: bucket,
      s3Key: key
    }, openSearchClient);
    
    return {
      documentId: key,
      totalChunks: chunks.length,
      processedChunks: results.filter(r => r.status === 'indexed').length,
      failedChunks: results.filter(r => r.status === 'error').length,
      results
    };
  } catch (error) {
    console.error('Error processing document:', error);
    throw error;
  }
};

// Validate and sanitize input
const validateInput = (input) => {
  if (typeof input !== 'string') {
    throw new Error('Invalid input type');
  }
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
    
    const { bucket, key, metadata } = body;
    
    if (!bucket || !key) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
        },
        body: JSON.stringify({ error: 'Bucket and key are required' })
      };
    }
    
    // Validate and sanitize inputs
    const sanitizedBucket = validateInput(bucket);
    const sanitizedKey = validateInput(key);
    
    // Process document
    const result = await processDocument(sanitizedBucket, sanitizedKey, metadata);
    
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
      body: JSON.stringify(result)
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