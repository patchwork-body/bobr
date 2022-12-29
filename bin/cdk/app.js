import { App } from "aws-cdk-lib";
import { DynamoDBStack } from "./stacks/dynamodb/dynamodb.stack";
const app = new App();
new DynamoDBStack(app, "DynamoDBStack");
app.synth();
//# sourceMappingURL=app.js.map