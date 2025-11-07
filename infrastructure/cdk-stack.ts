import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class SlacksterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC for OpenSearch
    const vpc = new ec2.Vpc(this, 'SlacksterVpc', {
      maxAzs: 2,
    });

    // S3 Bucket for document storage
    const documentBucket = new s3.Bucket(this, 'DocumentBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // OpenSearch for vector storage
    const openSearchDomain = new opensearch.Domain(this, 'VectorStore', {
      version: opensearch.EngineVersion.OPENSEARCH_2_5,
      capacity: {
        dataNodes: 2,
        dataNodeInstanceType: 't3.small.search',
      },
      ebs: {
        volumeSize: 10,
      },
      vpc,
      zoneAwareness: {
        enabled: true,
      },
      enforceHttps: true,
      nodeToNodeEncryption: true,
      encryptionAtRest: {
        enabled: true,
      },
    });

    // Cognito User Pool for authentication
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
    });

    const userPoolClient = userPool.addClient('app-client', {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });

    // IAM Role for Lambda to access Bedrock
    const bedrockRole = new iam.Role(this, 'BedrockAccessRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    bedrockRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: ['*'],
    }));

    // Lambda functions
    const chatLambda = new lambda.Function(this, 'ChatFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'chat.handler',
      code: lambda.Code.fromAsset('backend/llm'),
      environment: {
        BEDROCK_MODEL_ID: 'anthropic.claude-v2',
        OPENSEARCH_DOMAIN: openSearchDomain.domainEndpoint,
        DOCUMENT_BUCKET: documentBucket.bucketName,
      },
      role: bedrockRole,
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
    });

    const slackLambda = new lambda.Function(this, 'SlackFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'slack.handler',
      code: lambda.Code.fromAsset('backend/slack'),
      environment: {
        CHAT_FUNCTION_NAME: chatLambda.functionName,
      },
      timeout: cdk.Duration.minutes(1),
      memorySize: 256,
    });

    // Grant permissions
    documentBucket.grantReadWrite(chatLambda);
    chatLambda.grantInvoke(slackLambda);

    // API Gateway
    const api = new apigateway.RestApi(this, 'SlacksterApi', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // API Gateway authorizer with Cognito
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'SlacksterAuthorizer', {
      cognitoUserPools: [userPool],
    });

    // Chat endpoint
    const chatResource = api.root.addResource('chat');
    chatResource.addMethod('POST', new apigateway.LambdaIntegration(chatLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Slack endpoint (no Cognito auth - uses Slack signing secret)
    const slackResource = api.root.addResource('slack');
    slackResource.addMethod('POST', new apigateway.LambdaIntegration(slackLambda));

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });
    
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });
    
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
    });
    
    new cdk.CfnOutput(this, 'DocumentBucketName', {
      value: documentBucket.bucketName,
    });
    
    new cdk.CfnOutput(this, 'OpenSearchDomainEndpoint', {
      value: openSearchDomain.domainEndpoint,
    });
  }
}