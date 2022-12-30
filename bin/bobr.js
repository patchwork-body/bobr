#!/usr/bin/env node
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync } from 'node:fs';
import { parse } from 'toml';
import { Project } from 'ts-morph';
import invariant from 'tiny-invariant';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { pino } from 'pino';
import chalk from 'chalk';
const logger = pino({
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true
        },
    },
});
const attributeType = {
    string: 'AttributeType.STRING',
    number: 'AttributeType.NUMBER',
    binary: 'AttributeType.BINARY',
};
const utils = {
    tableEntires: (bobrFile) => Object.entries(bobrFile.dynamodb.table),
    lambdaEntires: (bobrFile) => Object.entries(bobrFile.lambda).map(([url, config]) => [url, Object.assign(Object.assign({}, config), {
            path: config.handler.split('/').slice(0, -1).join('/'),
            handler: config.handler.split('.').at(-1),
        })]),
};
const dockerComposeTemplates = {
    dynamodb: `
  dynamodb:
    image: amazon/dynamodb-local
    ports:
      - 8000:8000
  `,
};
const cdkLocal = (bobrFile, rootDir) => {
    const localDir = rootDir.createDirectory('local');
    const dockerComposeFile = localDir.createSourceFile('docker-compose.yaml', `
version: '3.7'
services:
  ${bobrFile.dynamodb ? dockerComposeTemplates.dynamodb : ''}
`, { overwrite: true });
    let dynamoDBSetupFile;
    if (bobrFile.dynamodb) {
        const dynamodbDir = localDir.createDirectory('dynamodb');
        dynamoDBSetupFile = dynamodbDir.createSourceFile('dynamodb.setup.ts', '', { overwrite: true });
        dynamoDBSetupFile.addStatements('#!/usr/bin/env node');
        dynamoDBSetupFile.addImportDeclaration({ moduleSpecifier: '@aws-sdk/client-dynamodb', namedImports: ['DynamoDB'] });
        dynamoDBSetupFile.addImportDeclaration({ moduleSpecifier: 'aws-cdk-lib/aws-dynamodb', namedImports: ['AttributeType'] });
        dynamoDBSetupFile.addStatements(`const dynamoDBClient = new DynamoDB({region: '${bobrFile.aws.region}', endpoint: 'http://localhost:8000', apiVersion: '2012-08-10' });`);
        const tables = utils.tableEntires(bobrFile);
        tables.forEach(([tableName, schema]) => {
            dynamoDBSetupFile === null || dynamoDBSetupFile === void 0 ? void 0 : dynamoDBSetupFile.addStatements(`await dynamoDBClient.deleteTable({ TableName: '${tableName}' });`);
            dynamoDBSetupFile === null || dynamoDBSetupFile === void 0 ? void 0 : dynamoDBSetupFile.addStatements(`await dynamoDBClient.createTable({
        TableName: '${tableName}',
        AttributeDefinitions: [
          {AttributeName: '${schema.partition_key.name}', AttributeType: ${attributeType[schema.partition_key.type]}}
          ${schema.sort_key ? `, {AttributeName: '${schema.sort_key.name}', AttributeType: ${attributeType[schema.sort_key.type]}}` : ''}
        ],
        KeySchema: [
          {AttributeName: '${schema.partition_key.name}', KeyType: 'HASH'}
          ${schema.sort_key ? `, {AttributeName: '${schema.sort_key.name}', KeyType: 'RANGE'}` : ''}
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1,
        },
        StreamSpecification: {
          StreamEnabled: ${bobrFile.dynamodb.streams ? 'true' : 'false'},
        }
      })`);
        });
        dynamoDBSetupFile.formatText();
    }
    return { dockerComposeFilePath: dockerComposeFile.getFilePath(), dynamoDBSetupFilePath: dynamoDBSetupFile === null || dynamoDBSetupFile === void 0 ? void 0 : dynamoDBSetupFile.getFilePath() };
};
const cdkStacks = (bobrFile, rootDir) => {
    const cdkDir = rootDir.createDirectory('cdk');
    const cdkApp = cdkDir.createSourceFile('app.ts', '', { overwrite: true });
    cdkApp.addStatements('#!/usr/bin/env node');
    cdkApp.addImportDeclaration({ moduleSpecifier: 'aws-cdk-lib', namedImports: ['App'] });
    cdkApp.addStatements('const app = new App();');
    const stackDir = cdkDir.createDirectory('stacks');
    if (bobrFile.dynamodb) {
        const dynamodbDir = stackDir.createDirectory('dynamodb');
        const dynamodbStack = dynamodbDir.createSourceFile('dynamodb.stack.ts', '', { overwrite: true });
        dynamodbStack.addImportDeclaration({ moduleSpecifier: 'aws-cdk-lib', namedImports: ['Stack'] });
        dynamodbStack.addImportDeclaration({ moduleSpecifier: 'constructs', namedImports: ['Construct'] });
        dynamodbStack.addImportDeclaration({ moduleSpecifier: 'aws-cdk-lib/aws-dynamodb', namedImports: ['Table', 'AttributeType'] });
        const stackClass = dynamodbStack.addClass({ name: 'DynamoDBStack', extends: 'Stack', isExported: true });
        const constructor = stackClass.addConstructor({ parameters: [{ name: 'scope', type: 'Construct' }, { name: 'id', type: 'string' }] });
        constructor.addStatements('super(scope, id);');
        const tables = utils.tableEntires(bobrFile);
        tables.forEach(([tableName, schema]) => {
            constructor.addStatements(`new Table(this, '${tableName}', {
        partitionKey: {name: '${schema.partition_key.name}', type: ${attributeType[schema.partition_key.type]}}
        ${schema.sort_key ? `, sortKey: {name: '${schema.sort_key.name}', type: ${attributeType[schema.sort_key.type]}}` : ''}
      });`);
        });
        cdkApp.addImportDeclaration({ moduleSpecifier: './stacks/dynamodb/dynamodb.stack', namedImports: ['DynamoDBStack'] });
        cdkApp.addStatements('new DynamoDBStack(app, "DynamoDBStack");');
    }
    if (bobrFile.lambda) {
        const lambdaDir = stackDir.createDirectory('lambda');
        const lambdaStack = lambdaDir.createSourceFile('lambda.stack.ts', '', { overwrite: true });
        lambdaStack.addImportDeclaration({ moduleSpecifier: 'aws-cdk-lib', namedImports: ['Stack'] });
        lambdaStack.addImportDeclaration({ moduleSpecifier: 'constructs', namedImports: ['Construct'] });
        lambdaStack.addImportDeclaration({ moduleSpecifier: 'aws-cdk-lib/aws-lambda', namedImports: ['Function', 'Code', 'Runtime'] });
        const stackClass = lambdaStack.addClass({ name: 'LambdaStack', extends: 'Stack', isExported: true });
        const constructor = stackClass.addConstructor({ parameters: [{ name: 'scope', type: 'Construct' }, { name: 'id', type: 'string' }] });
        constructor.addStatements('super(scope, id);');
        const lambdas = utils.lambdaEntires(bobrFile);
        lambdas.forEach(([lambdaName, lambda]) => {
            constructor.addStatements(`new Function(this, '${lambdaName}', {
        code: Code.fromAsset('${lambda.path}'),
        handler: '${lambda.handler}',
        runtime: Runtime.NODEJS_18_X
      });`);
        });
        cdkApp.addImportDeclaration({ moduleSpecifier: './stacks/lambda/lambda.stack', namedImports: ['LambdaStack'] });
        cdkApp.addStatements('new LambdaStack(app, "LambdaStack");');
    }
    cdkApp.addStatements('app.synth();');
    return {};
};
const cdk = (bobrFile, rootDir) => {
    invariant(bobrFile.aws, 'aws is required in bobr.toml');
    invariant(bobrFile.aws.region, 'aws.region is required in bobr.toml');
    return Object.assign(Object.assign({}, cdkLocal(bobrFile, rootDir)), cdkStacks(bobrFile, rootDir));
};
yargs(hideBin(process.argv))
    .command('dev', 'start local dynamodb', (yargs) => yargs, () => {
    const bobrFile = parse(readFileSync('bobr.toml', 'utf8'));
    const project = new Project();
    const rootDir = project.createDirectory('.bobr');
    const { dockerComposeFilePath, dynamoDBSetupFilePath } = cdk(bobrFile, rootDir);
    project.saveSync();
    logger.info(chalk `{green.bold Starting local dynamodb...}`);
    execSync('docker-compose up --build -d', { cwd: path.dirname(dockerComposeFilePath) });
    logger.info(chalk `{green.bold Creating tables...}`);
    if (dynamoDBSetupFilePath) {
        execSync(`ts-node --esm ${dynamoDBSetupFilePath}`);
    }
    logger.info(chalk `{green.bold Local dynamodb started!}`);
})
    .command('gen', 'Generate', (yargs) => yargs, () => {
    const bobrFile = parse(readFileSync('bobr.toml', 'utf8'));
    const project = new Project();
    const rootDir = project.createDirectory('.bobr');
    cdk(bobrFile, rootDir);
    project.saveSync();
})
    .parse();
//# sourceMappingURL=bobr.js.map