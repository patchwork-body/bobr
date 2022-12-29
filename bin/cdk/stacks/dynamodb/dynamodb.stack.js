import { Stack } from "aws-cdk-lib";
import { Table, AttributeType } from "aws-cdk-lib/aws-dynamodb";
export class DynamoDBStack extends Stack {
    constructor(scope, id) {
        super(scope, id);
        new Table(this, 'main', { partitionKey: { name: 'pk', type: AttributeType.STRING } });
        new Table(this, 'sessions', { partitionKey: { name: 'pk', type: AttributeType.STRING } });
    }
}
//# sourceMappingURL=dynamodb.stack.js.map