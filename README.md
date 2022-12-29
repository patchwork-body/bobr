# bobr - cli tool for snobs

### Template Examples

** DynamoDB Single Table **
```toml
[dynamodb.table.main]
partition_key = {name = "pk", type = "String" }
sorting_key = { name = "sk", type = "String" }

[dynamodb.seeds]
folder = "dynamodb/seeds"
```

